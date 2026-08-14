use flate2::read::GzDecoder;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::{get_codecs, get_probe};
use tauri::{AppHandle, Emitter, State};
use tokio::fs::File as TokioFile;
use tokio::process::Command;
use tokio_util::io::ReaderStream;
use tokio_util::sync::CancellationToken;

const RESOURCE_EVENT: &str = "transcription-resource-progress";
const MAX_MEDIA_BYTES: u64 = 512 * 1024 * 1024;
static MEDIA_FETCHER_SETUP_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static MEDIA_FETCHER_READY: tokio::sync::OnceCell<PathBuf> = tokio::sync::OnceCell::const_new();

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn configure_hidden_command(command: &mut Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
}

#[derive(Default)]
pub struct TranscriptionDownloadState {
    downloads: Mutex<BTreeMap<String, CancellationToken>>,
}

fn model_file(id: &str) -> Result<PathBuf, String> {
    let file = match id {
        "fast" => "ggml-base.bin",
        "standard" => "ggml-small.bin",
        "accurate" => "ggml-medium.bin",
        _ => return Err("Unsupported transcription model".to_string()),
    };
    let path = resource_root().join("models").join(file);
    if path.is_file() {
        Ok(path)
    } else {
        Err("Download a local transcription model first".to_string())
    }
}

fn runtime_executable(runtime: &str) -> Result<PathBuf, String> {
    if !matches!(runtime, "native" | "cuda") {
        return Err("Choose a local transcription engine first".to_string());
    }
    let root = resource_root().join("runtimes").join(runtime);
    let name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    let mut stack = vec![root.clone()];
    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .map_err(|error| format!("Local transcription engine is unavailable: {error}"))?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
            } else if entry_path.file_name().and_then(|name| name.to_str()) == Some(name) {
                return Ok(entry_path);
            }
        }
    }
    Err("Download the local transcription engine first".to_string())
}

fn audio_to_wav(input: &Path, output: &Path) -> Result<(), String> {
    let file = fs::File::open(input).map_err(|error| format!("Could not open audio: {error}"))?;
    let mut hint = Hint::new();
    if let Some(extension) = input.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut probed = get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| format!("Could not decode audio: {error}"))?;
    let track = probed
        .format
        .tracks()
        .iter()
        // AAC-in-MP4 may expose its channel layout only after the first frame
        // is decoded, while its sample rate is already present on the track.
        .find(|track| track.codec_params.sample_rate.is_some())
        .ok_or_else(|| "Audio has no playable track".to_string())?;
    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let sample_rate = codec_params
        .sample_rate
        .ok_or_else(|| "Audio has no sample-rate information".to_string())?;
    let mut decoder = get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|error| format!("Could not create audio decoder: {error}"))?;
    let mut writer = hound::WavWriter::create(
        output,
        hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|error| format!("Could not create temporary audio: {error}"))?;
    let source_step = sample_rate as f64 / 16_000_f64;
    let mut previous_sample: Option<f32> = None;
    let mut source_index = 0_u64;
    let mut next_output_position = 0_f64;
    loop {
        let packet = match probed.format.next_packet() {
            Ok(packet) if packet.track_id() == track_id => packet,
            Ok(_) => continue,
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(error) => return Err(format!("Could not read audio: {error}")),
        };
        let decoded = decoder
            .decode(&packet)
            .map_err(|error| format!("Could not decode audio: {error}"))?;
        let channels = decoded.spec().channels.count();
        if channels == 0 {
            return Err("Decoded audio has no channels".to_string());
        }
        let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        samples.copy_interleaved_ref(decoded);
        for frame in samples.samples().chunks(channels) {
            let average = frame.iter().copied().sum::<f32>() / channels as f32;
            if let Some(previous) = previous_sample {
                while next_output_position <= source_index as f64 {
                    let fraction =
                        (next_output_position - (source_index - 1) as f64).clamp(0.0, 1.0) as f32;
                    let resampled = previous + (average - previous) * fraction;
                    writer
                        .write_sample((resampled.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                        .map_err(|error| format!("Could not write temporary audio: {error}"))?;
                    next_output_position += source_step;
                }
            } else {
                writer
                    .write_sample((average.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .map_err(|error| format!("Could not write temporary audio: {error}"))?;
                next_output_position = source_step;
            }
            previous_sample = Some(average);
            source_index += 1;
        }
    }
    writer
        .finalize()
        .map_err(|error| format!("Could not finish temporary audio: {error}"))
}

async fn transcribe_openai_compatible(
    config: &super::TranscriptionProviderConfig,
    audio: &Path,
) -> Result<String, String> {
    let size = tokio::fs::metadata(audio)
        .await
        .map_err(|error| format!("Could not read audio: {error}"))?
        .len();
    let file = TokioFile::open(audio)
        .await
        .map_err(|error| format!("Could not read audio: {error}"))?;
    let file_name = audio
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("audio.bin")
        .to_string();
    let part = reqwest::multipart::Part::stream_with_length(
        reqwest::Body::wrap_stream(ReaderStream::new(file)),
        size,
    )
    .file_name(file_name);
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", config.model.clone());
    let response = reqwest::Client::new()
        .post(&config.endpoint)
        .bearer_auth(config.api_key.trim())
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("Transcription request failed: {error}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid transcription response: {error}"))?;
    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("The transcription service returned an error")
            .to_string());
    }
    body.get("text")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "The transcription response did not contain text".to_string())
}

async fn transcribe_deepgram(
    config: &super::TranscriptionProviderConfig,
    audio: &Path,
) -> Result<String, String> {
    let file = TokioFile::open(audio)
        .await
        .map_err(|error| format!("Could not read audio: {error}"))?;
    let response = reqwest::Client::new()
        .post(&config.endpoint)
        .header("Authorization", format!("Token {}", config.api_key.trim()))
        .header("Content-Type", "application/octet-stream")
        .query(&[("model", config.model.as_str()), ("smart_format", "true")])
        .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
        .send()
        .await
        .map_err(|error| format!("Transcription request failed: {error}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|error| format!("Invalid transcription response: {error}"))?;
    if !status.is_success() {
        return Err(body
            .get("err_msg")
            .and_then(Value::as_str)
            .unwrap_or("The transcription service returned an error")
            .to_string());
    }
    body.pointer("/results/channels/0/alternatives/0/transcript")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| "The transcription response did not contain text".to_string())
}

async fn transcribe_assemblyai(
    config: &super::TranscriptionProviderConfig,
    audio: &Path,
) -> Result<String, String> {
    let file = TokioFile::open(audio)
        .await
        .map_err(|error| format!("Could not read audio: {error}"))?;
    let client = reqwest::Client::new();
    let upload = client
        .post("https://api.assemblyai.com/v2/upload")
        .header("Authorization", config.api_key.trim())
        .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
        .send()
        .await
        .map_err(|error| format!("Audio upload failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Audio upload failed: {error}"))?;
    let upload_body: Value = upload
        .json()
        .await
        .map_err(|error| format!("Invalid upload response: {error}"))?;
    let audio_url = upload_body
        .get("upload_url")
        .and_then(Value::as_str)
        .ok_or_else(|| "Audio upload did not return a URL".to_string())?;
    let create = client
        .post(&config.endpoint)
        .header("Authorization", config.api_key.trim())
        .json(&json!({"audio_url": audio_url, "speech_model": config.model}))
        .send()
        .await
        .map_err(|error| format!("Transcription request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Transcription request failed: {error}"))?;
    let mut body: Value = create
        .json()
        .await
        .map_err(|error| format!("Invalid transcription response: {error}"))?;
    let id = body
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Transcription service did not return a job ID".to_string())?;
    for _ in 0..120 {
        tokio::time::sleep(Duration::from_secs(2)).await;
        body = client
            .get(format!("{}/{}", config.endpoint.trim_end_matches('/'), id))
            .header("Authorization", config.api_key.trim())
            .send()
            .await
            .map_err(|error| format!("Transcription status request failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Transcription status request failed: {error}"))?
            .json()
            .await
            .map_err(|error| format!("Invalid transcription status response: {error}"))?;
        match body.get("status").and_then(Value::as_str) {
            Some("completed") => {
                return body
                    .get("text")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .ok_or_else(|| "The transcription response did not contain text".to_string())
            }
            Some("error") => {
                return Err(body
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("Transcription failed")
                    .to_string())
            }
            _ => {}
        }
    }
    Err("Transcription timed out".to_string())
}

async fn transcribe_local(
    runtime: &str,
    model: &str,
    audio: &Path,
    locale: &str,
) -> Result<String, String> {
    let executable = runtime_executable(runtime)?;
    let model_path = model_file(model)?;
    let workspace = audio
        .parent()
        .ok_or_else(|| "Audio workspace is unavailable".to_string())?;
    let output_base = workspace.join("transcript");
    let wav = workspace.join("audio.wav");
    audio_to_wav(audio, &wav)?;
    let mut command = Command::new(executable);
    configure_hidden_command(&mut command);
    command.arg("-m").arg(model_path);
    if let Some(language) = local_whisper_language(locale) {
        command.arg("-l").arg(language);
    }
    let output = command
        .arg("-f")
        .arg(wav)
        .arg("-otxt")
        .arg("-of")
        .arg(&output_base)
        .arg("-nt")
        .arg("-np")
        .output()
        .await
        .map_err(|error| format!("Could not start local transcription: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let transcript = tokio::fs::read_to_string(output_base.with_extension("txt"))
        .await
        .map_err(|error| format!("Could not read local transcription result: {error}"))?;
    usable_local_transcript(&transcript)
}

fn local_whisper_language(locale: &str) -> Option<&'static str> {
    match locale {
        "zh" => Some("zh"),
        "en" => Some("en"),
        _ => None,
    }
}

fn usable_local_transcript(value: &str) -> Result<String, String> {
    let transcript = value.trim();
    let normalized = transcript.to_ascii_lowercase();
    if transcript.is_empty()
        || normalized.contains("speaking in foreign language")
        || normalized.contains("[blank_audio]")
    {
        return Err(
            "Local transcription did not produce usable speech. Try the API mode or a clearer audio source."
                .to_string(),
        );
    }
    Ok(transcript.to_string())
}

pub async fn transcribe_media_url(
    url: &reqwest::Url,
    mode: &str,
    config: &super::TranscriptionSettingsConfig,
    locale: &str,
) -> Result<String, String> {
    if let Some(captions) = download_media_captions(url, locale).await? {
        return Ok(captions);
    }
    if mode == "local" {
        if config.active_runtime.trim().is_empty() {
            return Err("Choose a local transcription engine first".to_string());
        }
        if config.active_model.trim().is_empty() {
            return Err("Choose a local transcription model first".to_string());
        }
        runtime_executable(&config.active_runtime)?;
        model_file(&config.active_model)?;
        let (_workspace, audio) = download_media_audio(url).await?;
        return transcribe_local(&config.active_runtime, &config.active_model, &audio, locale)
            .await;
    }
    let provider = config
        .providers
        .get(&config.active_provider)
        .ok_or_else(|| "Configure a speech recognition service first".to_string())?;
    if provider.api_key.trim().is_empty() {
        return Err("Configure a speech recognition API key first".to_string());
    }
    if provider.endpoint.trim().is_empty() {
        return Err("Configure a speech recognition API URL first".to_string());
    }
    if provider.model.trim().is_empty() {
        return Err("Choose a speech recognition model first".to_string());
    }
    let endpoint = reqwest::Url::parse(provider.endpoint.trim())
        .map_err(|_| "Configure a valid speech recognition API URL first".to_string())?;
    if !matches!(endpoint.scheme(), "http" | "https") {
        return Err("The speech recognition API URL must use HTTP or HTTPS".to_string());
    }
    let (_workspace, audio) = download_media_audio(url).await?;
    match provider.protocol.as_str() {
        "deepgram" => transcribe_deepgram(provider, &audio).await,
        "assemblyai" => transcribe_assemblyai(provider, &audio).await,
        _ => transcribe_openai_compatible(provider, &audio).await,
    }
}

/// Transcribe a local audio/video file using the configured engine.
///
/// Unlike `transcribe_media_url`, the media is already on disk — no download
/// step. The file is fed straight into the local runtime or uploaded to the
/// configured speech-recognition API.
pub async fn transcribe_local_media_file(
    path: &std::path::Path,
    mode: &str,
    config: &super::TranscriptionSettingsConfig,
    locale: &str,
) -> Result<String, String> {
    if mode == "local" {
        if config.active_runtime.trim().is_empty() {
            return Err("Choose a local transcription engine first".to_string());
        }
        if config.active_model.trim().is_empty() {
            return Err("Choose a local transcription model first".to_string());
        }
        runtime_executable(&config.active_runtime)?;
        model_file(&config.active_model)?;
        return transcribe_local(&config.active_runtime, &config.active_model, path, locale).await;
    }
    let provider = config
        .providers
        .get(&config.active_provider)
        .ok_or_else(|| "Configure a speech recognition service first".to_string())?;
    if provider.api_key.trim().is_empty() {
        return Err("Configure a speech recognition API key first".to_string());
    }
    if provider.endpoint.trim().is_empty() {
        return Err("Configure a speech recognition API URL first".to_string());
    }
    if provider.model.trim().is_empty() {
        return Err("Choose a speech recognition model first".to_string());
    }
    match provider.protocol.as_str() {
        "deepgram" => transcribe_deepgram(provider, path).await,
        "assemblyai" => transcribe_assemblyai(provider, path).await,
        _ => transcribe_openai_compatible(provider, path).await,
    }
}

#[derive(Clone, Copy)]
enum ArchiveKind {
    None,
    Zip,
    TarGz,
}

#[derive(Clone, Copy)]
struct ResourceSpec {
    id: &'static str,
    kind: &'static str,
    url: &'static str,
    file_name: &'static str,
    sha256: &'static str,
    expected_size: u64,
    archive: ArchiveKind,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResourceStatus {
    id: String,
    kind: String,
    installed: bool,
    downloading: bool,
    bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResourceProgress {
    id: String,
    kind: String,
    status: &'static str,
    percent: u32,
    downloaded_bytes: u64,
    total_bytes: u64,
    message: Option<String>,
}

fn resource_root() -> PathBuf {
    crate::app_data_dir().join("transcription")
}

pub fn supports_media_url(url: &reqwest::Url) -> bool {
    let host = url
        .host_str()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    [
        "youtube.com",
        "youtu.be",
        "bilibili.com",
        "b23.tv",
        "tiktok.com",
        "douyin.com",
        "iesdouyin.com",
        "xiaohongshu.com",
        "xhslink.com",
        "x.com",
        "twitter.com",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn is_douyin_url(url: &reqwest::Url) -> bool {
    let host = url
        .host_str()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    ["douyin.com", "iesdouyin.com"]
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn needs_fresh_browser_cookies(stderr: &[u8]) -> bool {
    let message = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    message.contains("fresh cookies") || message.contains("cookies are needed")
}

/// Return only browsers that appear to have a local profile. Cookie extraction
/// is used as a narrow retry for Douyin's fresh-session challenge; cookies stay
/// in the yt-dlp child process and are never exported or persisted by Coffee Note.
fn browser_cookie_sources() -> Vec<&'static str> {
    let mut sources = Vec::new();
    let mut add_if_present = |name: &'static str, path: PathBuf| {
        if path.is_dir() && !sources.contains(&name) {
            sources.push(name);
        }
    };

    #[cfg(target_os = "windows")]
    {
        if let Some(roaming) = dirs::config_dir() {
            add_if_present("firefox", roaming.join("Mozilla").join("Firefox"));
            add_if_present("opera", roaming.join("Opera Software").join("Opera Stable"));
        }
        if let Some(local) = dirs::data_local_dir() {
            add_if_present(
                "edge",
                local.join("Microsoft").join("Edge").join("User Data"),
            );
            add_if_present(
                "chrome",
                local.join("Google").join("Chrome").join("User Data"),
            );
            add_if_present(
                "brave",
                local
                    .join("BraveSoftware")
                    .join("Brave-Browser")
                    .join("User Data"),
            );
            add_if_present("vivaldi", local.join("Vivaldi").join("User Data"));
        }
    }

    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        let support = home.join("Library").join("Application Support");
        add_if_present("firefox", support.join("Firefox"));
        add_if_present("chrome", support.join("Google").join("Chrome"));
        add_if_present("edge", support.join("Microsoft Edge"));
        add_if_present("brave", support.join("BraveSoftware").join("Brave-Browser"));
        add_if_present("vivaldi", support.join("Vivaldi"));
        add_if_present("opera", support.join("com.operasoftware.Opera"));
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            add_if_present("firefox", home.join(".mozilla").join("firefox"));
        }
        if let Some(config) = dirs::config_dir() {
            add_if_present("chrome", config.join("google-chrome"));
            add_if_present("chromium", config.join("chromium"));
            add_if_present("edge", config.join("microsoft-edge"));
            add_if_present("brave", config.join("BraveSoftware").join("Brave-Browser"));
            add_if_present("vivaldi", config.join("vivaldi"));
            add_if_present("opera", config.join("opera"));
        }
    }

    sources
}

fn chromium_browser_executables() -> Vec<(&'static str, PathBuf)> {
    let mut browsers = Vec::new();
    let mut add = |source: &'static str, path: PathBuf| {
        if path.is_file() {
            browsers.push((source, path));
        }
    };

    #[cfg(target_os = "windows")]
    {
        for root in [
            std::env::var_os("ProgramFiles(x86)"),
            std::env::var_os("ProgramFiles"),
            std::env::var_os("LOCALAPPDATA"),
        ]
        .into_iter()
        .flatten()
        .map(PathBuf::from)
        {
            add(
                "chrome",
                root.join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
            );
            add(
                "edge",
                root.join("Microsoft")
                    .join("Edge")
                    .join("Application")
                    .join("msedge.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        add(
            "chrome",
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        );
        add(
            "edge",
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        );
        add(
            "brave",
            PathBuf::from("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
        );
    }

    #[cfg(target_os = "linux")]
    for (source, path) in [
        ("chrome", "/usr/bin/google-chrome"),
        ("chrome", "/usr/bin/google-chrome-stable"),
        ("chromium", "/usr/bin/chromium"),
        ("chromium", "/usr/bin/chromium-browser"),
        ("edge", "/usr/bin/microsoft-edge"),
        ("edge", "/usr/bin/microsoft-edge-stable"),
        ("brave", "/usr/bin/brave-browser"),
    ] {
        add(source, PathBuf::from(path));
    }

    browsers
}

fn strip_caption_tags(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut inside_tag = false;
    for character in value.chars() {
        match character {
            '<' => inside_tag = true,
            '>' if inside_tag => inside_tag = false,
            _ if !inside_tag => output.push(character),
            _ => {}
        }
    }
    output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_caption_text(contents: &str) -> String {
    let mut lines = Vec::new();
    for line in contents.trim_start_matches('\u{feff}').lines() {
        let value = line.trim();
        if value.is_empty()
            || value.eq_ignore_ascii_case("WEBVTT")
            || value.eq_ignore_ascii_case("NOTE")
            || value.eq_ignore_ascii_case("STYLE")
            || value.eq_ignore_ascii_case("REGION")
            || value.contains("-->")
            || value.chars().all(|character| character.is_ascii_digit())
        {
            continue;
        }
        let cleaned = strip_caption_tags(value);
        if !cleaned.is_empty() && lines.last() != Some(&cleaned) {
            lines.push(cleaned);
        }
    }
    lines.join("\n")
}

fn caption_language_score(file_name: &str, locale: &str) -> u8 {
    let name = file_name.to_ascii_lowercase();
    let is_chinese = name.contains(".zh")
        || name.contains("-zh")
        || name.contains("_zh")
        || name.contains(".chi")
        || name.contains("ai-zh");
    let is_english = name.contains(".en")
        || name.contains("-en")
        || name.contains("_en")
        || name.contains(".eng");
    if locale == "zh" {
        if is_chinese {
            100
        } else if is_english {
            20
        } else {
            40
        }
    } else if is_english {
        100
    } else if is_chinese {
        20
    } else {
        40
    }
}

async fn download_media_captions(
    url: &reqwest::Url,
    locale: &str,
) -> Result<Option<String>, String> {
    if !supports_media_url(url) {
        return Ok(None);
    }
    let executable = ensure_media_fetcher().await?;
    let directory =
        std::env::temp_dir().join(format!("coffee-note-captions-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create caption workspace: {error}"))?;
    let guard = TempMediaDir(directory.clone());
    let template = directory.join("caption.%(ext)s");
    let mut command = Command::new(executable);
    configure_hidden_command(&mut command);
    let result = tokio::time::timeout(
        Duration::from_secs(45),
        command
            .arg("--no-playlist")
            .arg("--quiet")
            .arg("--no-warnings")
            .arg("--skip-download")
            .arg("--write-subs")
            .arg("--write-auto-subs")
            .arg("--sub-langs")
            .arg("all")
            .arg("--sub-format")
            .arg("vtt/srt/best")
            .arg("-o")
            .arg(&template)
            .arg(url.as_str())
            .output(),
    )
    .await;
    let Ok(Ok(output)) = result else {
        drop(guard);
        return Ok(None);
    };
    if !output.status.success() {
        drop(guard);
        return Ok(None);
    }

    let mut candidates = Vec::new();
    let entries = fs::read_dir(&directory).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "vtt" | "srt" | "ttml" | "srv3") {
            continue;
        }
        let text = fs::read_to_string(&path).unwrap_or_default();
        let parsed = parse_caption_text(&text);
        if !parsed.is_empty() {
            let score = caption_language_score(
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default(),
                locale,
            );
            candidates.push((score, parsed));
        }
    }
    drop(guard);
    Ok(candidates
        .into_iter()
        .max_by_key(|(score, text)| (*score, text.chars().count()))
        .map(|(_, text)| text))
}

fn media_fetcher_spec() -> Result<ResourceSpec, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe",
            file_name: "media-fetcher.exe",
            sha256: "52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8",
            expected_size: 18_226_085,
            archive: ArchiveKind::None,
        }),
        ("linux", "x86_64") => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_linux",
            file_name: "media-fetcher",
            sha256: "6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae",
            expected_size: 39_924_536,
            archive: ArchiveKind::None,
        }),
        ("linux", "aarch64") => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            url:
                "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_linux_aarch64",
            file_name: "media-fetcher",
            sha256: "b6ce97646773070d7a7ffd6bbbdcaecb47c48483909c54c915bf08a7a9b5e0b1",
            expected_size: 39_675_904,
            archive: ArchiveKind::None,
        }),
        ("macos", _) => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_macos",
            file_name: "media-fetcher",
            sha256: "498bd0dae17855c599d371d68ec5bafc439a9d8640e838be25c765a9792f261b",
            expected_size: 38_256_544,
            archive: ArchiveKind::None,
        }),
        _ => Err("Media links are not supported on this system".to_string()),
    }
}

async fn download_fixed_file(spec: ResourceSpec, target: &Path) -> Result<(), String> {
    if target.is_file() && verify_file(target, spec).is_ok() {
        return Ok(());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let partial = target.with_extension("part");
    let response = reqwest::Client::new()
        .get(spec.url)
        .header("User-Agent", "Coffee Note")
        .send()
        .await
        .map_err(|error| format!("Could not prepare media import: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Could not prepare media import: {error}"))?;
    if response
        .content_length()
        .is_some_and(|size| size > spec.expected_size + 1024 * 1024)
    {
        return Err("Media component is larger than expected".to_string());
    }
    let mut file = fs::File::create(&partial).map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut received = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Media component download failed: {error}"))?;
        received += chunk.len() as u64;
        if received > spec.expected_size + 1024 * 1024 {
            let _ = fs::remove_file(&partial);
            return Err("Media component is larger than expected".to_string());
        }
        file.write_all(&chunk).map_err(|error| error.to_string())?;
    }
    file.flush().map_err(|error| error.to_string())?;
    drop(file);
    verify_file(&partial, spec)?;
    if target.exists() {
        fs::remove_file(target).map_err(|error| error.to_string())?;
    }
    fs::rename(&partial, target).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(target, fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn ensure_media_fetcher() -> Result<PathBuf, String> {
    if let Some(target) = MEDIA_FETCHER_READY.get() {
        if target.is_file() {
            return Ok(target.clone());
        }
    }
    let _setup_guard = MEDIA_FETCHER_SETUP_LOCK.lock().await;
    if let Some(target) = MEDIA_FETCHER_READY.get() {
        if target.is_file() {
            return Ok(target.clone());
        }
    }
    let spec = media_fetcher_spec()?;
    let target = resource_root().join("tools").join(spec.file_name);
    download_fixed_file(spec, &target).await?;
    let _ = MEDIA_FETCHER_READY.set(target.clone());
    Ok(target)
}

/// Prepare the small, pinned media-import dependency in the background after
/// Coffee Note starts. Speech runtimes and models remain explicit user downloads.
pub(crate) async fn prepare_media_environment() -> Result<(), String> {
    ensure_media_fetcher().await.map(|_| ())
}

struct TempMediaDir(PathBuf);
impl Drop for TempMediaDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

async fn create_fresh_browser_cookie_session(
    url: &reqwest::Url,
) -> Result<(TempMediaDir, String), String> {
    let (browser_source, executable) = chromium_browser_executables()
        .into_iter()
        .next()
        .ok_or_else(|| "No Chromium browser is installed".to_string())?;
    let directory =
        std::env::temp_dir().join(format!("coffee-note-browser-{}", uuid::Uuid::new_v4()));
    let profile = directory.join("profile");
    fs::create_dir_all(&profile)
        .map_err(|error| format!("Could not create a temporary browser session: {error}"))?;
    let guard = TempMediaDir(directory);
    let mut command = Command::new(executable);
    configure_hidden_command(&mut command);
    command
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--disable-background-mode")
        .arg("--disable-component-update")
        .arg("--disable-extensions")
        .arg("--disable-features=LockProfileCookieDatabase")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg(format!("--user-data-dir={}", profile.to_string_lossy()))
        .arg("--virtual-time-budget=10000")
        .arg("--dump-dom")
        .arg(url.as_str())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(45), command.output())
        .await
        .map_err(|_| "Temporary browser session timed out".to_string())?
        .map_err(|error| format!("Could not start a temporary browser session: {error}"))?;
    if !output.status.success() {
        return Err("The temporary browser session could not load Douyin".to_string());
    }
    // Chromium may keep its cookie helper alive briefly after --dump-dom exits.
    // Probe the fresh profile until yt-dlp will be able to copy its database.
    let cookie_database_candidates = [
        profile.join("Default").join("Network").join("Cookies"),
        profile.join("Default").join("Cookies"),
    ];
    let cookie_probe = profile.join("cookie-readiness-probe");
    let mut ready = false;
    for _ in 0..40 {
        if let Some(database) = cookie_database_candidates
            .iter()
            .find(|candidate| candidate.is_file())
        {
            match fs::copy(database, &cookie_probe) {
                Ok(_) => {
                    let _ = fs::remove_file(&cookie_probe);
                    ready = true;
                    break;
                }
                Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {}
                Err(_) => {}
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    if !ready {
        return Err("The temporary browser did not release its cookie session".to_string());
    }
    Ok((
        guard,
        format!("{browser_source}:{}", profile.to_string_lossy()),
    ))
}

async fn download_media_audio_attempt(
    executable: &Path,
    template: &Path,
    url: &reqwest::Url,
    browser_cookie_source: Option<&str>,
) -> Result<Output, String> {
    let mut command = Command::new(executable);
    configure_hidden_command(&mut command);
    command
        .arg("--no-playlist")
        .arg("--quiet")
        .arg("--no-warnings")
        .arg("--max-filesize")
        .arg(MAX_MEDIA_BYTES.to_string())
        .arg("-f")
        .arg("bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio[ext=mp3]/bestaudio[ext=wav]/bestaudio[ext=flac]/bestaudio[ext=ogg]/bestaudio/best[vcodec^=h264][ext=mp4]/best[ext=mp4]/best")
        .arg("-o")
        .arg(template)
        .arg("--print")
        .arg("after_move:filepath");
    if let Some(browser) = browser_cookie_source {
        command.arg("--cookies-from-browser").arg(browser);
    }
    command.arg(url.as_str()).stdin(Stdio::null());
    command.kill_on_drop(true);
    tokio::time::timeout(Duration::from_secs(300), command.output())
        .await
        .map_err(|_| "Media import timed out".to_string())?
        .map_err(|error| format!("Could not start media import: {error}"))
}

async fn download_media_audio(url: &reqwest::Url) -> Result<(TempMediaDir, PathBuf), String> {
    if !supports_media_url(url) {
        return Err("This URL is not a supported media link".to_string());
    }
    let executable = ensure_media_fetcher().await?;
    let directory =
        std::env::temp_dir().join(format!("coffee-note-media-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create media workspace: {error}"))?;
    let guard = TempMediaDir(directory.clone());
    let template = directory.join("audio.%(ext)s");
    let mut output = download_media_audio_attempt(&executable, &template, url, None).await?;
    let retry_with_browser = !output.status.success()
        && is_douyin_url(url)
        && needs_fresh_browser_cookies(&output.stderr);
    if retry_with_browser {
        if let Ok((fresh_session, cookie_source)) = create_fresh_browser_cookie_session(url).await {
            let candidate =
                download_media_audio_attempt(&executable, &template, url, Some(&cookie_source))
                    .await?;
            output = candidate;
            drop(fresh_session);
        }
        if !output.status.success() {
            for browser in browser_cookie_sources() {
                let candidate =
                    download_media_audio_attempt(&executable, &template, url, Some(browser))
                        .await?;
                if candidate.status.success() {
                    output = candidate;
                    break;
                }
                output = candidate;
            }
        }
    }
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if retry_with_browser {
            return Err(format!(
                "Douyin still rejected the fresh local browser session. Open the link in Edge, Chrome, or Firefox, refresh it, then retry. Coffee Note does not store browser cookies.{}",
                if message.is_empty() {
                    String::new()
                } else {
                    format!(" Download detail: {message}")
                }
            ));
        }
        return Err(if message.is_empty() {
            "The media audio could not be downloaded".to_string()
        } else {
            message
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let printed = stdout.lines().last().unwrap_or_default().trim();
    let path = PathBuf::from(printed);
    let canonical_dir = directory
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let canonical_path = path
        .canonicalize()
        .map_err(|_| "Media import did not produce an audio file".to_string())?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Media import produced an unsafe output path".to_string());
    }
    let size = fs::metadata(&canonical_path)
        .map_err(|error| error.to_string())?
        .len();
    if size == 0 || size > MAX_MEDIA_BYTES {
        return Err("Downloaded media audio is empty or too large".to_string());
    }
    Ok((guard, canonical_path))
}

fn runtime_spec(id: &str) -> Option<ResourceSpec> {
    match (id, std::env::consts::OS, std::env::consts::ARCH) {
        ("native", "windows", "x86_64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip",
            file_name: "whisper-bin-x64.zip",
            sha256: "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a",
            expected_size: 8_194_445,
            archive: ArchiveKind::Zip,
        }),
        ("native", "linux", "x86_64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-x64.tar.gz",
            file_name: "whisper-bin-ubuntu-x64.tar.gz",
            sha256: "46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1",
            expected_size: 9_497_583,
            archive: ArchiveKind::TarGz,
        }),
        ("native", "linux", "aarch64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-arm64.tar.gz",
            file_name: "whisper-bin-ubuntu-arm64.tar.gz",
            sha256: "7e26fa6a36d9174d5c0bf033ccbc026c3b5e569e2ee787058241346ef5392719",
            expected_size: 4_572_842,
            archive: ArchiveKind::TarGz,
        }),
        ("cuda", "windows", "x86_64") => Some(ResourceSpec {
            id: "cuda",
            kind: "runtime",
            url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-cublas-12.4.0-bin-x64.zip",
            file_name: "whisper-cublas-12.4.0-bin-x64.zip",
            sha256: "443110ddaad70d4290ab2e77179e31cf712035bbc4fad56bb4519a90c917b39c",
            expected_size: 670_611_449,
            archive: ArchiveKind::Zip,
        }),
        _ => None,
    }
}

fn model_spec(id: &str) -> Option<ResourceSpec> {
    match id {
        "fast" => Some(ResourceSpec {
            id: "fast",
            kind: "model",
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true",
            file_name: "ggml-base.bin",
            sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
            expected_size: 147_951_465,
            archive: ArchiveKind::None,
        }),
        "standard" => Some(ResourceSpec {
            id: "standard",
            kind: "model",
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true",
            file_name: "ggml-small.bin",
            sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
            expected_size: 487_601_967,
            archive: ArchiveKind::None,
        }),
        "accurate" => Some(ResourceSpec {
            id: "accurate",
            kind: "model",
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true",
            file_name: "ggml-medium.bin",
            sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
            expected_size: 1_533_763_059,
            archive: ArchiveKind::None,
        }),
        _ => None,
    }
}

fn resource_spec(kind: &str, id: &str) -> Result<ResourceSpec, String> {
    match kind {
        "runtime" => runtime_spec(id),
        "model" => model_spec(id),
        _ => None,
    }
    .ok_or_else(|| format!("Unsupported transcription resource: {kind}:{id}"))
}

fn installed_path(spec: ResourceSpec) -> PathBuf {
    let base = resource_root().join(format!("{}s", spec.kind));
    match spec.archive {
        ArchiveKind::None => base.join(spec.file_name),
        _ => base.join(spec.id).join(".installed"),
    }
}

fn resource_bytes(spec: ResourceSpec) -> u64 {
    fs::metadata(installed_path(spec))
        .map(|meta| meta.len())
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_transcription_resources(
    state: State<'_, TranscriptionDownloadState>,
) -> Result<Vec<TranscriptionResourceStatus>, String> {
    let downloads = state
        .downloads
        .lock()
        .map_err(|_| "Download state is unavailable")?;
    let mut specs = vec![
        model_spec("fast").unwrap(),
        model_spec("standard").unwrap(),
        model_spec("accurate").unwrap(),
    ];
    if let Some(spec) = runtime_spec("native") {
        specs.push(spec);
    }
    if let Some(spec) = runtime_spec("cuda") {
        specs.push(spec);
    }
    Ok(specs
        .into_iter()
        .map(|spec| TranscriptionResourceStatus {
            id: spec.id.to_string(),
            kind: spec.kind.to_string(),
            installed: installed_path(spec).is_file(),
            downloading: downloads.contains_key(&format!("{}:{}", spec.kind, spec.id)),
            bytes: resource_bytes(spec),
        })
        .collect())
}

fn emit_progress(
    app: &AppHandle,
    spec: ResourceSpec,
    status: &'static str,
    downloaded: u64,
    total: u64,
    message: Option<String>,
) {
    let percent = if total > 0 {
        ((downloaded.saturating_mul(100) / total).min(100)) as u32
    } else {
        0
    };
    let _ = app.emit(
        RESOURCE_EVENT,
        TranscriptionResourceProgress {
            id: spec.id.to_string(),
            kind: spec.kind.to_string(),
            status,
            percent,
            downloaded_bytes: downloaded,
            total_bytes: total,
            message,
        },
    );
}

fn verify_file(path: &Path, spec: ResourceSpec) -> Result<(), String> {
    let mut file =
        fs::File::open(path).map_err(|error| format!("Could not verify download: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut bytes = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not verify download: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        bytes += read as u64;
    }
    if bytes != spec.expected_size {
        return Err(format!(
            "Downloaded file size does not match (expected {}, received {bytes})",
            spec.expected_size
        ));
    }
    let digest = format!("{:x}", hasher.finalize());
    if digest != spec.sha256 {
        return Err("Downloaded file checksum does not match".to_string());
    }
    Ok(())
}

fn extract_archive(
    archive_path: &Path,
    destination: &Path,
    spec: ResourceSpec,
) -> Result<(), String> {
    if destination.exists() {
        fs::remove_dir_all(destination)
            .map_err(|error| format!("Could not replace runtime: {error}"))?;
    }
    fs::create_dir_all(destination)
        .map_err(|error| format!("Could not create runtime directory: {error}"))?;
    match spec.archive {
        ArchiveKind::Zip => {
            let file = fs::File::open(archive_path)
                .map_err(|error| format!("Could not open runtime archive: {error}"))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|error| format!("Could not read runtime archive: {error}"))?;
            for index in 0..archive.len() {
                let mut entry = archive
                    .by_index(index)
                    .map_err(|error| format!("Could not read runtime archive entry: {error}"))?;
                let Some(relative) = entry.enclosed_name() else {
                    continue;
                };
                let output = destination.join(relative);
                if entry.is_dir() {
                    fs::create_dir_all(&output).map_err(|error| error.to_string())?;
                    continue;
                }
                if let Some(parent) = output.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let mut target = fs::File::create(output).map_err(|error| error.to_string())?;
                std::io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
            }
        }
        ArchiveKind::TarGz => {
            let file = fs::File::open(archive_path)
                .map_err(|error| format!("Could not open runtime archive: {error}"))?;
            let mut archive = tar::Archive::new(GzDecoder::new(file));
            archive
                .unpack(destination)
                .map_err(|error| format!("Could not extract runtime archive: {error}"))?;
        }
        ArchiveKind::None => return Err("Resource is not an archive".to_string()),
    }
    fs::write(destination.join(".installed"), format!("{}\n", spec.sha256))
        .map_err(|error| format!("Could not finish runtime installation: {error}"))
}

#[tauri::command]
pub async fn download_transcription_resource(
    app: AppHandle,
    state: State<'_, TranscriptionDownloadState>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let spec = resource_spec(&kind, &id)?;
    let key = format!("{}:{}", spec.kind, spec.id);
    let token = CancellationToken::new();
    {
        let mut downloads = state
            .downloads
            .lock()
            .map_err(|_| "Download state is unavailable")?;
        if downloads.contains_key(&key) {
            return Err("This resource is already downloading".to_string());
        }
        downloads.insert(key.clone(), token.clone());
    }
    let result = async {
        let target_dir = resource_root().join(format!("{}s", spec.kind));
        fs::create_dir_all(&target_dir)
            .map_err(|error| format!("Could not create resource directory: {error}"))?;
        let partial = target_dir.join(format!("{}.part", spec.file_name));
        let response = reqwest::Client::new()
            .get(spec.url)
            .header("User-Agent", "Coffee Note")
            .send()
            .await
            .map_err(|error| format!("Could not download resource: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Resource download failed: {error}"))?;
        let total = response.content_length().unwrap_or(spec.expected_size);
        let maximum = spec.expected_size.saturating_add(1024 * 1024);
        if total > maximum {
            return Err("Resource download is larger than expected".to_string());
        }
        let mut file = fs::File::create(&partial)
            .map_err(|error| format!("Could not create resource file: {error}"))?;
        let mut downloaded = 0_u64;
        emit_progress(&app, spec, "downloading", 0, total, None);
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if token.is_cancelled() {
                let _ = fs::remove_file(&partial);
                return Err("Download cancelled".to_string());
            }
            let chunk =
                chunk.map_err(|error| format!("Resource download was interrupted: {error}"))?;
            downloaded += chunk.len() as u64;
            if downloaded > maximum {
                let _ = fs::remove_file(&partial);
                return Err("Resource download is larger than expected".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Could not save resource: {error}"))?;
            emit_progress(&app, spec, "downloading", downloaded, total, None);
        }
        file.flush()
            .map_err(|error| format!("Could not finish resource file: {error}"))?;
        drop(file);
        verify_file(&partial, spec)?;
        match spec.archive {
            ArchiveKind::None => {
                let target = target_dir.join(spec.file_name);
                if target.exists() {
                    fs::remove_file(&target)
                        .map_err(|error| format!("Could not replace model: {error}"))?;
                }
                fs::rename(&partial, target)
                    .map_err(|error| format!("Could not install model: {error}"))?;
            }
            _ => {
                extract_archive(&partial, &target_dir.join(spec.id), spec)?;
                fs::remove_file(&partial)
                    .map_err(|error| format!("Could not remove runtime archive: {error}"))?;
            }
        }
        emit_progress(
            &app,
            spec,
            "installed",
            spec.expected_size,
            spec.expected_size,
            None,
        );
        Ok(())
    }
    .await;
    if let Ok(mut downloads) = state.downloads.lock() {
        downloads.remove(&key);
    }
    if let Err(message) = &result {
        emit_progress(
            &app,
            spec,
            if token.is_cancelled() {
                "cancelled"
            } else {
                "error"
            },
            0,
            spec.expected_size,
            Some(message.clone()),
        );
    }
    result
}

#[tauri::command]
pub fn cancel_transcription_download(
    state: State<'_, TranscriptionDownloadState>,
    kind: String,
    id: String,
) -> Result<(), String> {
    let key = format!("{kind}:{id}");
    if let Some(token) = state
        .downloads
        .lock()
        .map_err(|_| "Download state is unavailable")?
        .get(&key)
    {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub fn remove_transcription_resource(kind: String, id: String) -> Result<(), String> {
    let spec = resource_spec(&kind, &id)?;
    let target = installed_path(spec);
    let removal = match spec.archive {
        ArchiveKind::None => fs::remove_file(target),
        _ => target
            .parent()
            .map(fs::remove_dir_all)
            .unwrap_or_else(|| Err(std::io::Error::other("Invalid resource path"))),
    };
    match removal {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove transcription resource: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn fixture_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "coffee-note-transcription-{label}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn local_whisper_language_follows_ui_locale() {
        assert_eq!(local_whisper_language("zh"), Some("zh"));
        assert_eq!(local_whisper_language("en"), Some("en"));
        assert_eq!(local_whisper_language("auto"), None);
    }

    #[test]
    fn local_transcription_rejects_whisper_placeholders() {
        assert!(usable_local_transcript("(speaking in foreign language)").is_err());
        assert!(usable_local_transcript("[BLANK_AUDIO]").is_err());
        assert!(usable_local_transcript("   ").is_err());
        assert_eq!(
            usable_local_transcript("  真实文字  ").expect("real speech should be kept"),
            "真实文字"
        );
    }

    #[test]
    fn media_url_detection_only_accepts_supported_hosts() {
        for source in [
            "https://www.youtube.com/watch?v=example",
            "https://www.bilibili.com/video/BVexample",
            "https://b23.tv/example",
            "https://v.douyin.com/example",
            "https://www.tiktok.com/@coffeenote/video/1",
            "https://www.xiaohongshu.com/explore/example",
            "https://x.com/coffeenote/status/1",
        ] {
            let url = reqwest::Url::parse(source).expect("fixture URL should parse");
            assert!(supports_media_url(&url), "{source} should be supported");
        }
        for source in [
            "https://example.com/article",
            "https://youtube.com.evil.example/watch?v=example",
        ] {
            let url = reqwest::Url::parse(source).expect("fixture URL should parse");
            assert!(
                !supports_media_url(&url),
                "{source} should not be supported"
            );
        }
    }

    #[test]
    fn douyin_cookie_retry_is_limited_to_real_douyin_hosts() {
        for source in [
            "https://v.douyin.com/example",
            "https://www.douyin.com/video/1",
            "https://www.iesdouyin.com/share/video/1",
        ] {
            let url = reqwest::Url::parse(source).expect("fixture URL should parse");
            assert!(is_douyin_url(&url), "{source} should use the retry");
        }
        for source in [
            "https://douyin.com.evil.example/video/1",
            "https://www.tiktok.com/@coffeenote/video/1",
            "https://example.com/douyin.com",
        ] {
            let url = reqwest::Url::parse(source).expect("fixture URL should parse");
            assert!(!is_douyin_url(&url), "{source} should not use the retry");
        }
    }

    #[test]
    fn fresh_cookie_error_detection_is_specific() {
        assert!(needs_fresh_browser_cookies(
            b"ERROR: Fresh cookies (not necessarily logged in) are needed"
        ));
        assert!(needs_fresh_browser_cookies(
            b"Extractor says COOKIES ARE NEEDED for this media"
        ));
        assert!(!needs_fresh_browser_cookies(
            b"HTTP Error 404: video unavailable"
        ));
    }

    #[test]
    fn audio_conversion_produces_whisper_ready_wav() {
        let root = fixture_root("audio");
        fs::create_dir_all(&root).expect("audio fixture directory should be created");
        let input = root.join("stereo-48k.wav");
        let output = root.join("mono-16k.wav");
        let mut writer = hound::WavWriter::create(
            &input,
            hound::WavSpec {
                channels: 2,
                sample_rate: 48_000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .expect("fixture WAV should be created");
        for sample in 0..4_800_i16 {
            writer
                .write_sample(sample)
                .expect("left sample should write");
            writer
                .write_sample(-sample)
                .expect("right sample should write");
        }
        writer.finalize().expect("fixture WAV should finish");

        audio_to_wav(&input, &output).expect("audio should convert");
        let reader = hound::WavReader::open(&output).expect("converted WAV should open");
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert!((1_590..=1_610).contains(&reader.duration()));

        fs::remove_dir_all(root).expect("audio fixture should be removed");
    }

    #[test]
    fn downloadable_resources_are_pinned() {
        for spec in [
            model_spec("fast").unwrap(),
            model_spec("standard").unwrap(),
            model_spec("accurate").unwrap(),
            media_fetcher_spec().unwrap(),
        ] {
            assert_eq!(spec.sha256.len(), 64);
            assert!(spec.expected_size > 0);
            assert!(spec.url.starts_with("https://"));
        }
    }

    #[test]
    fn caption_parser_removes_cues_tags_and_duplicate_lines() {
        let source = "WEBVTT\n\n00:00.000 --> 00:01.000\n<c>第一句</c>\n\n00:01.000 --> 00:02.000\n第一句\n第二句 &amp; 补充\n";
        assert_eq!(parse_caption_text(source), "第一句\n第二句 & 补充");
    }

    fn mock_transcription_server(
        assert_request: impl FnOnce(&str) + Send + 'static,
        response_body: &'static str,
    ) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mock server should bind");
        let address = listener.local_addr().expect("mock address should exist");
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("mock request should connect");
            let mut request_bytes = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let read = stream.read(&mut buffer).expect("mock request should read");
                if read == 0 {
                    break;
                }
                request_bytes.extend_from_slice(&buffer[..read]);
                let Some(header_end) = request_bytes
                    .windows(4)
                    .position(|part| part == b"\r\n\r\n")
                else {
                    continue;
                };
                let header_end = header_end + 4;
                let headers =
                    String::from_utf8_lossy(&request_bytes[..header_end]).to_ascii_lowercase();
                if let Some(content_length) = headers
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length:"))
                    .and_then(|value| value.trim().parse::<usize>().ok())
                {
                    if request_bytes.len() >= header_end + content_length {
                        break;
                    }
                } else if headers.contains("transfer-encoding: chunked")
                    && request_bytes[header_end..].ends_with(b"\r\n0\r\n\r\n")
                {
                    break;
                }
            }
            assert_request(&String::from_utf8_lossy(&request_bytes));
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream
                .write_all(response.as_bytes())
                .expect("mock response should write");
        });
        (format!("http://{address}"), handle)
    }

    #[test]
    fn openai_compatible_adapter_streams_multipart_audio() {
        let root = fixture_root("openai-adapter");
        fs::create_dir_all(&root).expect("adapter fixture directory should be created");
        let audio = root.join("audio.wav");
        fs::write(&audio, b"fixture audio").expect("adapter fixture should write");
        let (endpoint, server) = mock_transcription_server(
            |request| {
                let normalized = request.to_ascii_lowercase();
                assert!(request.starts_with("POST / "));
                assert!(normalized.contains("authorization: bearer test-key"));
                assert!(normalized.contains("content-type: multipart/form-data"));
                assert!(request.contains("test-model"));
            },
            r#"{"text":"adapter transcript"}"#,
        );
        let config = super::super::TranscriptionProviderConfig {
            provider_id: "custom".to_string(),
            protocol: "openai-compatible".to_string(),
            endpoint,
            model: "test-model".to_string(),
            api_key: "test-key".to_string(),
        };

        let transcript =
            tauri::async_runtime::block_on(transcribe_openai_compatible(&config, &audio))
                .expect("adapter should return text");
        server.join().expect("mock server should finish");
        assert_eq!(transcript, "adapter transcript");
        fs::remove_dir_all(root).expect("adapter fixture should be removed");
    }

    #[test]
    fn deepgram_adapter_uses_token_auth_and_model_query() {
        let root = fixture_root("deepgram-adapter");
        fs::create_dir_all(&root).expect("adapter fixture directory should be created");
        let audio = root.join("audio.wav");
        fs::write(&audio, b"fixture audio").expect("adapter fixture should write");
        let (base_url, server) = mock_transcription_server(
            |request| {
                let normalized = request.to_ascii_lowercase();
                assert!(request.starts_with("POST /listen?model=nova-3&smart_format=true "));
                assert!(normalized.contains("authorization: token test-key"));
                assert!(normalized.contains("content-type: application/octet-stream"));
            },
            r#"{"results":{"channels":[{"alternatives":[{"transcript":"deepgram transcript"}]}]}}"#,
        );
        let config = super::super::TranscriptionProviderConfig {
            provider_id: "deepgram".to_string(),
            protocol: "deepgram".to_string(),
            endpoint: format!("{base_url}/listen"),
            model: "nova-3".to_string(),
            api_key: "test-key".to_string(),
        };

        let transcript = tauri::async_runtime::block_on(transcribe_deepgram(&config, &audio))
            .expect("adapter should return text");
        server.join().expect("mock server should finish");
        assert_eq!(transcript, "deepgram transcript");
        fs::remove_dir_all(root).expect("adapter fixture should be removed");
    }
}

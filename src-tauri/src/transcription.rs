use flate2::read::GzDecoder;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
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
const FIRERED_SOURCE_REVISION: &str = "4e7d9aaf4482a47cec1724807026b9b151926eb5";
const FIRERED_KALDI_FBANK: &str = "kaldi-native-fbank==1.22.3";
const FIRERED_PEFT: &str = "peft==0.20.0";
static MEDIA_FETCHER_SETUP_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static MEDIA_FETCHER_READY: tokio::sync::OnceCell<PathBuf> = tokio::sync::OnceCell::const_new();

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn configure_hidden_command(_command: &mut Command) {
    #[cfg(windows)]
    _command.creation_flags(CREATE_NO_WINDOW);
}

#[derive(Default)]
pub struct TranscriptionDownloadState {
    downloads: Mutex<BTreeMap<String, CancellationToken>>,
    failures: Mutex<BTreeMap<String, String>>,
}

fn model_file(id: &str, runtime: &str) -> Result<PathBuf, String> {
    if matches!(id, "fireredasr2-aed" | "fireredasr2-llm") {
        if !model_is_compatible_with_runtime(id, runtime) {
            return Err(
                "The selected model is not compatible with this transcription engine".to_string(),
            );
        }
        let package = resource_bundle("model", id)?;
        if !package
            .iter()
            .all(|spec| installed_path(*spec, runtime).is_file())
        {
            return Err("Download a local transcription model first".to_string());
        }
        return Ok(resource_root_for_runtime(runtime).join("models").join(id));
    }
    let file = match id {
        "fast" => "ggml-base.bin",
        "standard" => "ggml-small.bin",
        "accurate" => "ggml-medium.bin",
        "sensevoice-small" => "sensevoice-small-q8.gguf",
        "paraformer-large" => "paraformer-q8.gguf",
        "funasr-nano" => "qwen3-0.6b-q4km.gguf",
        "funasr-nano-encoder" => "funasr-encoder-f16.gguf",
        "funasr-vad" => "fsmn-vad.gguf",
        _ => return Err("Unsupported transcription model".to_string()),
    };
    if !model_is_compatible_with_runtime(id, runtime) {
        return Err(
            "The selected model is not compatible with this transcription engine".to_string(),
        );
    }
    let path = resource_root_for_runtime(runtime).join("models").join(file);
    if path.is_file() {
        Ok(path)
    } else {
        Err("Download a local transcription model first".to_string())
    }
}

fn runtime_executable(runtime: &str, model: &str) -> Result<PathBuf, String> {
    if !matches!(runtime, "native" | "cuda" | "funasr" | "firered") {
        return Err("Choose a local transcription engine first".to_string());
    }
    if runtime == "firered" {
        if !model_is_compatible_with_runtime(model, runtime) {
            return Err("The selected model is not compatible with FireRedASR2".to_string());
        }
        let python = firered_venv_python();
        let ready = resource_root_for_runtime(runtime)
            .join("runtimes")
            .join(runtime)
            .join(".ready");
        return if ready.is_file() && python.is_file() {
            Ok(python)
        } else {
            Err("Install the FireRedASR2 runtime first".to_string())
        };
    }
    let root = resource_root_for_runtime(runtime)
        .join("runtimes")
        .join(runtime);
    let executable = if runtime == "funasr" {
        match model {
            "sensevoice-small" => "llama-funasr-sensevoice",
            "paraformer-large" => "llama-funasr-paraformer",
            "funasr-nano" => "llama-funasr-cli",
            _ => return Err("The selected model is not compatible with FunASR".to_string()),
        }
    } else {
        "whisper-cli"
    };
    let name = if cfg!(windows) {
        format!("{executable}.exe")
    } else {
        executable.to_string()
    };
    let mut stack = vec![root.clone()];
    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .map_err(|error| format!("Local transcription engine is unavailable: {error}"))?;
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
            } else if entry_path.file_name().and_then(|value| value.to_str()) == Some(name.as_str())
            {
                return Ok(entry_path);
            }
        }
    }
    Err("Download the local transcription engine first".to_string())
}

fn firered_runtime_root() -> PathBuf {
    resource_root_for_runtime("firered")
        .join("runtimes")
        .join("firered")
}

fn firered_venv_python() -> PathBuf {
    let environment = firered_runtime_root().join("venv");
    if cfg!(windows) {
        environment.join("Scripts").join("python.exe")
    } else {
        environment.join("bin").join("python")
    }
}

fn find_firered_source() -> Option<PathBuf> {
    fn search(directory: &Path, depth: usize) -> Option<PathBuf> {
        if directory.join("pyproject.toml").is_file()
            && directory
                .join("fireredasr2s")
                .join("fireredasr2s_cli.py")
                .is_file()
        {
            return Some(directory.to_path_buf());
        }
        if depth == 0 {
            return None;
        }
        fs::read_dir(directory)
            .ok()?
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .find_map(|entry| search(&entry.path(), depth - 1))
    }
    search(&firered_runtime_root(), 3)
}

#[derive(Clone)]
struct PythonLauncher {
    program: PathBuf,
    prefix: Vec<String>,
}

fn supported_python_version(output: &Output) -> bool {
    let value = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr)
    } else {
        String::from_utf8_lossy(&output.stdout)
    };
    supported_python_version_text(&value)
}

fn supported_python_version_text(value: &str) -> bool {
    let version = value
        .split_whitespace()
        .find(|part| {
            part.chars()
                .next()
                .is_some_and(|value| value.is_ascii_digit())
        })
        .unwrap_or_default();
    let mut parts = version
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());
    match (parts.next(), parts.next()) {
        (Some(3), Some(11..=13)) => true,
        (Some(3), Some(14)) => !cfg!(windows),
        _ => false,
    }
}

async fn find_firered_python_launcher() -> Result<PythonLauncher, String> {
    let candidates: Vec<(&str, &[&str])> = if cfg!(windows) {
        vec![
            ("py", &["-3.13"]),
            ("py", &["-3.12"]),
            ("py", &["-3.11"]),
            ("python3.13", &[]),
            ("python3.12", &[]),
            ("python3.11", &[]),
            ("python", &[]),
            ("python3", &[]),
        ]
    } else {
        vec![
            ("python3.14", &[]),
            ("python3.13", &[]),
            ("python3.12", &[]),
            ("python3.11", &[]),
            ("python3", &[]),
            ("python", &[]),
        ]
    };
    for (program, prefix) in candidates {
        let mut command = Command::new(program);
        configure_hidden_command(&mut command);
        command.args(prefix).arg("--version");
        if let Ok(output) = command.output().await {
            if output.status.success() && supported_python_version(&output) {
                return Ok(PythonLauncher {
                    program: PathBuf::from(program),
                    prefix: prefix.iter().map(|value| (*value).to_string()).collect(),
                });
            }
        }
    }
    let uv_versions = if cfg!(windows) {
        &["3.13", "3.12", "3.11"][..]
    } else {
        &["3.14", "3.13", "3.12", "3.11"][..]
    };
    for version in uv_versions {
        let mut find = Command::new("uv");
        configure_hidden_command(&mut find);
        find.args(["python", "find", version]);
        let Ok(found) = find.output().await else {
            break;
        };
        if !found.status.success() {
            continue;
        }
        let path = String::from_utf8_lossy(&found.stdout).trim().to_string();
        if path.is_empty() {
            continue;
        }
        let mut verify = Command::new(&path);
        configure_hidden_command(&mut verify);
        verify.arg("--version");
        if let Ok(output) = verify.output().await {
            if output.status.success() && supported_python_version(&output) {
                return Ok(PythonLauncher {
                    program: PathBuf::from(path),
                    prefix: Vec::new(),
                });
            }
        }
    }
    let versions = if cfg!(windows) {
        "3.11, 3.12, or 3.13"
    } else {
        "3.11, 3.12, 3.13, or 3.14"
    };
    Err(format!(
        "FireRedASR2 requires Python {versions}. Install a supported version, then retry."
    ))
}

async fn run_cancellable_command(
    command: &mut Command,
    token: &CancellationToken,
    label: &str,
) -> Result<Output, String> {
    configure_hidden_command(command);
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start {label}: {error}"))?;
    tokio::select! {
        output = child.wait_with_output() => output.map_err(|error| format!("Could not finish {label}: {error}")),
        _ = token.cancelled() => Err("Download cancelled".to_string()),
    }
}

fn command_failure(output: &Output, label: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("{label} failed without diagnostics")
    } else {
        format!("{label} failed: {detail}")
    }
}

async fn prepare_firered_runtime(token: &CancellationToken) -> Result<(), String> {
    let runtime_root = firered_runtime_root();
    let ready = runtime_root.join(".ready");
    let _ = fs::remove_file(&ready);
    let source = find_firered_source()
        .ok_or_else(|| "The downloaded FireRedASR2 source archive is incomplete".to_string())?;
    let launcher = find_firered_python_launcher().await?;
    let python = firered_venv_python();
    if python.is_file() {
        let mut version = Command::new(&python);
        configure_hidden_command(&mut version);
        version.arg("--version");
        let compatible = version
            .output()
            .await
            .is_ok_and(|output| output.status.success() && supported_python_version(&output));
        if !compatible {
            fs::remove_dir_all(runtime_root.join("venv")).map_err(|error| {
                format!(
                    "Could not replace the incompatible FireRedASR2 Python environment: {error}"
                )
            })?;
        }
    }
    if !python.is_file() {
        let mut command = Command::new(&launcher.program);
        command
            .args(&launcher.prefix)
            .arg("-m")
            .arg("venv")
            .arg(runtime_root.join("venv"));
        let output =
            run_cancellable_command(&mut command, token, "the FireRedASR2 Python environment")
                .await?;
        if !output.status.success() {
            return Err(command_failure(
                &output,
                "Creating the FireRedASR2 Python environment",
            ));
        }
    }

    let install = |index_url: Option<&str>| {
        let mut command = Command::new(&python);
        command
            .arg("-m")
            .arg("pip")
            .arg("install")
            .arg("--disable-pip-version-check");
        if let Some(index_url) = index_url {
            command.arg("--index-url").arg(index_url);
        }
        command
            .arg(&source)
            .arg(FIRERED_KALDI_FBANK)
            .arg(FIRERED_PEFT);
        command
    };
    let mut preferred = install(Some("https://pypi.tuna.tsinghua.edu.cn/simple"));
    let preferred_output =
        run_cancellable_command(&mut preferred, token, "the FireRedASR2 dependencies").await?;
    if !preferred_output.status.success() {
        let mut fallback = install(None);
        let fallback_output =
            run_cancellable_command(&mut fallback, token, "the FireRedASR2 dependencies").await?;
        if !fallback_output.status.success() {
            return Err(command_failure(
                &fallback_output,
                "Installing the FireRedASR2 dependencies",
            ));
        }
    }

    let mut verify = Command::new(&python);
    verify
        .current_dir(&source)
        .env("PYTHONPATH", &source)
        .arg("-c")
        .arg("import fireredasr2s, torch; print(torch.__version__)");
    let output = run_cancellable_command(&mut verify, token, "FireRedASR2 verification").await?;
    if !output.status.success() {
        return Err(command_failure(&output, "Verifying FireRedASR2"));
    }
    fs::write(&ready, format!("{FIRERED_SOURCE_REVISION}\n"))
        .map_err(|error| format!("Could not finish the FireRedASR2 installation: {error}"))
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
    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", config.model.clone());
    if config.model == "gpt-4o-transcribe-diarize" {
        form = form
            .text("response_format", "diarized_json")
            .text("chunking_strategy", "auto");
    }
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
    transcription_text(&body)
}

fn transcription_text(body: &Value) -> Result<String, String> {
    if let Some(text) = body.get("text").and_then(Value::as_str) {
        return Ok(text.to_string());
    }
    let segments = body
        .get("segments")
        .and_then(Value::as_array)
        .ok_or_else(|| "The transcription response did not contain text".to_string())?;
    let lines = segments
        .iter()
        .filter_map(|segment| {
            let text = segment.get("text").and_then(Value::as_str)?.trim();
            if text.is_empty() {
                return None;
            }
            let speaker = segment.get("speaker").and_then(Value::as_str);
            Some(match speaker {
                Some(speaker) if !speaker.is_empty() => format!("{speaker}: {text}"),
                _ => text.to_string(),
            })
        })
        .collect::<Vec<_>>();
    if lines.is_empty() {
        Err("The transcription response did not contain text".to_string())
    } else {
        Ok(lines.join("\n"))
    }
}

async fn transcribe_elevenlabs(
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
    let response = reqwest::Client::new()
        .post(&config.endpoint)
        .header("xi-api-key", config.api_key.trim())
        .multipart(
            reqwest::multipart::Form::new()
                .part("file", part)
                .text("model_id", config.model.clone()),
        )
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
            .get("detail")
            .and_then(Value::as_str)
            .unwrap_or("The transcription service returned an error")
            .to_string());
    }
    transcription_text(&body)
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
        .json(&json!({"audio_url": audio_url, "speech_models": [config.model.clone()]}))
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
    if runtime == "firered" {
        return transcribe_local_firered(model, audio).await;
    }
    if runtime == "funasr" {
        return transcribe_local_funasr(model, audio).await;
    }

    let executable = runtime_executable(runtime, model)?;
    let model_path = model_file(model, runtime)?;
    let workspace = std::env::temp_dir().join(format!("tiernote-whisper-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Could not create local transcription workspace: {error}"))?;
    let _guard = TempMediaDir(workspace.clone());
    let output_base = workspace.join("transcript");
    let wav = workspace.join("audio.wav");
    audio_to_wav(audio, &wav)?;

    let initial_output = run_local_whisper(&executable, &model_path, &wav, &output_base, locale)
        .await
        .map_err(|error| format!("Could not start local transcription: {error}"))?;
    #[cfg(windows)]
    let (output, used_compatible_backend) =
        if runtime == "native" && is_cpu_backend_startup_failure(&initial_output) {
            let compatible_executable =
                prepare_windows_compatible_cpu_runtime(&executable, &workspace)?;
            let output = run_local_whisper(
                &compatible_executable,
                &model_path,
                &wav,
                &output_base,
                locale,
            )
            .await
            .map_err(|error| {
                format!("Could not start the compatible local transcription engine: {error}")
            })?;
            (output, true)
        } else {
            (initial_output, false)
        };
    #[cfg(not(windows))]
    let (output, used_compatible_backend) = (initial_output, false);
    if !output.status.success() {
        return Err(local_whisper_failure(&output, used_compatible_backend));
    }
    let transcript = tokio::fs::read_to_string(output_base.with_extension("txt"))
        .await
        .map_err(|error| format!("Could not read local transcription result: {error}"))?;
    usable_local_transcript(&transcript)
}

async fn transcribe_local_firered(model: &str, audio: &Path) -> Result<String, String> {
    let python = runtime_executable("firered", model)?;
    let model_path = model_file(model, "firered")?;
    let source = find_firered_source().ok_or_else(|| {
        "The FireRedASR2 source installation is incomplete. Reinstall the runtime.".to_string()
    })?;
    let cli = source.join("fireredasr2s").join("fireredasr2s_cli.py");
    if !cli.is_file() {
        return Err("The FireRedASR2 command-line runner is missing".to_string());
    }
    let workspace = std::env::temp_dir().join(format!("tiernote-firered-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Could not create local transcription workspace: {error}"))?;
    let _guard = TempMediaDir(workspace.clone());
    let wav = workspace.join("audio.wav");
    let output_dir = workspace.join("output");
    audio_to_wav(audio, &wav)?;

    let gpu_available = firered_gpu_available(&python).await;
    let asr_type = if model == "fireredasr2-llm" {
        "llm"
    } else {
        "aed"
    };
    let mut command = Command::new(&python);
    configure_hidden_command(&mut command);
    command
        .current_dir(&source)
        .env("PYTHONPATH", &source)
        .arg(cli)
        .arg("--wav_path")
        .arg(&wav)
        .arg("--outdir")
        .arg(&output_dir)
        .arg("--write_textgrid")
        .arg("0")
        .arg("--write_srt")
        .arg("0")
        .arg("--enable_vad")
        .arg("0")
        .arg("--enable_lid")
        .arg("0")
        .arg("--enable_punc")
        .arg("0")
        .arg("--asr_type")
        .arg(asr_type)
        .arg("--asr_model_dir")
        .arg(&model_path)
        .arg("--asr_use_gpu")
        .arg(if gpu_available { "1" } else { "0" })
        .arg("--return_timestamp")
        .arg("0");
    let output = command
        .output()
        .await
        .map_err(|error| format!("Could not start the FireRedASR2 engine: {error}"))?;
    if !output.status.success() {
        return Err(local_runtime_failure(&output, "FireRedASR2"));
    }
    let result = tokio::fs::read_to_string(output_dir.join("result.jsonl"))
        .await
        .map_err(|error| format!("Could not read the FireRedASR2 result: {error}"))?;
    let first = result
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "FireRedASR2 did not return a transcription".to_string())?;
    let payload: Value = serde_json::from_str(first)
        .map_err(|error| format!("Could not parse the FireRedASR2 result: {error}"))?;
    let transcript = payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default();
    usable_local_transcript(transcript)
}

async fn firered_gpu_available(python: &Path) -> bool {
    let mut command = Command::new(python);
    configure_hidden_command(&mut command);
    command
        .arg("-c")
        .arg("import torch; print('1' if torch.cuda.is_available() else '0')")
        .output()
        .await
        .is_ok_and(|output| output.status.success() && output.stdout.starts_with(b"1"))
}

async fn transcribe_local_funasr(model: &str, audio: &Path) -> Result<String, String> {
    let executable = runtime_executable("funasr", model)?;
    let model_path = model_file(model, "funasr")?;
    let vad_path = model_file("funasr-vad", "funasr")?;
    let workspace = std::env::temp_dir().join(format!("tiernote-funasr-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Could not create local transcription workspace: {error}"))?;
    let _guard = TempMediaDir(workspace.clone());
    let wav = workspace.join("audio.wav");
    audio_to_wav(audio, &wav)?;

    let mut command = Command::new(&executable);
    configure_hidden_command(&mut command);
    if let Some(runtime_dir) = executable.parent() {
        command.current_dir(runtime_dir);
    }
    if model == "funasr-nano" {
        command
            .arg("--enc")
            .arg(model_file("funasr-nano-encoder", "funasr")?)
            .arg("-m")
            .arg(&model_path);
    } else {
        command.arg("-m").arg(&model_path);
    }
    let output = command
        .arg("--vad")
        .arg(vad_path)
        .arg("-a")
        .arg(wav)
        .arg("--srt")
        .output()
        .await
        .map_err(|error| format!("Could not start the FunASR transcription engine: {error}"))?;
    if !output.status.success() {
        return Err(local_runtime_failure(&output, "FunASR"));
    }
    let transcript = parse_caption_text(&String::from_utf8_lossy(&output.stdout));
    usable_local_transcript(&transcript)
}

async fn run_local_whisper(
    executable: &Path,
    model_path: &Path,
    wav: &Path,
    output_base: &Path,
    locale: &str,
) -> std::io::Result<Output> {
    let mut command = Command::new(executable);
    configure_hidden_command(&mut command);
    if let Some(runtime_dir) = executable.parent() {
        command.current_dir(runtime_dir);
    }
    command.arg("-m").arg(model_path);
    if let Some(language) = local_whisper_language(locale) {
        command.arg("-l").arg(language);
    }
    command
        .arg("-f")
        .arg(wav)
        .arg("-otxt")
        .arg("-of")
        .arg(output_base)
        .arg("-nt")
        .arg("-np")
        .output()
        .await
}

fn is_cpu_backend_startup_failure(output: &Output) -> bool {
    cpu_backend_startup_failure(output.status.success(), &output.stderr)
}

fn cpu_backend_startup_failure(success: bool, stderr: &[u8]) -> bool {
    if success {
        return false;
    }
    let stderr = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    stderr.contains("load_backend: loaded cpu backend")
        && !stderr.contains("whisper_init_from_file_with_params_no_state")
}

fn local_whisper_failure(output: &Output, used_compatible_backend: bool) -> String {
    let status = output
        .status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "terminated by the operating system".to_string());
    let attempt = if used_compatible_backend {
        " after retrying with the compatible CPU backend"
    } else {
        ""
    };
    if is_cpu_backend_startup_failure(output) {
        return format!(
            "Local transcription engine stopped immediately after loading its CPU backend{attempt} (status {status}). The backend load succeeded, but the process produced no later diagnostic."
        );
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("Local transcription engine exited{attempt} (status {status}) without diagnostics")
    } else {
        format!("Local transcription engine exited{attempt} (status {status}): {detail}")
    }
}

fn local_runtime_failure(output: &Output, runtime_name: &str) -> String {
    let status = output
        .status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "terminated by the operating system".to_string());
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    if detail.is_empty() {
        format!("{runtime_name} transcription engine exited (status {status}) without diagnostics")
    } else {
        format!("{runtime_name} transcription engine exited (status {status}): {detail}")
    }
}

#[cfg(windows)]
fn prepare_windows_compatible_cpu_runtime(
    executable: &Path,
    workspace: &Path,
) -> Result<PathBuf, String> {
    const REQUIRED_FILES: &[&str] = &[
        "whisper-cli.exe",
        "whisper.dll",
        "ggml.dll",
        "ggml-base.dll",
        "ggml-cpu-x64.dll",
    ];

    let source_dir = executable
        .parent()
        .ok_or_else(|| "The local transcription runtime path is invalid".to_string())?;
    let destination = workspace.join("compatible-cpu-runtime");
    fs::create_dir_all(&destination)
        .map_err(|error| format!("Could not prepare the compatible CPU backend: {error}"))?;
    for name in REQUIRED_FILES {
        let source = source_dir.join(name);
        if !source.is_file() {
            return Err(format!(
                "The compatible CPU backend is incomplete: {name} is missing. Re-download the local engine."
            ));
        }
        fs::copy(&source, destination.join(name))
            .map_err(|error| format!("Could not prepare the compatible CPU backend: {error}"))?;
    }
    Ok(destination.join("whisper-cli.exe"))
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
    knowledge_root: &Path,
) -> Result<String, String> {
    media_download_directory(knowledge_root)?;
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
        runtime_executable(&config.active_runtime, &config.active_model)?;
        model_file(&config.active_model, &config.active_runtime)?;
        let audio = download_media_audio(url, knowledge_root).await?;
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
    let audio = download_media_audio(url, knowledge_root).await?;
    match provider.protocol.as_str() {
        "deepgram" => transcribe_deepgram(provider, &audio).await,
        "assemblyai" => transcribe_assemblyai(provider, &audio).await,
        "elevenlabs" => transcribe_elevenlabs(provider, &audio).await,
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
        runtime_executable(&config.active_runtime, &config.active_model)?;
        model_file(&config.active_model, &config.active_runtime)?;
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
        "elevenlabs" => transcribe_elevenlabs(provider, path).await,
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
    urls: &'static [&'static str],
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
    runtime_id: String,
    installed: bool,
    downloading: bool,
    bytes: u64,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionStorageInfo {
    runtime_id: String,
    directory: String,
    default_directory: String,
    uses_default: bool,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionStorageConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    directory: Option<String>,
    #[serde(default)]
    directories: BTreeMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranscriptionResourceProgress {
    id: String,
    kind: String,
    runtime_id: String,
    status: &'static str,
    percent: u32,
    downloaded_bytes: u64,
    total_bytes: u64,
    message: Option<String>,
}

fn default_resource_root() -> PathBuf {
    crate::app_data_dir().join("transcription")
}

fn storage_config_path() -> PathBuf {
    crate::app_data_dir().join("transcription-storage.json")
}

fn load_storage_config() -> TranscriptionStorageConfig {
    fs::read_to_string(storage_config_path())
        .ok()
        .and_then(|contents| serde_json::from_str::<TranscriptionStorageConfig>(&contents).ok())
        .unwrap_or_default()
}

fn configured_resource_root(runtime_id: &str) -> Option<PathBuf> {
    let config = load_storage_config();
    let directory = config
        .directories
        .get(runtime_id)
        .map(String::as_str)
        .or(config.directory.as_deref())?;
    let path = PathBuf::from(directory.trim());
    path.is_absolute().then_some(path)
}

fn resource_root_for_runtime(runtime_id: &str) -> PathBuf {
    configured_resource_root(runtime_id).unwrap_or_else(default_resource_root)
}

fn validate_storage_runtime(runtime_id: &str) -> Result<(), String> {
    if matches!(runtime_id, "firered" | "funasr" | "native" | "cuda") {
        Ok(())
    } else {
        Err("Choose a supported transcription engine".to_string())
    }
}

fn runtime_storage_folder(runtime_id: &str) -> &'static str {
    match runtime_id {
        "firered" => "FireRedASR2",
        "funasr" => "FunASR",
        "cuda" => "Whisper NVIDIA",
        _ => "Whisper CPU",
    }
}

fn storage_destination_is_unsafe(current: &Path, destination: &Path) -> bool {
    current.starts_with(destination)
        || destination.starts_with(current.join("models"))
        || destination.starts_with(current.join("runtimes"))
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy().into_owned();
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(ordinary) = value.strip_prefix(r"\\?\") {
            return ordinary.to_string();
        }
    }
    value
}

fn copy_resource_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(destination)
        .map_err(|error| format!("Could not create transcription storage: {error}"))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("Could not read existing transcription storage: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not read stored resource: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_resource_tree(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Could not migrate transcription resource: {error}"))?;
        }
    }
    Ok(())
}

fn relative_resource_path(spec: ResourceSpec) -> PathBuf {
    let base = PathBuf::from(format!("{}s", spec.kind));
    match spec.archive {
        ArchiveKind::None => base.join(spec.file_name),
        _ => base.join(spec.id),
    }
}

fn runtime_resource_specs(runtime_id: &str) -> Vec<ResourceSpec> {
    let mut specs = runtime_spec(runtime_id).into_iter().collect::<Vec<_>>();
    if runtime_id == "firered" {
        for id in ["fireredasr2-aed", "fireredasr2-llm"] {
            if let Some(package) = firered_model_bundle(id) {
                specs.extend(package);
            }
        }
        return specs;
    }
    let model_ids: &[&str] = match runtime_id {
        "funasr" => &[
            "sensevoice-small",
            "paraformer-large",
            "funasr-nano",
            "funasr-nano-encoder",
            "funasr-vad",
        ],
        "native" | "cuda" => &["fast", "standard", "accurate"],
        _ => &[],
    };
    specs.extend(model_ids.iter().filter_map(|id| model_spec(id)));
    specs
}

fn copy_runtime_resources(
    source: &Path,
    destination: &Path,
    runtime_id: &str,
) -> Result<(), String> {
    for spec in runtime_resource_specs(runtime_id) {
        let relative = relative_resource_path(spec);
        let source_path = source.join(&relative);
        if !source_path.exists() {
            continue;
        }
        let destination_path = destination.join(relative);
        if source_path.is_dir() {
            copy_resource_tree(&source_path, &destination_path)?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Could not create transcription storage: {error}"))?;
            }
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("Could not migrate transcription resource: {error}"))?;
        }
    }
    Ok(())
}

fn configured_root_from(config: &TranscriptionStorageConfig, runtime_id: &str) -> PathBuf {
    config
        .directories
        .get(runtime_id)
        .map(PathBuf::from)
        .or_else(|| config.directory.as_ref().map(PathBuf::from))
        .unwrap_or_else(default_resource_root)
}

fn remove_migrated_runtime_resources(
    source: &Path,
    runtime_id: &str,
    config: &TranscriptionStorageConfig,
) {
    for spec in runtime_resource_specs(runtime_id) {
        if spec.kind == "model" {
            let shared_from_source = ["firered", "funasr", "native", "cuda"]
                .into_iter()
                .filter(|candidate| *candidate != runtime_id)
                .filter(|candidate| model_is_compatible_with_runtime(spec.id, candidate))
                .any(|candidate| {
                    fs::canonicalize(configured_root_from(config, candidate))
                        .map(|root| root == source)
                        .unwrap_or(false)
                });
            if shared_from_source {
                continue;
            }
        }
        let path = source.join(relative_resource_path(spec));
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }
    for directory in [source.join("models"), source.join("runtimes")] {
        if directory
            .read_dir()
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false)
        {
            let _ = fs::remove_dir(directory);
        }
    }
}

#[tauri::command]
pub fn get_transcription_storage(runtime_id: String) -> Result<TranscriptionStorageInfo, String> {
    validate_storage_runtime(&runtime_id)?;
    let directory = resource_root_for_runtime(&runtime_id);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create transcription storage: {error}"))?;
    let default = default_resource_root();
    Ok(TranscriptionStorageInfo {
        runtime_id,
        directory: display_path(&directory),
        default_directory: display_path(&default),
        uses_default: directory == default,
    })
}

#[tauri::command]
pub fn set_transcription_storage_directory(
    state: State<'_, TranscriptionDownloadState>,
    runtime_id: String,
    directory: String,
) -> Result<TranscriptionStorageInfo, String> {
    validate_storage_runtime(&runtime_id)?;
    if !state
        .downloads
        .lock()
        .map_err(|_| "Download state is unavailable")?
        .is_empty()
    {
        return Err("Wait for current transcription downloads to finish first".to_string());
    }
    let selected_parent = PathBuf::from(directory.trim());
    if !selected_parent.is_absolute() {
        return Err("Choose an absolute storage directory".to_string());
    }
    fs::create_dir_all(&selected_parent)
        .map_err(|error| format!("Could not create transcription storage: {error}"))?;
    let selected_parent = fs::canonicalize(&selected_parent)
        .map_err(|error| format!("Could not access transcription storage: {error}"))?;
    let selected_is_runtime_root = selected_parent
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == runtime_storage_folder(&runtime_id))
        && selected_parent
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| name == "TierNote Transcription");
    let destination = if selected_is_runtime_root {
        selected_parent
    } else {
        let container = if selected_parent
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name == "TierNote Transcription")
        {
            selected_parent
        } else {
            selected_parent.join("TierNote Transcription")
        };
        container.join(runtime_storage_folder(&runtime_id))
    };
    fs::create_dir_all(&destination)
        .map_err(|error| format!("Could not create transcription storage: {error}"))?;
    let destination = fs::canonicalize(&destination)
        .map_err(|error| format!("Could not access transcription storage: {error}"))?;
    let current = resource_root_for_runtime(&runtime_id);
    fs::create_dir_all(&current)
        .map_err(|error| format!("Could not access current transcription storage: {error}"))?;
    let current = fs::canonicalize(&current)
        .map_err(|error| format!("Could not access current transcription storage: {error}"))?;
    if destination == current {
        return get_transcription_storage(runtime_id);
    }
    if storage_destination_is_unsafe(&current, &destination) {
        return Err(
            "Choose a directory outside the current models and runtimes folders".to_string(),
        );
    }
    copy_runtime_resources(&current, &destination, &runtime_id)?;
    fs::write(
        destination.join(".tiernote-transcription-runtime"),
        format!("{runtime_id}\n"),
    )
    .map_err(|error| format!("Could not initialize transcription storage: {error}"))?;
    let mut config = load_storage_config();
    config
        .directories
        .insert(runtime_id.clone(), display_path(&destination));
    let contents = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Could not save transcription storage: {error}"))?;
    fs::write(storage_config_path(), format!("{contents}\n"))
        .map_err(|error| format!("Could not save transcription storage: {error}"))?;
    remove_migrated_runtime_resources(&current, &runtime_id, &config);
    get_transcription_storage(runtime_id)
}

#[tauri::command]
pub fn open_transcription_storage_directory(runtime_id: String) -> Result<(), String> {
    validate_storage_runtime(&runtime_id)?;
    let path = resource_root_for_runtime(&runtime_id);
    fs::create_dir_all(&path)
        .map_err(|error| format!("Could not create transcription storage: {error}"))?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|error| format!("Could not open transcription storage: {error}"))
}

fn external_resource_sources(kind: &str, id: &str) -> Option<[&'static str; 2]> {
    match (kind, id) {
        ("runtime", "firered") => Some([
            "https://gitcode.com/gh_mirrors/fi/FireRedASR2S",
            "https://github.com/FireRedTeam/FireRedASR2S",
        ]),
        ("model", "fireredasr2-aed") => Some([
            "https://modelscope.cn/models/FireRedTeam/FireRedASR2-AED",
            "https://huggingface.co/FireRedTeam/FireRedASR2-AED",
        ]),
        ("model", "fireredasr2-llm") => Some([
            "https://modelscope.cn/models/FireRedTeam/FireRedASR2-LLM",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM",
        ]),
        _ => None,
    }
}

#[tauri::command]
pub async fn resolve_transcription_resource_source(
    kind: String,
    id: String,
) -> Result<String, String> {
    let [preferred, fallback] = external_resource_sources(&kind, &id)
        .ok_or_else(|| format!("Unsupported external transcription resource: {kind}:{id}"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|error| format!("Could not prepare source detection: {error}"))?;
    let preferred_available = client
        .head(preferred)
        .header("User-Agent", "TierNote")
        .send()
        .await
        .is_ok_and(|response| response.status().is_success());
    Ok(if preferred_available {
        preferred
    } else {
        fallback
    }
    .to_string())
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
/// in the yt-dlp child process and are never exported or persisted by TierNote.
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
        std::env::temp_dir().join(format!("tiernote-captions-{}", uuid::Uuid::new_v4()));
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
            .arg("--encoding")
            .arg("utf-8")
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
            urls: &["https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp.exe"],
            file_name: "media-fetcher.exe",
            sha256: "52fe3c26dcf71fbdc85b528589020bb0b8e383155cfa81b64dd447bbe35e24b8",
            expected_size: 18_226_085,
            archive: ArchiveKind::None,
        }),
        ("linux", "x86_64") => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            urls: &["https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_linux"],
            file_name: "media-fetcher",
            sha256: "6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae",
            expected_size: 39_924_536,
            archive: ArchiveKind::None,
        }),
        ("linux", "aarch64") => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            urls: &["https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_linux_aarch64"],
            file_name: "media-fetcher",
            sha256: "b6ce97646773070d7a7ffd6bbbdcaecb47c48483909c54c915bf08a7a9b5e0b1",
            expected_size: 39_675_904,
            archive: ArchiveKind::None,
        }),
        ("macos", _) => Ok(ResourceSpec {
            id: "media-fetcher",
            kind: "tool",
            urls: &["https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/yt-dlp_macos"],
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
        .get(spec.urls[0])
        .header("User-Agent", "TierNote")
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
    let target = default_resource_root().join("tools").join(spec.file_name);
    download_fixed_file(spec, &target).await?;
    let _ = MEDIA_FETCHER_READY.set(target.clone());
    Ok(target)
}

/// Prepare the small, pinned media-import dependency in the background after
/// TierNote starts. Speech runtimes and models remain explicit user downloads.
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
    let directory = std::env::temp_dir().join(format!("tiernote-browser-{}", uuid::Uuid::new_v4()));
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
        .arg("--encoding")
        .arg("utf-8")
        .arg("--no-part")
        .arg("--windows-filenames")
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

fn media_download_directory(knowledge_root: &Path) -> Result<PathBuf, String> {
    if !knowledge_root.is_dir() {
        return Err("The selected AI work directory is unavailable".to_string());
    }
    let canonical_root = knowledge_root
        .canonicalize()
        .map_err(|error| format!("The selected AI work directory is unavailable: {error}"))?;
    let downloads = canonical_root.join("Downloads");
    fs::create_dir_all(&downloads)
        .map_err(|error| format!("Could not create the Downloads folder: {error}"))?;
    let canonical_downloads = downloads
        .canonicalize()
        .map_err(|error| format!("Could not access the Downloads folder: {error}"))?;
    if !canonical_downloads.starts_with(&canonical_root) {
        return Err(
            "The Downloads folder must stay inside the selected AI work directory".to_string(),
        );
    }
    Ok(canonical_downloads)
}

async fn download_media_audio(
    url: &reqwest::Url,
    knowledge_root: &Path,
) -> Result<PathBuf, String> {
    if !supports_media_url(url) {
        return Err("This URL is not a supported media link".to_string());
    }
    let executable = ensure_media_fetcher().await?;
    let directory = media_download_directory(knowledge_root)?;
    let template = directory.join("%(title)s [%(id)s].%(ext)s");
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
                "Douyin still rejected the fresh local browser session. Open the link in Edge, Chrome, or Firefox, refresh it, then retry. TierNote does not store browser cookies.{}",
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
    let canonical_dir = directory;
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
    Ok(canonical_path)
}

fn runtime_spec(id: &str) -> Option<ResourceSpec> {
    match (id, std::env::consts::OS, std::env::consts::ARCH) {
        ("firered", _, _) => Some(ResourceSpec {
            id: "firered",
            kind: "runtime",
            urls: &["https://github.com/FireRedTeam/FireRedASR2S/archive/4e7d9aaf4482a47cec1724807026b9b151926eb5.zip"],
            file_name: "FireRedASR2S-4e7d9aaf.zip",
            sha256: "5c27f56cb8aee7436b909297b5b7ac668574d74150c87fa85e3a1ec92ad11f2c",
            expected_size: 7_782_929,
            archive: ArchiveKind::Zip,
        }),
        ("native", "windows", "x86_64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            urls: &["https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip"],
            file_name: "whisper-bin-x64.zip",
            sha256: "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a",
            expected_size: 8_194_445,
            archive: ArchiveKind::Zip,
        }),
        ("native", "linux", "x86_64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            urls: &["https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-x64.tar.gz"],
            file_name: "whisper-bin-ubuntu-x64.tar.gz",
            sha256: "46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1",
            expected_size: 9_497_583,
            archive: ArchiveKind::TarGz,
        }),
        ("native", "linux", "aarch64") => Some(ResourceSpec {
            id: "native",
            kind: "runtime",
            urls: &["https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-arm64.tar.gz"],
            file_name: "whisper-bin-ubuntu-arm64.tar.gz",
            sha256: "7e26fa6a36d9174d5c0bf033ccbc026c3b5e569e2ee787058241346ef5392719",
            expected_size: 4_572_842,
            archive: ArchiveKind::TarGz,
        }),
        ("cuda", "windows", "x86_64") => Some(ResourceSpec {
            id: "cuda",
            kind: "runtime",
            urls: &["https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-cublas-12.4.0-bin-x64.zip"],
            file_name: "whisper-cublas-12.4.0-bin-x64.zip",
            sha256: "443110ddaad70d4290ab2e77179e31cf712035bbc4fad56bb4519a90c917b39c",
            expected_size: 670_611_449,
            archive: ArchiveKind::Zip,
        }),
        ("funasr", "windows", "x86_64") => Some(ResourceSpec {
            id: "funasr",
            kind: "runtime",
            urls: &["https://github.com/modelscope/FunASR/releases/download/runtime-llamacpp-v0.2.0/funasr-llamacpp-windows-x64.zip"],
            file_name: "funasr-llamacpp-windows-x64.zip",
            sha256: "297c962346d7e30d7a7c2c860dfaab3ff07d01fddf15e6fc5212ca9545441a51",
            expected_size: 4_957_457,
            archive: ArchiveKind::Zip,
        }),
        ("funasr", "linux", "x86_64") => Some(ResourceSpec {
            id: "funasr",
            kind: "runtime",
            urls: &["https://github.com/modelscope/FunASR/releases/download/runtime-llamacpp-v0.2.0/funasr-llamacpp-linux-x64.tar.gz"],
            file_name: "funasr-llamacpp-linux-x64.tar.gz",
            sha256: "15e6407143b4fb91d90bb37f2a41c64c4d48ea0fbe6404b88a9b70269c84f240",
            expected_size: 8_009_291,
            archive: ArchiveKind::TarGz,
        }),
        ("funasr", "linux", "aarch64") => Some(ResourceSpec {
            id: "funasr",
            kind: "runtime",
            urls: &["https://github.com/modelscope/FunASR/releases/download/runtime-llamacpp-v0.2.0/funasr-llamacpp-linux-arm64.tar.gz"],
            file_name: "funasr-llamacpp-linux-arm64.tar.gz",
            sha256: "c78987b2384c6aef339aea1bcd0e130070455d6394fa7ab7ca26840ead10d5da",
            expected_size: 7_977_137,
            archive: ArchiveKind::TarGz,
        }),
        ("funasr", "macos", "aarch64") => Some(ResourceSpec {
            id: "funasr",
            kind: "runtime",
            urls: &["https://github.com/modelscope/FunASR/releases/download/runtime-llamacpp-v0.2.0/funasr-llamacpp-macos-arm64.tar.gz"],
            file_name: "funasr-llamacpp-macos-arm64.tar.gz",
            sha256: "416cbb289e31cb7575365d382155074e922fd061807a37b9ca0247dabd9bc6f9",
            expected_size: 7_353_175,
            archive: ArchiveKind::TarGz,
        }),
        _ => None,
    }
}

fn model_spec(id: &str) -> Option<ResourceSpec> {
    match id {
        "fireredasr2-aed" => Some(ResourceSpec {
            id: "fireredasr2-aed",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/xukaituo/FireRedASR2-AED/resolve/master/model.pth.tar",
                "https://huggingface.co/FireRedTeam/FireRedASR2-AED/resolve/2304afed56eacfee6256dee5937ed22ffa0b64ec/model.pth.tar?download=true",
            ],
            file_name: "fireredasr2-aed/model.pth.tar",
            sha256: "4677cbd30988d63ed3e777f6a42a1e5260a3865317f6e15e488bef40954f7054",
            expected_size: 4_731_558_506,
            archive: ArchiveKind::None,
        }),
        "fireredasr2-llm" => Some(ResourceSpec {
            id: "fireredasr2-llm",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/model.pth.tar",
                "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/model.pth.tar?download=true",
            ],
            file_name: "fireredasr2-llm/model.pth.tar",
            sha256: "6ebd76ce1799e72c3180cf73eca036fee338630a95c0069361ea91c894544bcd",
            expected_size: 3_627_720_250,
            archive: ArchiveKind::None,
        }),
        "fast" => Some(ResourceSpec {
            id: "fast",
            kind: "model",
            urls: &["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true"],
            file_name: "ggml-base.bin",
            sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
            expected_size: 147_951_465,
            archive: ArchiveKind::None,
        }),
        "standard" => Some(ResourceSpec {
            id: "standard",
            kind: "model",
            urls: &["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true"],
            file_name: "ggml-small.bin",
            sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
            expected_size: 487_601_967,
            archive: ArchiveKind::None,
        }),
        "accurate" => Some(ResourceSpec {
            id: "accurate",
            kind: "model",
            urls: &["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin?download=true"],
            file_name: "ggml-medium.bin",
            sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
            expected_size: 1_533_763_059,
            archive: ArchiveKind::None,
        }),
        "sensevoice-small" => Some(ResourceSpec {
            id: "sensevoice-small",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/FunAudioLLM/SenseVoiceSmall-GGUF/resolve/6f13884973ec2d74b57d2ffdb65f67c95614786f/sensevoice-small-q8.gguf",
                "https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF/resolve/cebc2cdd171e895d783040dbd15f10f3a76f7151/sensevoice-small-q8.gguf?download=true",
            ],
            file_name: "sensevoice-small-q8.gguf",
            sha256: "4ae45c94422de949b387e2e0fb10d7e14e4c42c69db30c3444ecc7d4b844b7c5",
            expected_size: 254_208_320,
            archive: ArchiveKind::None,
        }),
        "paraformer-large" => Some(ResourceSpec {
            id: "paraformer-large",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/FunAudioLLM/Paraformer-GGUF/resolve/6231c426de8033aa6e5aeceaea63b4645afce449/paraformer-q8.gguf",
                "https://huggingface.co/FunAudioLLM/Paraformer-GGUF/resolve/1a5063b305a2b4e418ccffaf7be2c02a3cac6c89/paraformer-q8.gguf?download=true",
            ],
            file_name: "paraformer-q8.gguf",
            sha256: "42bf76ea1575a336aaca4c1b7c01a82b79113e6d04d0d6b799561bfcf07ee011",
            expected_size: 236_929_024,
            archive: ArchiveKind::None,
        }),
        "funasr-nano" => Some(ResourceSpec {
            id: "funasr-nano",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/51dcf4922439c10e0c2e59bc99be8a343d2fe71f/qwen3-0.6b-q4km.gguf",
                "https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/46e849502a867080d66d351b8dfb1018b607e509/qwen3-0.6b-q4km.gguf?download=true",
            ],
            file_name: "qwen3-0.6b-q4km.gguf",
            sha256: "cc5057552aa9dddedcda73ea8889854e8a257eb07d0a561b7234465c1e856f22",
            expected_size: 484_219_776,
            archive: ArchiveKind::None,
        }),
        "funasr-nano-encoder" => Some(ResourceSpec {
            id: "funasr-nano-encoder",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/51dcf4922439c10e0c2e59bc99be8a343d2fe71f/funasr-encoder-f16.gguf",
                "https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-GGUF/resolve/46e849502a867080d66d351b8dfb1018b607e509/funasr-encoder-f16.gguf?download=true",
            ],
            file_name: "funasr-encoder-f16.gguf",
            sha256: "f92f91d01a24fbed6c863495b2ee8c6a6788144a02858b75743f0946668de8a2",
            expected_size: 469_331_008,
            archive: ArchiveKind::None,
        }),
        "funasr-vad" => Some(ResourceSpec {
            id: "funasr-vad",
            kind: "model",
            urls: &[
                "https://modelscope.cn/models/FunAudioLLM/fsmn-vad-GGUF/resolve/f04fc3013641c8d59c156e2cbf171c1ad596f74d/fsmn-vad.gguf",
                "https://huggingface.co/FunAudioLLM/fsmn-vad-GGUF/resolve/6840bae4c5c92ee8c04faaf4db23dd0105098d7f/fsmn-vad.gguf?download=true",
            ],
            file_name: "fsmn-vad.gguf",
            sha256: "1270f2559c495f4e7b6e739541151027d360761a3fda43fc147034f5719f5479",
            expected_size: 1_720_512,
            archive: ArchiveKind::None,
        }),
        _ => None,
    }
}

fn firered_model_bundle(id: &str) -> Option<Vec<ResourceSpec>> {
    let target = model_spec(id)?;
    let mut specs = vec![target];
    match id {
        "fireredasr2-aed" => {
            specs.extend([
                ResourceSpec {
                    id: "fireredasr2-aed-cmvn",
                    kind: "model",
                    urls: &[
                        "https://modelscope.cn/models/xukaituo/FireRedASR2-AED/resolve/master/cmvn.ark",
                        "https://huggingface.co/FireRedTeam/FireRedASR2-AED/resolve/2304afed56eacfee6256dee5937ed22ffa0b64ec/cmvn.ark?download=true",
                    ],
                    file_name: "fireredasr2-aed/cmvn.ark",
                    sha256: "6efba6105429d1630c05d818d956bfe4edfad37a04b3b27bb5a029b9adb37945",
                    expected_size: 1_311,
                    archive: ArchiveKind::None,
                },
                ResourceSpec {
                    id: "fireredasr2-aed-dict",
                    kind: "model",
                    urls: &[
                        "https://modelscope.cn/models/xukaituo/FireRedASR2-AED/resolve/master/dict.txt",
                        "https://huggingface.co/FireRedTeam/FireRedASR2-AED/resolve/2304afed56eacfee6256dee5937ed22ffa0b64ec/dict.txt?download=true",
                    ],
                    file_name: "fireredasr2-aed/dict.txt",
                    sha256: "1bc613de2112d257e61a349c3e72d1b1a9cf19c33d3ca954197ad2171e5ea07b",
                    expected_size: 79_172,
                    archive: ArchiveKind::None,
                },
                ResourceSpec {
                    id: "fireredasr2-aed-tokenizer",
                    kind: "model",
                    urls: &[
                        "https://modelscope.cn/models/xukaituo/FireRedASR2-AED/resolve/master/train_bpe1000.model",
                        "https://huggingface.co/FireRedTeam/FireRedASR2-AED/resolve/2304afed56eacfee6256dee5937ed22ffa0b64ec/train_bpe1000.model?download=true",
                    ],
                    file_name: "fireredasr2-aed/train_bpe1000.model",
                    sha256: "473bbc157cb4eade2059b30a3c877a1c29bd50cadbfbed869ae36eeade7fee07",
                    expected_size: 251_707,
                    archive: ArchiveKind::None,
                },
            ]);
        }
        "fireredasr2-llm" => {
            specs.extend([
                ResourceSpec {
                    id: "fireredasr2-llm-encoder",
                    kind: "model",
                    urls: &[
                        "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/asr_encoder.pth.tar",
                        "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/asr_encoder.pth.tar?download=true",
                    ],
                    file_name: "fireredasr2-llm/asr_encoder.pth.tar",
                    sha256: "6cfa83b4d692c0ac8b61a767fc4253a6350c11e1edcdf6418d040b41240b900e",
                    expected_size: 1_472,
                    archive: ArchiveKind::None,
                },
                ResourceSpec {
                    id: "fireredasr2-llm-cmvn",
                    kind: "model",
                    urls: &[
                        "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/cmvn.ark",
                        "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/cmvn.ark?download=true",
                    ],
                    file_name: "fireredasr2-llm/cmvn.ark",
                    sha256: "6efba6105429d1630c05d818d956bfe4edfad37a04b3b27bb5a029b9adb37945",
                    expected_size: 1_311,
                    archive: ArchiveKind::None,
                },
                firered_llm_file("qwen-config", "Qwen2-7B-Instruct/config.json", "8b9a4f6c0acf4854a2d301616d4203039c3d7972cb0a557dae98686b6c3ae4b2", 663),
                firered_llm_file("qwen-generation", "Qwen2-7B-Instruct/generation_config.json", "3a8f9087e486054c8a4a08dae2e5a3ba62e23da212b5b8c08bc42cb983c3459f", 243),
                firered_llm_file("qwen-merges", "Qwen2-7B-Instruct/merges.txt", "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3", 1_671_839),
                firered_llm_file("qwen-index", "Qwen2-7B-Instruct/model.safetensors.index.json", "f00d17cbf433746c391ad43948613e373aa51222dbee3b0db61ffff59a74bb1a", 27_752),
                firered_llm_file("qwen-tokenizer", "Qwen2-7B-Instruct/tokenizer.json", "f7c9b2dba4a296b1aa76c16a34b8225c0c118978400d4bb66bff0902d702f5b8", 7_028_015),
                firered_llm_file("qwen-tokenizer-config", "Qwen2-7B-Instruct/tokenizer_config.json", "be21acaf90e7f449b7282fdef7b06516a0102476e86cbc2108e18ac071f9cc9c", 1_288),
                firered_llm_file("qwen-vocab", "Qwen2-7B-Instruct/vocab.json", "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", 2_776_833),
                firered_llm_file("qwen-shard-1", "Qwen2-7B-Instruct/model-00001-of-00004.safetensors", "26d9919262ccd063fcdfd926763fe9025ef1e3073767aaa8c83a375d7c5140c4", 3_945_426_872),
                firered_llm_file("qwen-shard-2", "Qwen2-7B-Instruct/model-00002-of-00004.safetensors", "f5bb99fdadcac55c2c176497ec99f088a1764e78ed986fa4a0d45d12426ef0fa", 3_864_726_352),
                firered_llm_file("qwen-shard-3", "Qwen2-7B-Instruct/model-00003-of-00004.safetensors", "0b749a4446d7cda007d5e7bd9f908849d08d89867192d4c039dc167e9ab5a02e", 3_864_726_408),
                firered_llm_file("qwen-shard-4", "Qwen2-7B-Instruct/model-00004-of-00004.safetensors", "da724bb7d3c3512eb371aa6caa5bcc08d78bda84f94e00ae9a9b2124e3e9c62f", 3_556_392_240),
            ]);
        }
        _ => return None,
    }
    Some(specs)
}

fn firered_llm_file(
    suffix: &'static str,
    path: &'static str,
    sha256: &'static str,
    expected_size: u64,
) -> ResourceSpec {
    let id = match suffix {
        "qwen-config" => "fireredasr2-llm-qwen-config",
        "qwen-generation" => "fireredasr2-llm-qwen-generation",
        "qwen-merges" => "fireredasr2-llm-qwen-merges",
        "qwen-index" => "fireredasr2-llm-qwen-index",
        "qwen-tokenizer" => "fireredasr2-llm-qwen-tokenizer",
        "qwen-tokenizer-config" => "fireredasr2-llm-qwen-tokenizer-config",
        "qwen-vocab" => "fireredasr2-llm-qwen-vocab",
        "qwen-shard-1" => "fireredasr2-llm-qwen-shard-1",
        "qwen-shard-2" => "fireredasr2-llm-qwen-shard-2",
        "qwen-shard-3" => "fireredasr2-llm-qwen-shard-3",
        _ => "fireredasr2-llm-qwen-shard-4",
    };
    let urls: &'static [&'static str] = match path {
        "Qwen2-7B-Instruct/config.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/config.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/config.json?download=true",
        ],
        "Qwen2-7B-Instruct/generation_config.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/generation_config.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/generation_config.json?download=true",
        ],
        "Qwen2-7B-Instruct/merges.txt" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/merges.txt",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/merges.txt?download=true",
        ],
        "Qwen2-7B-Instruct/model.safetensors.index.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/model.safetensors.index.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/model.safetensors.index.json?download=true",
        ],
        "Qwen2-7B-Instruct/tokenizer.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/tokenizer.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/tokenizer.json?download=true",
        ],
        "Qwen2-7B-Instruct/tokenizer_config.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/tokenizer_config.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/tokenizer_config.json?download=true",
        ],
        "Qwen2-7B-Instruct/vocab.json" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/vocab.json",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/vocab.json?download=true",
        ],
        "Qwen2-7B-Instruct/model-00001-of-00004.safetensors" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/model-00001-of-00004.safetensors",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/model-00001-of-00004.safetensors?download=true",
        ],
        "Qwen2-7B-Instruct/model-00002-of-00004.safetensors" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/model-00002-of-00004.safetensors",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/model-00002-of-00004.safetensors?download=true",
        ],
        "Qwen2-7B-Instruct/model-00003-of-00004.safetensors" => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/model-00003-of-00004.safetensors",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/model-00003-of-00004.safetensors?download=true",
        ],
        _ => &[
            "https://modelscope.cn/models/xukaituo/FireRedASR2-LLM/resolve/master/Qwen2-7B-Instruct/model-00004-of-00004.safetensors",
            "https://huggingface.co/FireRedTeam/FireRedASR2-LLM/resolve/2c5e0f415b9afb8f67cb8b00ea4c54959f70e824/Qwen2-7B-Instruct/model-00004-of-00004.safetensors?download=true",
        ],
    };
    ResourceSpec {
        id,
        kind: "model",
        urls,
        file_name: match path {
            "Qwen2-7B-Instruct/config.json" => "fireredasr2-llm/Qwen2-7B-Instruct/config.json",
            "Qwen2-7B-Instruct/generation_config.json" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/generation_config.json"
            }
            "Qwen2-7B-Instruct/merges.txt" => "fireredasr2-llm/Qwen2-7B-Instruct/merges.txt",
            "Qwen2-7B-Instruct/model.safetensors.index.json" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/model.safetensors.index.json"
            }
            "Qwen2-7B-Instruct/tokenizer.json" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/tokenizer.json"
            }
            "Qwen2-7B-Instruct/tokenizer_config.json" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/tokenizer_config.json"
            }
            "Qwen2-7B-Instruct/vocab.json" => "fireredasr2-llm/Qwen2-7B-Instruct/vocab.json",
            "Qwen2-7B-Instruct/model-00001-of-00004.safetensors" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/model-00001-of-00004.safetensors"
            }
            "Qwen2-7B-Instruct/model-00002-of-00004.safetensors" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/model-00002-of-00004.safetensors"
            }
            "Qwen2-7B-Instruct/model-00003-of-00004.safetensors" => {
                "fireredasr2-llm/Qwen2-7B-Instruct/model-00003-of-00004.safetensors"
            }
            _ => "fireredasr2-llm/Qwen2-7B-Instruct/model-00004-of-00004.safetensors",
        },
        sha256,
        expected_size,
        archive: ArchiveKind::None,
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

fn installed_path(spec: ResourceSpec, runtime_id: &str) -> PathBuf {
    let base = resource_root_for_runtime(runtime_id).join(format!("{}s", spec.kind));
    if spec.kind == "runtime" && spec.id == "firered" {
        return base.join("firered").join(".ready");
    }
    match spec.archive {
        ArchiveKind::None => base.join(spec.file_name),
        _ => base.join(spec.id).join(".installed"),
    }
}

fn resource_bytes(spec: ResourceSpec, runtime_id: &str) -> u64 {
    fs::metadata(installed_path(spec, runtime_id))
        .map(|meta| meta.len())
        .unwrap_or(0)
}

fn download_key(kind: &str, id: &str, runtime_id: &str) -> String {
    format!("{kind}:{runtime_id}:{id}")
}

#[tauri::command]
pub fn list_transcription_resources(
    state: State<'_, TranscriptionDownloadState>,
) -> Result<Vec<TranscriptionResourceStatus>, String> {
    let downloads = state
        .downloads
        .lock()
        .map_err(|_| "Download state is unavailable")?;
    let failures = state
        .failures
        .lock()
        .map_err(|_| "Download failure state is unavailable")?;
    let mut specs = ["sensevoice-small", "paraformer-large", "funasr-nano"]
        .into_iter()
        .map(|id| (model_spec(id).unwrap(), "funasr"))
        .collect::<Vec<_>>();
    for runtime_id in ["native", "cuda"] {
        if runtime_spec(runtime_id).is_some() {
            specs.extend(
                ["fast", "standard", "accurate"]
                    .into_iter()
                    .map(|id| (model_spec(id).unwrap(), runtime_id)),
            );
        }
    }
    for id in ["fireredasr2-aed", "fireredasr2-llm"] {
        specs.push((
            model_spec(id).expect("FireRedASR2 model should exist"),
            "firered",
        ));
    }
    if let Some(spec) = runtime_spec("native") {
        specs.push((spec, "native"));
    }
    if let Some(spec) = runtime_spec("cuda") {
        specs.push((spec, "cuda"));
    }
    if let Some(spec) = runtime_spec("funasr") {
        specs.push((spec, "funasr"));
    }
    if let Some(spec) = runtime_spec("firered") {
        specs.push((spec, "firered"));
    }
    Ok(specs
        .into_iter()
        .map(|(spec, runtime_id)| {
            let package = resource_bundle(spec.kind, spec.id).unwrap_or_else(|_| vec![spec]);
            TranscriptionResourceStatus {
                id: spec.id.to_string(),
                kind: spec.kind.to_string(),
                runtime_id: runtime_id.to_string(),
                installed: package
                    .iter()
                    .all(|item| installed_path(*item, runtime_id).is_file()),
                downloading: downloads.contains_key(&download_key(spec.kind, spec.id, runtime_id)),
                bytes: package
                    .iter()
                    .map(|item| resource_bytes(*item, runtime_id))
                    .sum(),
                error: failures
                    .get(&download_key(spec.kind, spec.id, runtime_id))
                    .cloned(),
            }
        })
        .collect())
}

fn emit_progress(
    app: &AppHandle,
    spec: ResourceSpec,
    runtime_id: &str,
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
            runtime_id: runtime_id.to_string(),
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

fn model_runtime_id(model: &str) -> Option<&'static str> {
    match model {
        "fireredasr2-aed" | "fireredasr2-llm" => Some("firered"),
        "fast" | "standard" | "accurate" => Some("native"),
        "sensevoice-small"
        | "paraformer-large"
        | "funasr-nano"
        | "funasr-nano-encoder"
        | "funasr-vad" => Some("funasr"),
        _ => None,
    }
}

fn model_is_compatible_with_runtime(model: &str, runtime_id: &str) -> bool {
    match model_runtime_id(model) {
        Some("native") => matches!(runtime_id, "native" | "cuda"),
        Some(expected) => runtime_id == expected,
        None => false,
    }
}

fn resource_bundle(kind: &str, id: &str) -> Result<Vec<ResourceSpec>, String> {
    let target = resource_spec(kind, id)?;
    if kind == "runtime" {
        let mut specs = vec![target];
        if id == "funasr" {
            specs.push(model_spec("funasr-vad").expect("FunASR VAD resource should exist"));
        }
        return Ok(specs);
    }
    if kind != "model" || model_runtime_id(id).is_none() {
        return Ok(vec![target]);
    }
    if let Some(package) = firered_model_bundle(id) {
        return Ok(package);
    }
    let mut specs = Vec::new();
    if id == "funasr-nano" {
        specs.push(
            model_spec("funasr-nano-encoder").expect("FunASR Nano encoder resource should exist"),
        );
    }
    specs.push(target);
    Ok(specs)
}

async fn download_resource_spec(
    app: &AppHandle,
    spec: ResourceSpec,
    runtime_id: &str,
    token: &CancellationToken,
    progress_spec: ResourceSpec,
    completed_bytes: u64,
    package_bytes: u64,
) -> Result<(), String> {
    if installed_path(spec, runtime_id).is_file() {
        return Ok(());
    }

    let target_dir = resource_root_for_runtime(runtime_id).join(format!("{}s", spec.kind));
    fs::create_dir_all(&target_dir)
        .map_err(|error| format!("Could not create resource directory: {error}"))?;
    let partial = target_dir.join(format!("{}.part", spec.file_name));
    if let Some(parent) = partial.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create resource directory: {error}"))?;
    }
    let client = reqwest::Client::new();
    let mut last_error = None;
    for source in spec.urls {
        if token.is_cancelled() {
            let _ = fs::remove_file(&partial);
            return Err("Download cancelled".to_string());
        }
        let response = match client
            .get(*source)
            .header("User-Agent", "TierNote")
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(response) => response,
            Err(error) => {
                last_error = Some(format!("Resource source failed: {error}"));
                continue;
            }
        };
        let total = response.content_length().unwrap_or(spec.expected_size);
        let maximum = spec.expected_size.saturating_add(1024 * 1024);
        if total > maximum {
            last_error = Some("Resource download is larger than expected".to_string());
            continue;
        }
        let mut file = fs::File::create(&partial)
            .map_err(|error| format!("Could not create resource file: {error}"))?;
        let mut downloaded = 0_u64;
        emit_progress(
            app,
            progress_spec,
            runtime_id,
            "downloading",
            completed_bytes,
            package_bytes,
            None,
        );
        let mut stream = response.bytes_stream();
        let mut source_error = None;
        while let Some(chunk) = stream.next().await {
            if token.is_cancelled() {
                let _ = fs::remove_file(&partial);
                return Err("Download cancelled".to_string());
            }
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => {
                    source_error = Some(format!("Resource download was interrupted: {error}"));
                    break;
                }
            };
            downloaded += chunk.len() as u64;
            if downloaded > maximum {
                source_error = Some("Resource download is larger than expected".to_string());
                break;
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Could not save resource: {error}"))?;
            emit_progress(
                app,
                progress_spec,
                runtime_id,
                "downloading",
                completed_bytes.saturating_add(downloaded.min(spec.expected_size)),
                package_bytes,
                None,
            );
        }
        if let Some(message) = source_error {
            drop(file);
            let _ = fs::remove_file(&partial);
            last_error = Some(message);
            continue;
        }
        file.flush()
            .map_err(|error| format!("Could not finish resource file: {error}"))?;
        drop(file);
        if let Err(error) = verify_file(&partial, spec) {
            let _ = fs::remove_file(&partial);
            last_error = Some(error);
            continue;
        }
        match spec.archive {
            ArchiveKind::None => {
                let target = target_dir.join(spec.file_name);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("Could not create model directory: {error}"))?;
                }
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
        return Ok(());
    }
    Err(last_error.unwrap_or_else(|| "No download source is available".to_string()))
}

#[tauri::command]
pub async fn download_transcription_resource(
    app: AppHandle,
    state: State<'_, TranscriptionDownloadState>,
    kind: String,
    id: String,
    runtime_id: String,
) -> Result<(), String> {
    validate_storage_runtime(&runtime_id)?;
    if (kind == "runtime" && id != runtime_id)
        || (kind == "model" && !model_is_compatible_with_runtime(&id, &runtime_id))
    {
        return Err(
            "This resource does not belong to the selected transcription engine".to_string(),
        );
    }
    let spec = resource_spec(&kind, &id)?;
    let bundle = resource_bundle(&kind, &id)?;
    let keys = bundle
        .iter()
        .map(|item| download_key(item.kind, item.id, &runtime_id))
        .collect::<Vec<_>>();
    let token = CancellationToken::new();
    {
        let mut downloads = state
            .downloads
            .lock()
            .map_err(|_| "Download state is unavailable")?;
        if keys.iter().any(|key| downloads.contains_key(key)) {
            return Err(
                "This resource or one of its dependencies is already downloading".to_string(),
            );
        }
        for key in &keys {
            downloads.insert(key.clone(), token.clone());
        }
    }
    state
        .failures
        .lock()
        .map_err(|_| "Download failure state is unavailable")?
        .remove(&download_key(&kind, &id, &runtime_id));
    let package_bytes = bundle
        .iter()
        .filter(|item| !installed_path(**item, &runtime_id).is_file())
        .map(|item| item.expected_size)
        .sum::<u64>()
        .max(1);
    let result: Result<(), String> = async {
        let mut completed_bytes = 0_u64;
        for item in bundle {
            let already_installed = installed_path(item, &runtime_id).is_file();
            download_resource_spec(
                &app,
                item,
                &runtime_id,
                &token,
                spec,
                completed_bytes,
                package_bytes,
            )
            .await?;
            if !already_installed {
                completed_bytes = completed_bytes.saturating_add(item.expected_size);
            }
        }
        if kind == "runtime" && id == "firered" {
            emit_progress(
                &app,
                spec,
                &runtime_id,
                "downloading",
                package_bytes,
                package_bytes,
                None,
            );
            prepare_firered_runtime(&token).await?;
        }
        emit_progress(
            &app,
            spec,
            &runtime_id,
            "installed",
            package_bytes,
            package_bytes,
            None,
        );
        Ok(())
    }
    .await;
    if let Ok(mut downloads) = state.downloads.lock() {
        for key in &keys {
            downloads.remove(key);
        }
    }
    if let Err(message) = &result {
        if !token.is_cancelled() {
            if let Ok(mut failures) = state.failures.lock() {
                failures.insert(download_key(&kind, &id, &runtime_id), message.clone());
            }
        }
        emit_progress(
            &app,
            spec,
            &runtime_id,
            if token.is_cancelled() {
                "cancelled"
            } else {
                "error"
            },
            0,
            spec.expected_size,
            Some(message.clone()),
        );
    } else if let Ok(mut failures) = state.failures.lock() {
        failures.remove(&download_key(&kind, &id, &runtime_id));
    }
    result
}

#[tauri::command]
pub fn cancel_transcription_download(
    state: State<'_, TranscriptionDownloadState>,
    kind: String,
    id: String,
    runtime_id: String,
) -> Result<(), String> {
    let key = download_key(&kind, &id, &runtime_id);
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
pub fn remove_transcription_resource(
    kind: String,
    id: String,
    runtime_id: String,
) -> Result<(), String> {
    let bundle = resource_bundle(&kind, &id)?;
    if kind == "model" && matches!(id.as_str(), "fireredasr2-aed" | "fireredasr2-llm") {
        let directory = resource_root_for_runtime(&runtime_id)
            .join("models")
            .join(&id);
        return match fs::remove_dir_all(directory) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Could not remove transcription resource: {error}")),
        };
    }
    for spec in bundle {
        let target = installed_path(spec, &runtime_id);
        let removal = match spec.archive {
            ArchiveKind::None => fs::remove_file(target),
            _ => target
                .parent()
                .map(fs::remove_dir_all)
                .unwrap_or_else(|| Err(std::io::Error::other("Invalid resource path"))),
        };
        match removal {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not remove transcription resource: {error}")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn fixture_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "tiernote-transcription-{label}-{}-{}",
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
    fn firered_accepts_only_python_versions_with_binary_fbank_support() {
        for version in ["Python 3.11.15", "Python 3.12.9", "Python 3.13.7"] {
            assert!(supported_python_version_text(version), "{version}");
        }
        for version in ["Python 3.10.18", "Python 4.0.0"] {
            assert!(!supported_python_version_text(version), "{version}");
        }
        assert_eq!(
            supported_python_version_text("Python 3.14.0"),
            !cfg!(windows)
        );
        assert_eq!(FIRERED_KALDI_FBANK, "kaldi-native-fbank==1.22.3");
        assert_eq!(FIRERED_PEFT, "peft==0.20.0");
    }

    #[test]
    fn storage_config_keeps_legacy_directory_as_a_fallback() {
        let config: TranscriptionStorageConfig =
            serde_json::from_str(r#"{"directory":"D:\\Speech"}"#)
                .expect("legacy transcription storage should deserialize");
        assert_eq!(config.directory.as_deref(), Some(r"D:\Speech"));
        assert!(config.directories.is_empty());
    }

    #[test]
    fn storage_migration_rejects_resource_subtrees_but_allows_family_siblings() {
        let current = Path::new("storage/transcription");
        assert!(storage_destination_is_unsafe(
            current,
            &current.join("runtimes").join("funasr").join("new")
        ));
        assert!(storage_destination_is_unsafe(
            current,
            &current.join("models").join("new")
        ));
        assert!(storage_destination_is_unsafe(current, Path::new("storage")));
        assert!(!storage_destination_is_unsafe(
            current,
            &current.join("FunASR")
        ));
        assert!(!storage_destination_is_unsafe(
            current,
            Path::new("other/TierNote Transcription/FunASR")
        ));
    }

    #[test]
    fn whisper_models_can_live_with_either_whisper_runtime() {
        assert!(model_is_compatible_with_runtime("standard", "native"));
        assert!(model_is_compatible_with_runtime("standard", "cuda"));
        assert!(!model_is_compatible_with_runtime("standard", "funasr"));
        assert!(model_is_compatible_with_runtime(
            "sensevoice-small",
            "funasr"
        ));
        assert!(model_is_compatible_with_runtime(
            "fireredasr2-aed",
            "firered"
        ));
        assert!(!model_is_compatible_with_runtime(
            "fireredasr2-aed",
            "funasr"
        ));
    }

    #[test]
    fn firered_models_are_complete_verified_bundles() {
        let aed = firered_model_bundle("fireredasr2-aed").expect("AED bundle should exist");
        assert_eq!(aed.len(), 4);
        assert!(aed.iter().all(|item| !item.sha256.is_empty()));
        assert!(aed
            .iter()
            .any(|item| item.file_name.ends_with("train_bpe1000.model")));

        let llm = firered_model_bundle("fireredasr2-llm").expect("LLM bundle should exist");
        assert_eq!(llm.len(), 14);
        assert!(llm.iter().all(|item| !item.sha256.is_empty()));
        assert_eq!(
            llm.iter()
                .filter(|item| item.file_name.ends_with(".safetensors"))
                .count(),
            4
        );
    }

    #[test]
    fn firered_runtime_source_is_revision_pinned() {
        let runtime = runtime_spec("firered").expect("FireRedASR2 runtime should exist");
        assert!(runtime.urls[0].contains(FIRERED_SOURCE_REVISION));
        assert_eq!(runtime.expected_size, 7_782_929);
        assert_eq!(runtime.sha256.len(), 64);
    }

    #[cfg(windows)]
    #[test]
    fn display_path_hides_windows_extended_path_prefixes() {
        assert_eq!(display_path(Path::new(r"\\?\E:\Speech")), r"E:\Speech");
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\speech")),
            r"\\server\speech"
        );
    }

    #[test]
    fn cpu_backend_retry_only_matches_a_crash_during_backend_startup() {
        const BACKEND: &[u8] = b"load_backend: loaded CPU backend from ggml-cpu-haswell.dll";
        assert!(!cpu_backend_startup_failure(true, BACKEND));
        assert!(cpu_backend_startup_failure(false, BACKEND));
        assert!(!cpu_backend_startup_failure(
            false,
            b"load_backend: loaded CPU backend from ggml-cpu-haswell.dll\nwhisper_init_from_file_with_params_no_state: loading model"
        ));
    }

    #[cfg(windows)]
    #[test]
    fn compatible_cpu_runtime_contains_only_the_generic_backend() {
        let root = fixture_root("compatible-cpu");
        let source = root.join("source");
        let workspace = root.join("workspace");
        fs::create_dir_all(&source).expect("source runtime should be created");
        for name in [
            "whisper-cli.exe",
            "whisper.dll",
            "ggml.dll",
            "ggml-base.dll",
            "ggml-cpu-x64.dll",
            "ggml-cpu-haswell.dll",
        ] {
            fs::write(source.join(name), name).expect("runtime fixture should be written");
        }

        let executable =
            prepare_windows_compatible_cpu_runtime(&source.join("whisper-cli.exe"), &workspace)
                .expect("compatible runtime should be prepared");
        let destination = executable.parent().unwrap();
        assert!(executable.is_file());
        assert!(destination.join("ggml-cpu-x64.dll").is_file());
        assert!(!destination.join("ggml-cpu-haswell.dll").exists());

        fs::remove_dir_all(root).expect("compatible runtime fixture should be removed");
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
    fn media_downloads_stay_inside_the_selected_work_directory() {
        let root = fixture_root("downloads");
        fs::create_dir_all(&root).expect("work directory fixture should be created");

        let downloads = media_download_directory(&root)
            .expect("Downloads should be created inside the selected work directory");
        assert_eq!(downloads, root.canonicalize().unwrap().join("Downloads"));
        assert!(downloads.is_dir());

        fs::remove_dir_all(root).expect("work directory fixture should be removed");
    }

    #[test]
    fn media_url_detection_only_accepts_supported_hosts() {
        for source in [
            "https://www.youtube.com/watch?v=example",
            "https://www.bilibili.com/video/BVexample",
            "https://b23.tv/example",
            "https://v.douyin.com/example",
            "https://www.tiktok.com/@tiernote/video/1",
            "https://www.xiaohongshu.com/explore/example",
            "https://x.com/tiernote/status/1",
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
            "https://www.tiktok.com/@tiernote/video/1",
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
            model_spec("sensevoice-small").unwrap(),
            model_spec("paraformer-large").unwrap(),
            model_spec("funasr-nano").unwrap(),
            media_fetcher_spec().unwrap(),
        ] {
            assert_eq!(spec.sha256.len(), 64);
            assert!(spec.expected_size > 0);
            assert!(spec.urls.iter().all(|url| url.starts_with("https://")));
        }
    }

    #[test]
    fn chinese_models_and_engines_are_separate_downloads() {
        for id in ["sensevoice-small", "paraformer-large", "funasr-nano"] {
            let spec = model_spec(id).expect("Chinese model should be available");
            assert!(spec.urls[0].starts_with("https://modelscope.cn/"));
            assert!(spec.urls.iter().any(|url| url.contains("huggingface.co")));
            let bundle = resource_bundle("model", id).expect("model package should resolve");
            assert_eq!(bundle.last().map(|item| item.id), Some(id));
            assert!(!bundle.iter().any(|item| item.id == "funasr"));
        }
        let nano = resource_bundle("model", "funasr-nano").unwrap();
        assert!(nano.iter().any(|item| item.id == "funasr-nano-encoder"));
        let runtime = resource_bundle("runtime", "funasr").unwrap();
        assert_eq!(runtime.first().map(|item| item.id), Some("funasr"));
        assert!(runtime.iter().any(|item| item.id == "funasr-vad"));
    }

    #[test]
    fn firered_sources_keep_mirrors_behind_one_download_action() {
        let aed = external_resource_sources("model", "fireredasr2-aed").unwrap();
        assert!(aed[0].contains("modelscope.cn"));
        assert!(aed[1].contains("huggingface.co"));
        let runtime = external_resource_sources("runtime", "firered").unwrap();
        assert!(runtime[0].contains("gitcode.com"));
        assert!(runtime[1].contains("github.com"));
    }

    #[test]
    fn funasr_srt_output_becomes_plain_transcript() {
        let source = "1\n00:00:00,190 --> 00:00:02,300\n你好，世界。\n";
        assert_eq!(parse_caption_text(source), "你好，世界。");
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
    fn diarized_transcription_keeps_speaker_labels() {
        let body = serde_json::json!({
            "segments": [
                {"speaker": "A", "text": " First line "},
                {"speaker": "B", "text": "Second line"}
            ]
        });
        assert_eq!(
            transcription_text(&body).expect("diarized text should parse"),
            "A: First line\nB: Second line"
        );
    }

    #[test]
    fn elevenlabs_adapter_uses_model_id_and_api_key() {
        let root = fixture_root("elevenlabs-adapter");
        fs::create_dir_all(&root).expect("adapter fixture directory should be created");
        let audio = root.join("audio.wav");
        fs::write(&audio, b"fixture audio").expect("adapter fixture should write");
        let (endpoint, server) = mock_transcription_server(
            |request| {
                let normalized = request.to_ascii_lowercase();
                assert!(request.starts_with("POST / "));
                assert!(normalized.contains("xi-api-key: test-key"));
                assert!(normalized.contains("content-type: multipart/form-data"));
                assert!(request.contains("model_id"));
                assert!(request.contains("scribe_v2"));
            },
            r#"{"text":"elevenlabs transcript"}"#,
        );
        let config = super::super::TranscriptionProviderConfig {
            provider_id: "elevenlabs".to_string(),
            protocol: "elevenlabs".to_string(),
            endpoint,
            model: "scribe_v2".to_string(),
            api_key: "test-key".to_string(),
        };

        let transcript = tauri::async_runtime::block_on(transcribe_elevenlabs(&config, &audio))
            .expect("adapter should return text");
        server.join().expect("mock server should finish");
        assert_eq!(transcript, "elevenlabs transcript");
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

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

const MAX_SCENES: usize = 12;
const MAX_NARRATION_CHARS: usize = 4_096;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoRequest {
    pub title: String,
    pub file_name: Option<String>,
    pub aspect_ratio: Option<String>,
    pub voice: Option<String>,
    pub scenes: Vec<VideoScene>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoScene {
    pub image_path: String,
    pub narration: String,
    pub caption: String,
    pub motion: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOutput {
    pub path: PathBuf,
    pub relative_path: String,
    pub scene_count: usize,
    pub aspect_ratio: String,
    pub format: &'static str,
}

fn video_dimensions(aspect_ratio: &str) -> Result<(u32, u32), String> {
    match aspect_ratio {
        "16:9" => Ok((1280, 720)),
        "9:16" => Ok((720, 1280)),
        "1:1" => Ok((1080, 1080)),
        _ => Err("aspectRatio must be 16:9, 9:16, or 1:1".to_string()),
    }
}

fn workspace_image(workspace_root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = relative.trim();
    let relative_path = Path::new(relative);
    if relative.is_empty()
        || relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Each imagePath must be relative to the workspace".to_string());
    }
    let extension = relative_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("Each imagePath must point to a PNG, JPEG, or WebP image".to_string());
    }
    let root = workspace_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the workspace: {error}"))?;
    let image = root
        .join(relative_path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve {relative}: {error}"))?;
    if !image.starts_with(&root) || !image.is_file() {
        return Err("Each imagePath must point to a workspace image".to_string());
    }
    Ok(image)
}

fn safe_video_stem(title: &str, file_name: Option<&str>) -> Result<String, String> {
    let file_name = file_name.map(str::trim).filter(|value| !value.is_empty());
    if let Some(file_name) = file_name {
        if Path::new(file_name).components().count() != 1 {
            return Err("fileName must be a workspace-root filename".to_string());
        }
    }
    let requested = file_name
        .and_then(|value| Path::new(value).file_stem().and_then(|stem| stem.to_str()))
        .unwrap_or_else(|| title.trim());
    let stem = requested
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character if character.is_control() => '-',
            _ => character,
        })
        .collect::<String>();
    let stem = stem
        .trim()
        .trim_matches('.')
        .chars()
        .take(80)
        .collect::<String>();
    Ok(if stem.is_empty() {
        "coffee-video".to_string()
    } else {
        stem
    })
}

fn save_rendered_video(
    root: &Path,
    stem: &str,
    rendered: &Path,
) -> Result<(PathBuf, String), String> {
    for number in 1..=999 {
        let relative = if number == 1 {
            format!("{stem}.mp4")
        } else {
            format!("{stem}-{number}.mp4")
        };
        let path = root.join(&relative);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut destination) => {
                let mut source = match fs::File::open(rendered) {
                    Ok(source) => source,
                    Err(error) => {
                        drop(destination);
                        let _ = fs::remove_file(&path);
                        return Err(format!("Could not read the completed video: {error}"));
                    }
                };
                if let Err(error) = std::io::copy(&mut source, &mut destination) {
                    drop(destination);
                    let _ = fs::remove_file(&path);
                    return Err(format!("Could not save the completed video: {error}"));
                }
                return Ok((path, relative));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not reserve the video file: {error}")),
        }
    }
    Err("Could not choose an available video filename".to_string())
}

fn ass_escape(text: &str) -> String {
    text.replace('\\', r"\\")
        .replace('{', r"\{")
        .replace('}', r"\}")
        .replace(['\r', '\n'], r"\N")
}

fn subtitle_document(caption: &str, width: u32, height: u32) -> String {
    let font = if cfg!(target_os = "windows") {
        "Microsoft YaHei"
    } else if cfg!(target_os = "macos") {
        "PingFang SC"
    } else {
        "Noto Sans CJK SC"
    };
    let font_size = if height >= 1080 { 54 } else { 42 };
    format!(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,{font},{font_size},&H00FFFFFF,&H000000FF,&H80000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,70,70,52,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,,{}\n",
        ass_escape(caption)
    )
}

fn motion_filter(motion: Option<&str>, width: u32, height: u32) -> Result<String, String> {
    let motion = motion.unwrap_or("zoom-in");
    let zoompan = match motion {
        "zoom-in" => "z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
        "zoom-out" => "z='max(1.0,1.08-on*0.0007)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
        "pan-left" => "z='1.08':x='max(0,(iw-iw/zoom)-on*0.28)':y='ih/2-(ih/zoom/2)'",
        "pan-right" => "z='1.08':x='min(iw-iw/zoom,on*0.28)':y='ih/2-(ih/zoom/2)'",
        "still" => "z='1.0':x='0':y='0'",
        _ => return Err("motion must be zoom-in, zoom-out, pan-left, pan-right, or still".into()),
    };
    Ok(format!(
        "scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},zoompan={zoompan}:d=1:s={width}x{height}:fps=30,fade=t=in:st=0:d=0.25,subtitles=scene.ass,format=yuv420p"
    ))
}

async fn run_encoder(
    app: &tauri::AppHandle,
    working_dir: &Path,
    args: Vec<String>,
) -> Result<(), String> {
    let output = app
        .shell()
        .sidecar("coffee-video-ffmpeg")
        .map_err(|error| format!("Could not locate the bundled video encoder: {error}"))?
        .current_dir(working_dir)
        .args(args)
        .output()
        .await
        .map_err(|error| format!("Could not run the bundled video encoder: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.trim().chars().take(1_500).collect::<String>();
    Err(if detail.is_empty() {
        "The bundled video encoder failed".to_string()
    } else {
        format!("The bundled video encoder failed: {detail}")
    })
}

async fn render_video(
    app: &tauri::AppHandle,
    request: &VideoRequest,
    workspace_root: &Path,
    output_root: &Path,
    temp_root: &Path,
) -> Result<VideoOutput, String> {
    let title = request.title.trim();
    if title.is_empty() || title.chars().count() > 120 {
        return Err("title must contain between 1 and 120 characters".to_string());
    }
    if request.scenes.is_empty() || request.scenes.len() > MAX_SCENES {
        return Err(format!(
            "scenes must contain between 1 and {MAX_SCENES} items"
        ));
    }
    let aspect_ratio = request.aspect_ratio.as_deref().unwrap_or("16:9");
    let (width, height) = video_dimensions(aspect_ratio)?;
    let root = workspace_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the workspace: {error}"))?;
    fs::create_dir_all(output_root)
        .map_err(|error| format!("Could not create the generated-files directory: {error}"))?;
    let output_root = output_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the generated-files directory: {error}"))?;
    let stem = safe_video_stem(title, request.file_name.as_deref())?;

    let mut segments = Vec::with_capacity(request.scenes.len());
    for (index, scene) in request.scenes.iter().enumerate() {
        let narration = scene.narration.trim();
        let caption = scene.caption.trim();
        if narration.is_empty() || narration.chars().count() > MAX_NARRATION_CHARS {
            return Err(format!(
                "Scene {} narration must contain between 1 and {MAX_NARRATION_CHARS} characters",
                index + 1
            ));
        }
        if caption.is_empty() || caption.chars().count() > 120 {
            return Err(format!(
                "Scene {} caption must contain between 1 and 120 characters",
                index + 1
            ));
        }
        let image = workspace_image(&root, &scene.image_path)?;
        let scene_dir = temp_root.join(format!("scene-{:03}", index + 1));
        fs::create_dir_all(&scene_dir)
            .map_err(|error| format!("Could not prepare scene {}: {error}", index + 1))?;
        let audio = crate::generate_speech_audio(narration, request.voice.as_deref()).await?;
        fs::write(scene_dir.join("narration.mp3"), audio)
            .map_err(|error| format!("Could not save scene {} narration: {error}", index + 1))?;
        fs::write(
            scene_dir.join("scene.ass"),
            subtitle_document(caption, width, height),
        )
        .map_err(|error| format!("Could not save scene {} subtitles: {error}", index + 1))?;
        let filter = motion_filter(scene.motion.as_deref(), width, height)?;
        run_encoder(
            app,
            &scene_dir,
            vec![
                "-nostdin".into(),
                "-hide_banner".into(),
                "-loglevel".into(),
                "error".into(),
                "-y".into(),
                "-loop".into(),
                "1".into(),
                "-i".into(),
                image.to_string_lossy().into_owned(),
                "-i".into(),
                "narration.mp3".into(),
                "-vf".into(),
                filter,
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "veryfast".into(),
                "-crf".into(),
                "21".into(),
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                "160k".into(),
                "-shortest".into(),
                "segment.mp4".into(),
            ],
        )
        .await?;
        segments.push(scene_dir.join("segment.mp4"));
    }

    let concat_file = segments
        .iter()
        .map(|path| {
            format!(
                "file '{}'",
                path.to_string_lossy()
                    .replace('\\', "/")
                    .replace('\'', "'\\''")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(temp_root.join("segments.txt"), format!("{concat_file}\n"))
        .map_err(|error| format!("Could not prepare the video timeline: {error}"))?;
    let rendered = temp_root.join("rendered.mp4");
    run_encoder(
        app,
        temp_root,
        vec![
            "-nostdin".into(),
            "-hide_banner".into(),
            "-loglevel".into(),
            "error".into(),
            "-y".into(),
            "-f".into(),
            "concat".into(),
            "-safe".into(),
            "0".into(),
            "-i".into(),
            "segments.txt".into(),
            "-c".into(),
            "copy".into(),
            "-movflags".into(),
            "+faststart".into(),
            rendered.to_string_lossy().into_owned(),
        ],
    )
    .await?;
    let (output_path, relative_path) = save_rendered_video(&output_root, &stem, &rendered)?;
    Ok(VideoOutput {
        path: output_path,
        relative_path,
        scene_count: request.scenes.len(),
        aspect_ratio: aspect_ratio.to_string(),
        format: "mp4",
    })
}

pub async fn create_video_in(
    app: &tauri::AppHandle,
    request: VideoRequest,
    workspace_root: &Path,
    output_root: &Path,
) -> Result<VideoOutput, String> {
    let temp_root = std::env::temp_dir().join(format!("coffee-note-video-{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_root)
        .map_err(|error| format!("Could not prepare the video workspace: {error}"))?;
    let result = render_video(app, &request, workspace_root, output_root, &temp_root).await;
    let _ = fs::remove_dir_all(&temp_root);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_dimensions_cover_supported_social_formats() {
        assert_eq!(video_dimensions("16:9").unwrap(), (1280, 720));
        assert_eq!(video_dimensions("9:16").unwrap(), (720, 1280));
        assert_eq!(video_dimensions("1:1").unwrap(), (1080, 1080));
        assert!(video_dimensions("4:3").is_err());
    }

    #[test]
    fn subtitles_escape_ass_control_syntax() {
        assert_eq!(ass_escape("A{B}\\C\nD"), r"A\{B\}\\C\ND");
    }

    #[test]
    fn output_names_are_sanitized() {
        assert_eq!(safe_video_stem("A:B", None).unwrap(), "A-B");
        assert!(safe_video_stem("A", Some("folder/video.mp4")).is_err());
    }

    #[test]
    fn completed_videos_copy_non_destructively_to_the_output_directory() {
        let fixture = std::env::temp_dir().join(format!("coffee-video-copy-{}", Uuid::new_v4()));
        let output = fixture.join("output");
        let rendered = fixture.join("rendered.mp4");
        fs::create_dir_all(&output).expect("output fixture should exist");
        fs::write(&rendered, b"video bytes").expect("rendered fixture should exist");

        let first = save_rendered_video(&output, "demo", &rendered).expect("first copy");
        let second = save_rendered_video(&output, "demo", &rendered).expect("second copy");
        assert_eq!(first.1, "demo.mp4");
        assert_eq!(second.1, "demo-2.mp4");
        assert_eq!(fs::read(first.0).expect("first output"), b"video bytes");
        assert_eq!(fs::read(second.0).expect("second output"), b"video bytes");

        fs::remove_dir_all(fixture).expect("fixture should be removed");
    }
}

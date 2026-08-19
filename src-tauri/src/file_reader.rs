// File Reader — read local files into text content for the Agent.
//
// Text files are read as-is. Office, OpenDocument, RTF, EPUB, CSV, and PDF
// files are converted locally to structured Markdown with anydoc. Images are
// returned as paths for the multimodal model; audio/video goes through the
// existing transcription pipeline.

use std::fs;
use std::path::Path;

/// Max bytes of extracted text we hand to the agent (protects context).
const MAX_EXTRACT_BYTES: usize = 300_000;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    /// How the content should be consumed.
    pub kind: ContentKind,
    /// Text content (for `text`/`transcript` kinds).
    pub text: String,
    /// Local path for multimodal kinds (image).
    pub image_path: Option<String>,
    /// Human-readable description of the file.
    pub label: String,
    /// Source extension, e.g. "pdf".
    pub extension: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ContentKind {
    Text,
    Transcript,
    Image,
    Unsupported,
}

/// Read a local file into agent-consumable content.
pub fn read_file_content(path: &Path) -> Result<FileContent, String> {
    if !path.is_file() {
        return Err(format!("Not a file: {}", path.display()));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let label = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());

    match extension.as_str() {
        // ── Plain text: zero conversion ──
        "txt" | "md" | "markdown" | "text" | "log" | "tsv" | "json" | "yaml" | "yml" | "xml"
        | "toml" | "ini" | "conf" | "srt" | "vtt" => {
            let text = read_text_limited(path)?;
            Ok(FileContent {
                kind: ContentKind::Text,
                text,
                image_path: None,
                label,
                extension,
            })
        }
        // ── Documents: local structured Markdown conversion ──
        "doc" | "docx" | "docm" | "odt" | "rtf" | "epub" | "pdf" | "ppt" | "pps" | "pot"
        | "pptx" | "pptm" | "ppsx" | "ppsm" | "odp" | "xls" | "xlsx" | "xlsm" | "xlsb" | "ods"
        | "csv" => read_document(path, &label, &extension),
        // ── HTML: reuse existing reader logic ──
        "html" | "htm" => read_html(path, &label, &extension),
        // ── Images: return path for multimodal ──
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tiff" | "tif" | "heic" | "avif" => {
            Ok(FileContent {
                kind: ContentKind::Image,
                text: String::new(),
                image_path: Some(path_string(path)),
                label,
                extension,
            })
        }
        // ── Audio / video: transcription (existing pipeline) ──
        // Transcribed asynchronously by the caller via
        // `transcription::transcribe_local_media_file` — the sync reader
        // reports the extension so the agent can route to it.
        "mp3" | "mp4" | "m4a" | "wav" | "flac" | "ogg" | "opus" | "aac" | "mov" | "mkv"
        | "webm" | "avi" | "wmv" | "m4v" => Ok(FileContent {
            kind: ContentKind::Transcript,
            text: String::new(),
            image_path: Some(path_string(path)),
            label,
            extension,
        }),
        // ── Unknown ──
        _ => Ok(FileContent {
            kind: ContentKind::Unsupported,
            text: String::new(),
            image_path: None,
            label,
            extension,
        }),
    }
}

/// Read a UTF-8 text file, truncating to the safety limit.
fn read_text_limited(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("Could not read file: {error}"))?;
    if bytes.len() > MAX_EXTRACT_BYTES {
        return Err(format!(
            "The file is too large to read into the agent context ({} bytes).",
            bytes.len()
        ));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Convert a supported document to LLM-ready structured Markdown locally.
fn read_document(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let markdown = anydoc::to_markdown(path)
        .map_err(|error| format!("Could not convert '{label}' to Markdown: {error}"))?;
    if markdown.trim().is_empty() {
        return Err(format!(
            "The .{extension} file contains no extractable text. It may require OCR."
        ));
    }
    Ok(FileContent {
        kind: ContentKind::Text,
        text: truncate(markdown, MAX_EXTRACT_BYTES),
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    })
}

/// Read .html by reusing the existing HTML→content logic.
fn read_html(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let bytes = fs::read(path).map_err(|error| format!("Could not read HTML: {error}"))?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("The HTML file is too large (over 10 MB).".to_string());
    }
    let html = String::from_utf8_lossy(&bytes).into_owned();
    let text = truncate(super::extract_visible_text(&html), MAX_EXTRACT_BYTES);
    if text.trim().is_empty() {
        return Err("The HTML file contains no readable text.".to_string());
    }
    Ok(FileContent {
        kind: ContentKind::Text,
        text,
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    })
}

// ── helpers ──

fn truncate(mut text: String, max: usize) -> String {
    if text.len() > max {
        let mut boundary = max;
        while !text.is_char_boundary(boundary) {
            boundary -= 1;
        }
        text.truncate(boundary);
        text.push_str("\n…[truncated]");
    }
    text
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

// ── tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("file-reader-test-{name}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_plain_text() {
        let path = temp_dir("txt").join("sample.txt");
        fs::write(&path, "hello world\nline two").unwrap();
        let result = read_file_content(&path).unwrap();
        assert_eq!(result.kind, ContentKind::Text);
        assert!(result.text.contains("hello world"));
    }

    #[test]
    fn docx_extracts_text() {
        let path = temp_dir("docx").join("sample.docx");
        build_mini_docx(&path);
        let result = read_file_content(&path).unwrap();
        assert_eq!(result.kind, ContentKind::Text);
        assert!(result.text.contains("Hello World"), "got: {}", result.text);
    }

    #[test]
    fn csv_converts_to_a_markdown_table() {
        let path = temp_dir("csv").join("sample.csv");
        fs::write(&path, "name,score\nAlpha,1\nBeta,2\n").unwrap();
        let result = read_file_content(&path).unwrap();
        assert_eq!(result.kind, ContentKind::Text);
        assert!(
            result.text.contains("| name | score |"),
            "got: {}",
            result.text
        );
        assert!(
            result.text.contains("| Alpha | 1 |"),
            "got: {}",
            result.text
        );
    }

    #[test]
    fn markdown_truncation_stays_on_a_utf8_boundary() {
        let text = truncate("中文内容".repeat(100), 17);
        assert!(text.ends_with("…[truncated]"));
        assert!(text.is_char_boundary(text.len()));
    }

    #[test]
    fn image_returns_path() {
        let path = temp_dir("img").join("photo.png");
        fs::write(&path, b"\x89PNG\r\n\x1a\nfake").unwrap();
        let result = read_file_content(&path).unwrap();
        assert_eq!(result.kind, ContentKind::Image);
        assert!(result.image_path.is_some());
    }

    #[test]
    fn unsupported_kind_reports() {
        let path = temp_dir("unknown").join("archive.7z");
        fs::write(&path, b"7z data").unwrap();
        let result = read_file_content(&path).unwrap();
        assert_eq!(result.kind, ContentKind::Unsupported);
    }

    #[test]
    fn missing_file_errors() {
        let result = read_file_content(Path::new("C:/definitely/missing/file.pdf"));
        assert!(result.is_err());
    }

    fn build_mini_docx(path: &Path) {
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("word/document.xml", options).unwrap();
        zip.write_all(
            b"<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>",
        )
        .unwrap();
        zip.finish().unwrap();
    }
}

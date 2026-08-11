// File Reader — read local files into text content for the Agent.
//
// Principle: 不转格式，只送内容 (no conversion, only content).
// Text files are read as-is; office/PDF files get a light text extraction
// (no layout/table reconstruction — that is the Agent's job); images are
// returned as paths for the multimodal model; audio/video goes through the
// existing transcription pipeline.

use std::fs;
use std::io::Read;
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
        "txt" | "md" | "markdown" | "text" | "log" | "csv" | "tsv" | "json" | "yaml" | "yml"
        | "xml" | "toml" | "ini" | "conf" | "srt" | "vtt" => {
            let text = read_text_limited(path)?;
            Ok(FileContent {
                kind: ContentKind::Text,
                text,
                image_path: None,
                label,
                extension,
            })
        }
        // ── Office documents: light text extraction ──
        "docx" => read_docx(path, &label, &extension),
        "pptx" => read_pptx(path, &label, &extension),
        "xlsx" => read_xlsx(path, &label, &extension),
        "pdf" => read_pdf(path, &label, &extension),
        "doc" | "ppt" | "xls" => Err(format!(
            "Legacy Office format '{extension}' is not supported. \
             Save it as .docx/.pptx/.xlsx (or text) and try again."
        )),
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

/// Read .docx by unzipping and pulling text from word/document.xml.
fn read_docx(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let xml = read_zip_entry(path, "word/document.xml")?;
    let text = truncate(strip_xml_tags(&xml), MAX_EXTRACT_BYTES);
    Ok(FileContent {
        kind: ContentKind::Text,
        text,
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    })
}

/// Read .pptx by unzipping and pulling text from slide XML parts.
fn read_pptx(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let mut text = String::new();
    for slide in 1..=200 {
        let entry = format!("ppt/slides/slide{slide}.xml");
        match read_zip_entry_opt(path, &entry)? {
            Some(xml) => {
                text.push_str(&format!("\n\n--- slide {slide} ---\n"));
                text.push_str(&strip_xml_tags(&xml));
            }
            None => break,
        }
    }
    if text.trim().is_empty() {
        return Err("The .pptx file contains no extractable text.".to_string());
    }
    let text = truncate(text, MAX_EXTRACT_BYTES);
    Ok(FileContent {
        kind: ContentKind::Text,
        text,
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    })
}

/// Read .xlsx by unzipping and pulling text from sharedStrings + sheet rows.
fn read_xlsx(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let mut text = String::new();
    let mut shared: Vec<String> = Vec::new();
    if let Some(xml) = read_zip_entry_opt(path, "xl/sharedStrings.xml")? {
        shared = extract_shared_strings(&xml);
    }
    let mut sheet_index = 1;
    loop {
        let entry = format!("xl/worksheets/sheet{sheet_index}.xml");
        let Some(xml) = read_zip_entry_opt(path, &entry)? else {
            break;
        };
        if sheet_index > 1 {
            text.push_str(&format!("\n\n--- sheet {sheet_index} ---\n"));
        }
        text.push_str(&extract_sheet_rows(&xml, &shared));
        sheet_index += 1;
        if sheet_index > 50 {
            break;
        }
    }
    if text.trim().is_empty() {
        return Err("The .xlsx file contains no extractable text.".to_string());
    }
    let text = truncate(text, MAX_EXTRACT_BYTES);
    Ok(FileContent {
        kind: ContentKind::Text,
        text,
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    })
}

/// Read .pdf by extracting the text layer (no OCR — that is the Agent's job).
fn read_pdf(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let bytes = fs::read(path).map_err(|error| format!("Could not read PDF: {error}"))?;
    if bytes.len() > 100 * 1024 * 1024 {
        return Err("The PDF is too large (over 100 MB).".to_string());
    }
    let text = truncate(extract_pdf_text(&bytes)?, MAX_EXTRACT_BYTES);
    if text.trim().is_empty() {
        return Err(
            "The PDF has no extractable text layer — it may be a scanned document. \
             Ask the agent to read it as images instead."
                .to_string(),
        );
    }
    Ok(FileContent {
        kind: ContentKind::Text,
        text,
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
        text.truncate(max);
        text.push_str("\n…[truncated]");
    }
    text
}

/// Read a single entry from a zip file, erroring if absent.
fn read_zip_entry(path: &Path, entry: &str) -> Result<String, String> {
    match read_zip_entry_opt(path, entry)? {
        Some(content) => Ok(content),
        None => Err(format!("The file is missing the expected '{entry}' part.")),
    }
}

/// Read a single entry from a zip file; None if the entry does not exist.
fn read_zip_entry_opt(path: &Path, entry: &str) -> Result<Option<String>, String> {
    let file = fs::File::open(path).map_err(|error| format!("Could not open file: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Not a valid Office file: {error}"))?;
    let mut found = None;
    for i in 0..archive.len() {
        let mut item = archive
            .by_index(i)
            .map_err(|error| format!("Could not read archive entry: {error}"))?;
        if item.name() == entry {
            let mut buf = Vec::new();
            item.read_to_end(&mut buf)
                .map_err(|error| format!("Could not read archive entry: {error}"))?;
            found = Some(String::from_utf8_lossy(&buf).into_owned());
            break;
        }
    }
    Ok(found)
}

/// Strip XML tags, converting paragraph/section breaks to newlines.
fn strip_xml_tags(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len());
    let mut in_tag = false;
    for c in xml.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if c == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            out.push(c);
        }
    }
    // Collapse runs of blank lines.
    let mut result = String::with_capacity(out.len());
    let mut blank = 0;
    for line in out.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank += 1;
            if blank <= 1 {
                result.push('\n');
            }
        } else {
            blank = 0;
            result.push_str(trimmed);
            result.push('\n');
        }
    }
    result
}

fn extract_shared_strings(xml: &str) -> Vec<String> {
    let mut strings = Vec::new();
    let mut in_si = false;
    let mut in_t = false;
    let mut current = String::new();
    let mut idx = 0usize;
    let bytes = xml.as_bytes();
    while idx < bytes.len() {
        if bytes[idx] == b'<' {
            let end = xml[idx..].find('>').map(|v| idx + v + 1).unwrap_or(bytes.len());
            let tag = &xml[idx..end];
            if tag.starts_with("<si") {
                in_si = true;
                current.clear();
            } else if tag.starts_with("<t") && in_si {
                in_t = true;
            } else if tag.starts_with("</t") {
                in_t = false;
                if in_si {
                    strings.push(current.clone());
                }
            } else if tag.starts_with("</si") {
                in_si = false;
            }
            idx = end;
        } else {
            if in_t {
                current.push(xml[idx..].chars().next().unwrap_or(' '));
            }
            idx += 1;
        }
    }
    strings
}

fn extract_sheet_rows(xml: &str, shared: &[String]) -> String {
    let mut out = String::new();
    let mut in_cell = false;
    let mut cell_shared = false;
    let mut in_v = false;
    let mut v_text = String::new();
    let mut in_row = false;
    let mut row_count = 0;
    let mut idx = 0usize;
    let bytes = xml.as_bytes();
    while idx < bytes.len() {
        if bytes[idx] == b'<' {
            let end = xml[idx..].find('>').map(|v| idx + v + 1).unwrap_or(bytes.len());
            let tag = &xml[idx..end];
            if tag.starts_with("<row") {
                in_row = true;
                row_count += 1;
                if row_count > 1 {
                    out.push('\n');
                }
            } else if tag.starts_with("</row") {
                in_row = false;
            } else if tag.starts_with("<c ") || tag.starts_with("<c>") {
                in_cell = true;
                cell_shared = tag.contains("t=\"s\"");
                v_text.clear();
            } else if tag.starts_with("</c") {
                in_cell = false;
                if in_row && !v_text.trim().is_empty() {
                    let value = if cell_shared {
                        v_text
                            .trim()
                            .parse::<usize>()
                            .ok()
                            .and_then(|index| shared.get(index))
                            .map(|text| text.as_str())
                            .unwrap_or(v_text.trim())
                    } else {
                        v_text.trim()
                    };
                    if !value.is_empty() {
                        if !out.ends_with('\n') && !out.is_empty() {
                            out.push_str(" | ");
                        }
                        out.push_str(value);
                    }
                }
            } else if tag.starts_with("<v") && in_cell {
                in_v = true;
                v_text.clear();
            } else if tag.starts_with("</v") {
                in_v = false;
            }
            idx = end;
        } else {
            if in_v {
                v_text.push(xml[idx..].chars().next().unwrap_or(' '));
            }
            idx += 1;
        }
    }
    out
}

/// Extract text from a PDF's content streams (very light parser).
fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    let mut out = String::new();
    let mut pos = 0usize;
    while pos + 6 < bytes.len() {
        let Some(rel) = find_subslice(&bytes[pos..], b"stream") else {
            break;
        };
        let stream_start = pos + rel + 6;
        let mut content_start = stream_start;
        if content_start < bytes.len() && bytes[content_start] == b'\r' {
            content_start += 1;
        }
        if content_start < bytes.len() && bytes[content_start] == b'\n' {
            content_start += 1;
        }
        let Some(end_rel) = find_subslice(&bytes[content_start..], b"endstream") else {
            break;
        };
        let content = &bytes[content_start..content_start + end_rel];
        if !contains_subslice(content, b"FlateDecode") {
            out.push_str(&extract_text_ops(content));
        }
        pos = content_start + end_rel + 9;
    }
    Ok(out)
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn contains_subslice(haystack: &[u8], needle: &[u8]) -> bool {
    find_subslice(haystack, needle).is_some()
}

/// Extract text from PDF content-stream operators: (text) Tj and [(a)(b)] TJ.
fn extract_text_ops(content: &[u8]) -> String {
    let mut out = String::new();
    let mut idx = 0usize;
    while idx < content.len() {
        if content[idx] == b'(' {
            let start = idx + 1;
            let mut end = start;
            let mut escaped = false;
            while end < content.len() {
                let c = content[end];
                if c == b'\\' && !escaped {
                    escaped = true;
                    end += 1;
                    continue;
                }
                if c == b')' && !escaped {
                    break;
                }
                escaped = false;
                end += 1;
            }
            out.push_str(&String::from_utf8_lossy(&content[start..end]));
            idx = end + 1;
        } else if content[idx] == b'[' {
            let mut end = idx + 1;
            let mut depth = 1;
            while end < content.len() && depth > 0 {
                if content[end] == b'[' {
                    depth += 1;
                } else if content[end] == b']' {
                    depth -= 1;
                }
                end += 1;
            }
            idx = end;
        } else if content[idx] == b'<' {
            let mut end = idx + 1;
            while end < content.len() && content[end] != b'>' {
                end += 1;
            }
            idx = end + 1;
        } else {
            idx += 1;
        }
    }
    out
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

    #[test]
    fn strip_tags_converts_breaks() {
        let xml = "<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p></w:document>";
        let text = strip_xml_tags(xml);
        assert!(text.contains("Hello"));
        assert!(text.contains("World"));
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

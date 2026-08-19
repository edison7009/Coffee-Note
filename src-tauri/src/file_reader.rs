// File Reader — read local files into text content for the Agent.
//
// Principle: TierNote owns this ingestion path. Text files are read as-is;
// supported document containers get a bounded, local text extraction; images
// are returned as paths for the multimodal model; audio/video goes through the
// existing TierNote transcription pipeline.

use std::fs;
use std::io::Read;
use std::path::Path;

/// Max bytes of extracted text we hand to the agent (protects context).
const MAX_EXTRACT_BYTES: usize = 300_000;
const MAX_SOURCE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 4_096;
const MAX_ARCHIVE_ENTRY_BYTES: u64 = 16 * 1024 * 1024;

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
    let source_bytes = fs::metadata(path)
        .map_err(|error| format!("Could not inspect file: {error}"))?
        .len();
    if source_bytes > MAX_SOURCE_BYTES {
        return Err("The file is too large to read (over 100 MB).".to_string());
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
        "txt" | "md" | "markdown" | "text" | "log" | "json" | "yaml" | "yml" | "xml" | "toml"
        | "ini" | "conf" | "srt" | "vtt" => {
            let text = read_text_limited(path)?;
            Ok(FileContent {
                kind: ContentKind::Text,
                text,
                image_path: None,
                label,
                extension,
            })
        }
        // ── TierNote-owned local document extraction ──
        "csv" => read_delimited(path, &label, &extension, ','),
        "tsv" => read_delimited(path, &label, &extension, '\t'),
        "docx" | "docm" => read_docx(path, &label, &extension),
        "pptx" | "pptm" | "ppsx" | "ppsm" | "potx" | "potm" => read_pptx(path, &label, &extension),
        "xlsx" | "xlsm" => read_xlsx(path, &label, &extension),
        "odt" | "odp" | "ods" => read_open_document(path, &label, &extension),
        "rtf" => read_rtf(path, &label, &extension),
        "epub" => read_epub(path, &label, &extension),
        "pdf" => read_pdf(path, &label, &extension),
        "doc" | "ppt" | "pps" | "pot" | "xls" | "xlsb" => Err(format!(
            "Legacy Office format '{extension}' is not supported. \
             Save it as an OOXML, OpenDocument, CSV, or text file and try again."
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

/// Convert a small CSV/TSV file into a Markdown table without an external parser.
fn read_delimited(
    path: &Path,
    label: &str,
    extension: &str,
    delimiter: char,
) -> Result<FileContent, String> {
    let source = read_text_limited(path)?;
    let rows = parse_delimited_rows(&source, delimiter)?;
    if rows.is_empty() {
        return Err(format!("The .{extension} file contains no readable rows."));
    }

    let column_count = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut markdown = String::new();
    for (row_index, row) in rows.iter().enumerate() {
        markdown.push('|');
        for column_index in 0..column_count {
            let value = row.get(column_index).map(String::as_str).unwrap_or("");
            markdown.push(' ');
            markdown.push_str(&escape_markdown_cell(value));
            markdown.push_str(" |");
        }
        markdown.push('\n');
        if row_index == 0 {
            markdown.push('|');
            for _ in 0..column_count {
                markdown.push_str(" --- |");
            }
            markdown.push('\n');
        }
    }

    Ok(text_content(label, extension, markdown))
}

fn parse_delimited_rows(source: &str, delimiter: char) -> Result<Vec<Vec<String>>, String> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut chars = source.chars().peekable();
    let mut quoted = false;

    while let Some(character) = chars.next() {
        match character {
            '"' if quoted && chars.peek() == Some(&'"') => {
                chars.next();
                field.push('"');
            }
            '"' => quoted = !quoted,
            value if value == delimiter && !quoted => {
                row.push(std::mem::take(&mut field));
            }
            '\n' if !quoted => {
                row.push(std::mem::take(&mut field));
                if row.iter().any(|value| !value.trim().is_empty()) {
                    rows.push(std::mem::take(&mut row));
                } else {
                    row.clear();
                }
            }
            '\r' if !quoted => {}
            value => field.push(value),
        }
    }
    if quoted {
        return Err("The delimited file has an unterminated quoted field.".to_string());
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        if row.iter().any(|value| !value.trim().is_empty()) {
            rows.push(row);
        }
    }
    Ok(rows)
}

fn escape_markdown_cell(value: &str) -> String {
    value
        .trim()
        .replace('\\', "\\\\")
        .replace('|', "\\|")
        .replace(['\r', '\n'], "<br>")
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
        text.push_str(&format!("\n\n## Sheet {sheet_index}\n\n"));
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

/// Read an OpenDocument package from its standard content.xml entry.
fn read_open_document(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let xml = read_zip_entry(path, "content.xml")?;
    let text = truncate(strip_xml_tags(&xml), MAX_EXTRACT_BYTES);
    if text.trim().is_empty() {
        return Err(format!(
            "The .{extension} file contains no extractable text."
        ));
    }
    Ok(text_content(label, extension, text))
}

/// Read plain RTF text, including escaped characters, paragraph breaks, and Unicode controls.
fn read_rtf(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let source = read_text_limited(path)?;
    let text = truncate(extract_rtf_text(&source), MAX_EXTRACT_BYTES);
    if text.trim().is_empty() {
        return Err("The RTF file contains no extractable text.".to_string());
    }
    Ok(text_content(label, extension, text))
}

/// Read bounded HTML/XHTML chapters from an EPUB archive.
fn read_epub(path: &Path, label: &str, extension: &str) -> Result<FileContent, String> {
    let file = fs::File::open(path).map_err(|error| format!("Could not open EPUB: {error}"))?;
    let mut archive = open_zip_archive(file, "EPUB")?;
    let mut chapters = Vec::new();

    for index in 0..archive.len() {
        let mut item = archive
            .by_index(index)
            .map_err(|error| format!("Could not read EPUB entry: {error}"))?;
        let name = item.name().to_ascii_lowercase();
        if !(name.ends_with(".html") || name.ends_with(".xhtml") || name.ends_with(".htm")) {
            continue;
        }
        if item.size() > MAX_ARCHIVE_ENTRY_BYTES {
            return Err(format!("The EPUB entry '{}' is too large.", item.name()));
        }
        let mut bytes = Vec::new();
        item.read_to_end(&mut bytes)
            .map_err(|error| format!("Could not read EPUB entry: {error}"))?;
        let html = String::from_utf8_lossy(&bytes);
        let text = super::extract_visible_text(&html);
        if !text.trim().is_empty() {
            chapters.push(text);
        }
        if chapters.len() >= 200 {
            break;
        }
    }

    if chapters.is_empty() {
        return Err("The EPUB contains no readable HTML chapters.".to_string());
    }
    Ok(text_content(
        label,
        extension,
        truncate(chapters.join("\n\n"), MAX_EXTRACT_BYTES),
    ))
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
        let mut boundary = max;
        while !text.is_char_boundary(boundary) {
            boundary -= 1;
        }
        text.truncate(boundary);
        text.push_str("\n…[truncated]");
    }
    text
}

fn text_content(label: &str, extension: &str, text: String) -> FileContent {
    FileContent {
        kind: ContentKind::Text,
        text,
        image_path: None,
        label: label.to_string(),
        extension: extension.to_string(),
    }
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
    let mut archive = open_zip_archive(file, "Office document")?;
    let mut found = None;
    for i in 0..archive.len() {
        let mut item = archive
            .by_index(i)
            .map_err(|error| format!("Could not read archive entry: {error}"))?;
        if item.name() == entry {
            if item.size() > MAX_ARCHIVE_ENTRY_BYTES {
                return Err(format!("The archive entry '{entry}' is too large."));
            }
            let mut buf = Vec::new();
            item.read_to_end(&mut buf)
                .map_err(|error| format!("Could not read archive entry: {error}"))?;
            found = Some(String::from_utf8_lossy(&buf).into_owned());
            break;
        }
    }
    Ok(found)
}

fn open_zip_archive<R: Read + std::io::Seek>(
    reader: R,
    label: &str,
) -> Result<zip::ZipArchive<R>, String> {
    let archive = zip::ZipArchive::new(reader)
        .map_err(|error| format!("Not a valid {label} archive: {error}"))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "The {label} contains too many archive entries ({}).",
            archive.len()
        ));
    }
    Ok(archive)
}

/// Extract visible XML text and retain the structural breaks used by OOXML/ODF.
fn strip_xml_tags(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len());
    let mut cursor = 0usize;

    while cursor < xml.len() {
        let Some(tag_offset) = xml[cursor..].find('<') else {
            push_xml_text(&mut out, &xml[cursor..]);
            break;
        };
        let tag_start = cursor + tag_offset;
        push_xml_text(&mut out, &xml[cursor..tag_start]);
        let Some(end_offset) = xml[tag_start..].find('>') else {
            break;
        };
        let tag_end = tag_start + end_offset;
        let raw = xml[tag_start + 1..tag_end].trim();
        let closing = raw.starts_with('/');
        let name = raw
            .trim_start_matches('/')
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_end_matches('/')
            .rsplit(':')
            .next()
            .unwrap_or("");

        match (closing, name) {
            (_, "br" | "cr") | (false, "line-break") => push_break(&mut out),
            (false, "tab") => out.push('\t'),
            (true, "p" | "h" | "tr" | "table-row" | "list-item") => push_break(&mut out),
            (true, "tc" | "table-cell") => {
                if !out.ends_with(" | ") {
                    out.push_str(" | ");
                }
            }
            _ => {}
        }
        cursor = tag_end + 1;
    }

    normalize_extracted_text(&out)
}

fn push_xml_text(out: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    out.push_str(&decode_xml_entities(text));
}

fn decode_xml_entities(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn push_break(out: &mut String) {
    while out.ends_with([' ', '\t']) {
        out.pop();
    }
    if !out.ends_with('\n') {
        out.push('\n');
    }
}

fn normalize_extracted_text(text: &str) -> String {
    let mut normalized = String::new();
    let mut blank = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !blank && !normalized.is_empty() {
                normalized.push('\n');
            }
            blank = true;
        } else {
            if !normalized.is_empty() && !normalized.ends_with('\n') {
                normalized.push('\n');
            }
            normalized.push_str(trimmed);
            normalized.push('\n');
            blank = false;
        }
    }
    normalized.trim().to_string()
}

fn extract_rtf_text(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut out = String::new();
    let mut cursor = 0usize;
    let mut skip_destination_depth: Option<usize> = None;
    let mut depth = 0usize;

    while cursor < bytes.len() {
        match bytes[cursor] {
            b'{' => {
                depth += 1;
                cursor += 1;
            }
            b'}' => {
                if skip_destination_depth == Some(depth) {
                    skip_destination_depth = None;
                }
                depth = depth.saturating_sub(1);
                cursor += 1;
            }
            b'\\' => {
                cursor += 1;
                if cursor >= bytes.len() {
                    break;
                }
                match bytes[cursor] {
                    b'\\' | b'{' | b'}' => {
                        if skip_destination_depth.is_none() {
                            out.push(bytes[cursor] as char);
                        }
                        cursor += 1;
                    }
                    b'\'' if cursor + 2 < bytes.len() => {
                        if skip_destination_depth.is_none() {
                            if let Ok(hex) = std::str::from_utf8(&bytes[cursor + 1..cursor + 3]) {
                                if let Ok(value) = u8::from_str_radix(hex, 16) {
                                    out.push(char::from(value));
                                }
                            }
                        }
                        cursor += 3;
                    }
                    b'*' => {
                        skip_destination_depth = Some(depth);
                        cursor += 1;
                    }
                    _ => {
                        let word_start = cursor;
                        while cursor < bytes.len() && bytes[cursor].is_ascii_alphabetic() {
                            cursor += 1;
                        }
                        let word = &source[word_start..cursor];
                        let sign = if cursor < bytes.len() && bytes[cursor] == b'-' {
                            cursor += 1;
                            -1i32
                        } else {
                            1i32
                        };
                        let number_start = cursor;
                        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                            cursor += 1;
                        }
                        let number = source[number_start..cursor]
                            .parse::<i32>()
                            .ok()
                            .map(|value| value * sign);
                        if cursor < bytes.len() && bytes[cursor] == b' ' {
                            cursor += 1;
                        }
                        if skip_destination_depth.is_some() {
                            continue;
                        }
                        match word {
                            "par" | "line" => push_break(&mut out),
                            "tab" => out.push('\t'),
                            "u" => {
                                if let Some(value) = number {
                                    let scalar = if value < 0 { value + 65_536 } else { value };
                                    if let Some(character) = char::from_u32(scalar as u32) {
                                        out.push(character);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            value => {
                if skip_destination_depth.is_none() && value >= b' ' {
                    let character = source[cursor..].chars().next().unwrap_or(' ');
                    out.push(character);
                    cursor += character.len_utf8();
                } else {
                    cursor += 1;
                }
            }
        }
    }
    normalize_extracted_text(&out)
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
            let end = xml[idx..]
                .find('>')
                .map(|v| idx + v + 1)
                .unwrap_or(bytes.len());
            let tag = &xml[idx..end];
            if tag.starts_with("<si") {
                in_si = true;
                current.clear();
            } else if tag.starts_with("<t") && in_si {
                in_t = true;
            } else if tag.starts_with("</t") {
                in_t = false;
            } else if tag.starts_with("</si") {
                in_si = false;
                strings.push(decode_xml_entities(&current));
            }
            idx = end;
        } else {
            let character = xml[idx..].chars().next().unwrap_or(' ');
            if in_t {
                current.push(character);
            }
            idx += character.len_utf8();
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
            let end = xml[idx..]
                .find('>')
                .map(|v| idx + v + 1)
                .unwrap_or(bytes.len());
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
            let character = xml[idx..].chars().next().unwrap_or(' ');
            if in_v {
                v_text.push(character);
            }
            idx += character.len_utf8();
        }
    }
    out
}

/// Extract text from bounded PDF content streams, including common Flate compression.
fn extract_pdf_text(bytes: &[u8]) -> Result<String, String> {
    let mut out = String::new();
    let mut pos = 0usize;
    let mut stream_count = 0usize;
    while pos + 6 < bytes.len() {
        let Some(rel) = find_subslice(&bytes[pos..], b"stream") else {
            break;
        };
        let stream_marker = pos + rel;
        let mut content_start = stream_marker + 6;
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
        let dictionary_start = bytes[..stream_marker]
            .windows(2)
            .rposition(|window| window == b"<<")
            .unwrap_or(stream_marker);
        let dictionary = &bytes[dictionary_start..stream_marker];
        let decoded = if contains_subslice(dictionary, b"FlateDecode") {
            let decoder = flate2::read::ZlibDecoder::new(content);
            read_bounded_stream(decoder, "PDF content stream")?
        } else if contains_subslice(dictionary, b"/Filter") {
            Vec::new()
        } else {
            content.to_vec()
        };
        if contains_subslice(&decoded, b"BT")
            && (contains_subslice(&decoded, b"Tj") || contains_subslice(&decoded, b"TJ"))
        {
            let extracted = extract_text_ops(&decoded);
            if !extracted.trim().is_empty() {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(extracted.trim());
            }
        }
        pos = content_start + end_rel + 9;
        stream_count += 1;
        if stream_count >= MAX_ARCHIVE_ENTRIES {
            return Err("The PDF contains too many content streams.".to_string());
        }
    }
    Ok(out)
}

fn read_bounded_stream<R: Read>(reader: R, label: &str) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_ARCHIVE_ENTRY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not decompress {label}: {error}"))?;
    if bytes.len() as u64 > MAX_ARCHIVE_ENTRY_BYTES {
        return Err(format!("The {label} is too large."));
    }
    Ok(bytes)
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn contains_subslice(haystack: &[u8], needle: &[u8]) -> bool {
    find_subslice(haystack, needle).is_some()
}

/// Extract literal strings used by PDF Tj/TJ text operators.
fn extract_text_ops(content: &[u8]) -> String {
    let mut out = String::new();
    let mut idx = 0usize;
    while idx < content.len() {
        if content[idx] == b'(' {
            let start = idx + 1;
            let mut end = start;
            let mut escaped = false;
            let mut nesting = 1usize;
            while end < content.len() {
                let c = content[end];
                if c == b'\\' && !escaped {
                    escaped = true;
                    end += 1;
                    continue;
                }
                if !escaped {
                    if c == b'(' {
                        nesting += 1;
                    } else if c == b')' {
                        nesting -= 1;
                        if nesting == 0 {
                            break;
                        }
                    }
                }
                escaped = false;
                end += 1;
            }
            let decoded = decode_pdf_literal(&content[start..end]);
            if !decoded.is_empty() {
                if !out.is_empty() && !out.ends_with([' ', '\n']) {
                    out.push(' ');
                }
                out.push_str(&decoded);
            }
            idx = end + 1;
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

fn decode_pdf_literal(source: &[u8]) -> String {
    let mut decoded = Vec::with_capacity(source.len());
    let mut cursor = 0usize;
    while cursor < source.len() {
        if source[cursor] != b'\\' {
            decoded.push(source[cursor]);
            cursor += 1;
            continue;
        }
        cursor += 1;
        if cursor >= source.len() {
            break;
        }
        match source[cursor] {
            b'n' => decoded.push(b'\n'),
            b'r' => decoded.push(b'\r'),
            b't' => decoded.push(b'\t'),
            b'b' => decoded.push(8),
            b'f' => decoded.push(12),
            b'\r' => {
                if source.get(cursor + 1) == Some(&b'\n') {
                    cursor += 1;
                }
            }
            b'\n' => {}
            b'0'..=b'7' => {
                let mut value = 0u16;
                let mut digits = 0usize;
                while cursor < source.len() && digits < 3 && matches!(source[cursor], b'0'..=b'7') {
                    value = value * 8 + u16::from(source[cursor] - b'0');
                    cursor += 1;
                    digits += 1;
                }
                decoded.push(value as u8);
                continue;
            }
            value => decoded.push(value),
        }
        cursor += 1;
    }

    if decoded.starts_with(&[0xfe, 0xff]) {
        let utf16 = decoded[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        String::from_utf16_lossy(&utf16)
    } else {
        String::from_utf8_lossy(&decoded).into_owned()
    }
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
    fn xlsx_extracts_unicode_shared_strings() {
        let path = temp_dir("xlsx").join("sample.xlsx");
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("xl/sharedStrings.xml", options).unwrap();
        zip.write_all("<sst><si><t>名称</t></si><si><t>TierNote</t></si></sst>".as_bytes())
            .unwrap();
        zip.start_file("xl/worksheets/sheet1.xml", options).unwrap();
        zip.write_all(
            b"<worksheet><sheetData><row><c t=\"s\"><v>0</v></c><c t=\"s\"><v>1</v></c></row></sheetData></worksheet>",
        )
        .unwrap();
        zip.finish().unwrap();

        let result = read_file_content(&path).unwrap();
        assert!(
            result.text.contains("名称 | TierNote"),
            "got: {}",
            result.text
        );
    }

    #[test]
    fn open_document_extracts_content_xml() {
        let path = temp_dir("odt").join("sample.odt");
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("content.xml", options).unwrap();
        zip.write_all(
            b"<office:document><text:p>Hello</text:p><text:p>World</text:p></office:document>",
        )
        .unwrap();
        zip.finish().unwrap();

        let result = read_file_content(&path).unwrap();
        assert_eq!(result.text, "Hello\nWorld");
    }

    #[test]
    fn epub_extracts_local_html_chapters() {
        let path = temp_dir("epub").join("sample.epub");
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("OEBPS/chapter.xhtml", options).unwrap();
        zip.write_all(b"<html><body><h1>Hello</h1><p>World</p></body></html>")
            .unwrap();
        zip.finish().unwrap();

        let result = read_file_content(&path).unwrap();
        assert!(result.text.contains("Hello World"), "got: {}", result.text);
    }

    #[test]
    fn pdf_extracts_flate_compressed_text_operators() {
        let path = temp_dir("pdf-flate").join("sample.pdf");
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder
            .write_all(b"BT (Hello\\040PDF) Tj [(from) 20 (array)] TJ ET")
            .unwrap();
        let compressed = encoder.finish().unwrap();
        let mut pdf = b"%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n".to_vec();
        pdf.extend_from_slice(&compressed);
        pdf.extend_from_slice(b"\nendstream\nendobj\n%%EOF");
        fs::write(&path, pdf).unwrap();

        let result = read_file_content(&path).unwrap();
        assert_eq!(result.text, "Hello PDF from array");
    }

    #[test]
    fn csv_converts_to_markdown_without_an_external_converter() {
        let path = temp_dir("csv").join("sample.csv");
        fs::write(&path, "name,summary\nTierNote,\"local, private\"\n").unwrap();
        let result = read_file_content(&path).unwrap();
        assert!(result.text.contains("| name | summary |"));
        assert!(result.text.contains("| TierNote | local, private |"));
    }

    #[test]
    fn rtf_extracts_paragraphs_and_unicode() {
        let path = temp_dir("rtf").join("sample.rtf");
        fs::write(&path, r"{\rtf1 First\par Second \u20013?}").unwrap();
        let result = read_file_content(&path).unwrap();
        assert!(
            result.text.contains("First\nSecond 中"),
            "got: {}",
            result.text
        );
    }

    #[test]
    fn truncation_stays_on_a_utf8_boundary() {
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

    #[test]
    fn strip_tags_converts_breaks() {
        let xml = "<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World</w:t></w:r></w:p></w:document>";
        let text = strip_xml_tags(xml);
        assert_eq!(text, "Hello\nWorld");
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

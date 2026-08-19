use chrono::Utc;
use printpdf::{
    Color, IndirectFontRef, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference, Rgb,
};
use serde::Deserialize;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

const MAX_BLOCKS: usize = 200;
const MAX_ITEMS_PER_LIST: usize = 30;
const MAX_TEXT_CHARS: usize = 12_000;
const MAX_TOTAL_TEXT_CHARS: usize = 500_000;
const PAGE_WIDTH_MM: f32 = 210.0;
const PAGE_HEIGHT_MM: f32 = 297.0;
const PDF_TOP_MM: f32 = 272.0;
const PDF_BOTTOM_MM: f32 = 22.0;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRequest {
    title: String,
    format: String,
    #[serde(default)]
    file_name: Option<String>,
    #[serde(default)]
    subtitle: String,
    #[serde(default)]
    author: String,
    blocks: Vec<DocumentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    items: Vec<String>,
    #[serde(default)]
    level: Option<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DocumentFormat {
    Docx,
    Pdf,
}

impl DocumentFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "docx" => Ok(Self::Docx),
            "pdf" => Ok(Self::Pdf),
            _ => Err("format must be 'docx' or 'pdf'".to_string()),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Pdf => "pdf",
        }
    }
}

#[derive(Debug)]
pub struct DocumentOutput {
    pub path: PathBuf,
    pub format: &'static str,
    pub editable: bool,
    pub block_count: usize,
    pub page_count: Option<usize>,
}

pub fn create_document(
    mut request: DocumentRequest,
    workspace_root: &Path,
) -> Result<DocumentOutput, String> {
    request.title = normalize_text(&request.title);
    request.subtitle = normalize_text(&request.subtitle);
    request.author = normalize_text(&request.author);
    if request.title.is_empty() || request.title.chars().count() > 180 {
        return Err("title must contain between 1 and 180 characters".to_string());
    }
    if request.subtitle.chars().count() > 300 || request.author.chars().count() > 120 {
        return Err("subtitle or author is too long".to_string());
    }
    if request.blocks.is_empty() || request.blocks.len() > MAX_BLOCKS {
        return Err(format!(
            "blocks must contain between 1 and {MAX_BLOCKS} items"
        ));
    }
    let format = DocumentFormat::parse(&request.format)?;
    request.blocks = request
        .blocks
        .into_iter()
        .enumerate()
        .map(|(index, block)| validate_block(block, index))
        .collect::<Result<Vec<_>, _>>()?;
    let total_text_chars = request.title.chars().count()
        + request.subtitle.chars().count()
        + request.author.chars().count()
        + request
            .blocks
            .iter()
            .map(|block| {
                block.text.chars().count()
                    + block
                        .items
                        .iter()
                        .map(|item| item.chars().count())
                        .sum::<usize>()
            })
            .sum::<usize>();
    if total_text_chars > MAX_TOTAL_TEXT_CHARS {
        return Err(format!(
            "document text must contain no more than {MAX_TOTAL_TEXT_CHARS} characters"
        ));
    }

    fs::create_dir_all(workspace_root)
        .map_err(|error| format!("Could not create the workspace directory: {error}"))?;
    let root = workspace_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the workspace directory: {error}"))?;
    let (path, file) =
        reserve_output_file(&root, request.file_name.as_deref(), &request.title, format)?;
    let result = match format {
        DocumentFormat::Docx => write_docx(file, &request).map(|_| None),
        DocumentFormat::Pdf => write_pdf(file, &request).map(Some),
    };
    match result {
        Ok(page_count) => Ok(DocumentOutput {
            path,
            format: format.extension(),
            editable: format == DocumentFormat::Docx,
            block_count: request.blocks.len(),
            page_count,
        }),
        Err(error) => {
            let _ = fs::remove_file(&path);
            Err(error)
        }
    }
}

fn validate_block(mut block: DocumentBlock, index: usize) -> Result<DocumentBlock, String> {
    block.kind = block.kind.trim().to_ascii_lowercase();
    block.text = normalize_text(&block.text);
    block.items = block
        .items
        .into_iter()
        .map(|item| normalize_text(&item))
        .filter(|item| !item.is_empty())
        .collect();
    let label = format!("block {}", index + 1);
    match block.kind.as_str() {
        "heading" => {
            if block.text.is_empty() {
                return Err(format!("{label} heading text must not be empty"));
            }
            if !matches!(block.level.unwrap_or(1), 1..=3) {
                return Err(format!("{label} heading level must be 1, 2, or 3"));
            }
        }
        "paragraph" | "quote" => {
            if block.text.is_empty() {
                return Err(format!("{label} text must not be empty"));
            }
        }
        "bullets" => {
            if block.items.is_empty() || block.items.len() > MAX_ITEMS_PER_LIST {
                return Err(format!(
                    "{label} items must contain between 1 and {MAX_ITEMS_PER_LIST} entries"
                ));
            }
        }
        "page-break" => {}
        _ => {
            return Err(format!(
                "{label} type must be heading, paragraph, bullets, quote, or page-break"
            ))
        }
    }
    if block.text.chars().count() > MAX_TEXT_CHARS
        || block
            .items
            .iter()
            .any(|item| item.chars().count() > MAX_TEXT_CHARS)
    {
        return Err(format!("{label} contains too much text"));
    }
    Ok(block)
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn reserve_output_file(
    root: &Path,
    requested: Option<&str>,
    title: &str,
    format: DocumentFormat,
) -> Result<(PathBuf, fs::File), String> {
    let extension = format.extension();
    let requested = requested.map(str::trim).filter(|name| !name.is_empty());
    let mut filename = requested
        .map(str::to_string)
        .unwrap_or_else(|| format!("{}.{}", sanitize_filename(title), extension));
    if Path::new(&filename).extension().is_none() {
        filename.push('.');
        filename.push_str(extension);
    }
    let candidate = Path::new(&filename);
    if candidate.components().count() != 1
        || !candidate
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
    {
        return Err(format!(
            "fileName must be a workspace-root .{extension} filename"
        ));
    }
    let stem = candidate
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_filename)
        .unwrap_or_else(|| "document".to_string());
    for number in 1..=999 {
        let name = if number == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{number}.{extension}")
        };
        let path = root.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not reserve the document file: {error}")),
        }
    }
    Err("Could not choose an available document filename".to_string())
}

fn sanitize_filename(value: &str) -> String {
    let mut name = value
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character if character.is_control() => '-',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    while name.contains("--") {
        name = name.replace("--", "-");
    }
    if name.is_empty() {
        name = "document".to_string();
    }
    name.chars().take(80).collect()
}

fn write_docx(file: fs::File, request: &DocumentRequest) -> Result<(), String> {
    let mut archive = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let created = Utc::now().to_rfc3339();
    let parts = [
        ("[Content_Types].xml", content_types_xml()),
        ("_rels/.rels", ROOT_RELS.to_string()),
        ("docProps/core.xml", core_properties_xml(request, &created)),
        ("docProps/app.xml", APP_PROPERTIES.to_string()),
        ("word/document.xml", document_xml(request)),
        ("word/_rels/document.xml.rels", DOCUMENT_RELS.to_string()),
        ("word/styles.xml", STYLES.to_string()),
        ("word/settings.xml", SETTINGS.to_string()),
        ("word/numbering.xml", NUMBERING.to_string()),
        ("word/fontTable.xml", FONT_TABLE.to_string()),
        ("word/theme/theme1.xml", THEME.to_string()),
    ];
    for (name, contents) in parts {
        archive
            .start_file(name, options)
            .map_err(|error| format!("Could not create DOCX part {name}: {error}"))?;
        archive
            .write_all(contents.as_bytes())
            .map_err(|error| format!("Could not write DOCX part {name}: {error}"))?;
    }
    archive
        .finish()
        .map_err(|error| format!("Could not finish the DOCX package: {error}"))?;
    Ok(())
}

fn content_types_xml() -> String {
    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>"#.to_string()
}

fn core_properties_xml(request: &DocumentRequest, created: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{}</dc:title><dc:creator>{}</dc:creator><cp:lastModifiedBy>TierNote</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{created}</dcterms:modified></cp:coreProperties>"#,
        xml_escape(&request.title),
        xml_escape(&request.author)
    )
}

fn document_xml(request: &DocumentRequest) -> String {
    let mut body = String::new();
    body.push_str(&styled_paragraph(&request.title, "Title", None));
    if !request.subtitle.is_empty() {
        body.push_str(&styled_paragraph(&request.subtitle, "Subtitle", None));
    }
    if !request.author.is_empty() {
        body.push_str(&styled_paragraph(&request.author, "Author", None));
    }
    for block in &request.blocks {
        match block.kind.as_str() {
            "heading" => body.push_str(&styled_paragraph(
                &block.text,
                &format!("Heading{}", block.level.unwrap_or(1)),
                None,
            )),
            "paragraph" => body.push_str(&styled_paragraph(&block.text, "Normal", None)),
            "quote" => body.push_str(&styled_paragraph(&block.text, "Quote", None)),
            "bullets" => {
                for item in &block.items {
                    body.push_str(&styled_paragraph(item, "ListParagraph", Some(1)));
                }
            }
            "page-break" => body.push_str(r#"<w:p><w:r><w:br w:type="page"/></w:r></w:p>"#),
            _ => unreachable!(),
        }
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>"#
    )
}

fn styled_paragraph(text: &str, style: &str, numbering: Option<u8>) -> String {
    let numbering = numbering.map_or_else(String::new, |level| {
        format!(
            r#"<w:numPr><w:ilvl w:val="{}"/><w:numId w:val="1"/></w:numPr>"#,
            level.saturating_sub(1)
        )
    });
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{style}"/>{numbering}</w:pPr><w:r><w:rPr><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        xml_escape(text)
    )
}

#[derive(Clone)]
struct PdfLine {
    text: String,
    size: f32,
    bold: bool,
    indent: f32,
    before: f32,
    after: f32,
    muted: bool,
}

fn write_pdf(file: fs::File, request: &DocumentRequest) -> Result<usize, String> {
    let regular_path = find_pdf_font(false)
        .ok_or_else(|| "Could not find a local TrueType font for PDF generation".to_string())?;
    let bold_path = find_pdf_font(true).unwrap_or_else(|| regular_path.clone());
    let (doc, first_page, first_layer) = PdfDocument::new(
        &request.title,
        Mm(PAGE_WIDTH_MM),
        Mm(PAGE_HEIGHT_MM),
        "Content",
    );
    let regular = add_pdf_font(&doc, &regular_path)?;
    let bold = add_pdf_font(&doc, &bold_path)?;
    let lines = pdf_lines(request);
    let mut page_count = 1usize;
    let mut page = first_page;
    let mut layer = first_layer;
    let mut y = PDF_TOP_MM;
    for line in lines {
        if line.text == "\u{000c}" {
            let added = doc.add_page(Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Content");
            page = added.0;
            layer = added.1;
            page_count += 1;
            y = PDF_TOP_MM;
            continue;
        }
        let line_height = line.size * 0.352_778 * 1.48;
        let required = line.before + line_height + line.after;
        if y - required < PDF_BOTTOM_MM {
            let added = doc.add_page(Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Content");
            page = added.0;
            layer = added.1;
            page_count += 1;
            y = PDF_TOP_MM;
        }
        y -= line.before;
        let current = doc.get_page(page).get_layer(layer);
        set_pdf_text_color(&current, line.muted);
        current.use_text(
            &line.text,
            line.size,
            Mm(20.0 + line.indent),
            Mm(y),
            if line.bold { &bold } else { &regular },
        );
        y -= line_height + line.after;
    }
    doc.save(&mut BufWriter::new(file))
        .map_err(|error| format!("Could not finish the PDF file: {error}"))?;
    Ok(page_count)
}

fn add_pdf_font(doc: &PdfDocumentReference, path: &Path) -> Result<IndirectFontRef, String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("Could not open PDF font {}: {error}", path.display()))?;
    doc.add_external_font_with_subsetting(file, true)
        .map_err(|error| format!("Could not load PDF font {}: {error}", path.display()))
}

fn set_pdf_text_color(layer: &PdfLayerReference, muted: bool) {
    let value = if muted { 0.38 } else { 0.08 };
    layer.set_fill_color(Color::Rgb(Rgb::new(value, value, value, None)));
}

fn find_pdf_font(bold: bool) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(windows_dir) = std::env::var_os("WINDIR") {
        let fonts = PathBuf::from(windows_dir).join("Fonts");
        for name in if bold {
            ["Dengb.ttf", "simhei.ttf", "arialbd.ttf", "Deng.ttf"]
        } else {
            ["Deng.ttf", "simhei.ttf", "arial.ttf", "Dengb.ttf"]
        } {
            candidates.push(fonts.join(name));
        }
    }
    let unix_candidates = if bold {
        [
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ]
    } else {
        [
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ]
    };
    candidates.extend(unix_candidates.into_iter().map(PathBuf::from));
    candidates.into_iter().find(|path| path.is_file())
}

fn pdf_lines(request: &DocumentRequest) -> Vec<PdfLine> {
    let mut lines = Vec::new();
    push_wrapped(&mut lines, &request.title, 26.0, true, 0.0, 0.0, 4.0, false);
    if !request.subtitle.is_empty() {
        push_wrapped(
            &mut lines,
            &request.subtitle,
            13.0,
            false,
            0.0,
            0.0,
            2.0,
            true,
        );
    }
    if !request.author.is_empty() {
        push_wrapped(
            &mut lines,
            &request.author,
            10.0,
            false,
            0.0,
            0.0,
            8.0,
            true,
        );
    } else if let Some(line) = lines.last_mut() {
        line.after += 6.0;
    }
    for block in &request.blocks {
        match block.kind.as_str() {
            "heading" => {
                let (size, before, after) = match block.level.unwrap_or(1) {
                    1 => (20.0, 7.0, 3.0),
                    2 => (16.0, 5.0, 2.0),
                    _ => (13.0, 4.0, 1.5),
                };
                push_wrapped(
                    &mut lines,
                    &block.text,
                    size,
                    true,
                    0.0,
                    before,
                    after,
                    false,
                );
            }
            "paragraph" => push_wrapped(&mut lines, &block.text, 11.0, false, 0.0, 1.5, 2.5, false),
            "quote" => push_wrapped(
                &mut lines,
                &format!("“{}”", block.text),
                11.0,
                false,
                7.0,
                4.0,
                4.0,
                true,
            ),
            "bullets" => {
                for item in &block.items {
                    push_wrapped(
                        &mut lines,
                        &format!("• {item}"),
                        11.0,
                        false,
                        4.0,
                        1.0,
                        1.5,
                        false,
                    );
                }
            }
            "page-break" => lines.push(PdfLine {
                text: "\u{000c}".to_string(),
                size: 0.0,
                bold: false,
                indent: 0.0,
                before: 0.0,
                after: 0.0,
                muted: false,
            }),
            _ => unreachable!(),
        }
    }
    lines
}

#[allow(clippy::too_many_arguments)]
fn push_wrapped(
    output: &mut Vec<PdfLine>,
    text: &str,
    size: f32,
    bold: bool,
    indent: f32,
    before: f32,
    after: f32,
    muted: bool,
) {
    let max_units = (((PAGE_WIDTH_MM - 40.0 - indent) / (size * 0.352_778)) * 1.78)
        .floor()
        .max(12.0) as usize;
    let wrapped = wrap_text(text, max_units);
    let last_index = wrapped.len().saturating_sub(1);
    for (index, line) in wrapped.into_iter().enumerate() {
        output.push(PdfLine {
            text: line,
            size,
            bold,
            indent,
            before: if index == 0 { before } else { 0.0 },
            after: if index == last_index { after } else { 0.0 },
            muted,
        });
    }
}

fn wrap_text(text: &str, max_units: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut current_units = 0usize;
    for character in text.chars() {
        let units = if character.is_ascii() { 1 } else { 2 };
        if current_units + units > max_units && !current.is_empty() {
            lines.push(current.trim_end().to_string());
            current.clear();
            current_units = 0;
        }
        current.push(character);
        current_units += units;
    }
    if !current.is_empty() {
        lines.push(current.trim_end().to_string());
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>"#;
const DOCUMENT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>"#;
const APP_PROPERTIES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TierNote</Application><AppVersion>1.0</AppVersion></Properties>"#;
const SETTINGS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="420"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>"#;
const FONT_TABLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Aptos"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="等线"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font></w:fonts>"#;
const NUMBERING: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>"#;
const STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="等线"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="180"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:color w:val="171717"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="666666"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Author"><w:name w:val="Author"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="360"/></w:pPr><w:rPr><w:color w:val="777777"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="171717"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:ind w:left="540" w:right="360"/><w:spacing w:before="180" w:after="220"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:contextualSpacing/></w:pPr></w:style></w:styles>"#;
const THEME: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TierNote"><a:themeElements><a:clrScheme name="TierNote"><a:dk1><a:srgbClr val="171717"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="444444"/></a:dk2><a:lt2><a:srgbClr val="F5F5F3"/></a:lt2><a:accent1><a:srgbClr val="B65C13"/></a:accent1><a:accent2><a:srgbClr val="6B7280"/></a:accent2><a:accent3><a:srgbClr val="8A7A63"/></a:accent3><a:accent4><a:srgbClr val="4B5563"/></a:accent4><a:accent5><a:srgbClr val="9CA3AF"/></a:accent5><a:accent6><a:srgbClr val="D1D5DB"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="TierNote"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="等线"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="等线"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="TierNote"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"#;

#[cfg(test)]
mod tests {
    use super::*;
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::json;
    use std::io::Read;

    fn request(value: serde_json::Value) -> DocumentRequest {
        serde_json::from_value(value).expect("fixture should deserialize")
    }

    fn fixture_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "tiernote-document-{label}-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    #[test]
    fn creates_an_editable_docx_with_semantic_styles() {
        let root = fixture_root("docx");
        let output = create_document(
            request(json!({
                "title": "项目复盘",
                "format": "docx",
                "subtitle": "TierNote 文档",
                "author": "测试作者",
                "blocks": [
                    {"type": "heading", "level": 1, "text": "关键结论"},
                    {"type": "paragraph", "text": "收入增长 & 重点渠道清晰。"},
                    {"type": "bullets", "items": ["继续投入", "验证新市场"]},
                    {"type": "quote", "text": "保持节奏"}
                ]
            })),
            &root,
        )
        .expect("DOCX should be created");
        assert!(output.editable);
        assert_eq!(output.format, "docx");
        if let Ok(smoke_dir) = std::env::var("TIERNOTE_DOCUMENT_SMOKE_DIR") {
            fs::create_dir_all(&smoke_dir).expect("smoke directory should be created");
            fs::copy(
                &output.path,
                Path::new(&smoke_dir).join("tiernote-smoke.docx"),
            )
            .expect("smoke DOCX should be copied");
        }
        let file = fs::File::open(&output.path).expect("DOCX should open");
        let mut archive = zip::ZipArchive::new(file).expect("DOCX should be a ZIP package");
        for part in [
            "word/document.xml",
            "word/styles.xml",
            "word/numbering.xml",
            "docProps/core.xml",
        ] {
            let mut xml = String::new();
            archive
                .by_name(part)
                .expect("part should exist")
                .read_to_string(&mut xml)
                .expect("part should be readable");
            let mut reader = Reader::from_str(&xml);
            loop {
                match reader.read_event() {
                    Ok(Event::Eof) => break,
                    Ok(_) => {}
                    Err(error) => panic!("{part} is invalid XML: {error}"),
                }
            }
            if part == "word/document.xml" {
                assert!(xml.contains("项目复盘"));
                assert!(xml.contains("收入增长 &amp; 重点渠道清晰。"));
                assert!(xml.contains("Heading1"));
            }
        }
        drop(archive);
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn creates_a_local_pdf_with_cjk_text() {
        if find_pdf_font(false).is_none() {
            return;
        }
        let root = fixture_root("pdf");
        let output = create_document(
            request(json!({
                "title": "中文 PDF 测试",
                "format": "pdf",
                "blocks": [
                    {"type": "heading", "text": "摘要"},
                    {"type": "paragraph", "text": "这是一份无需 Office 的本地 PDF。"},
                    {"type": "page-break"},
                    {"type": "paragraph", "text": "第二页。"}
                ]
            })),
            &root,
        )
        .expect("PDF should be created");
        assert_eq!(output.page_count, Some(2));
        if let Ok(smoke_dir) = std::env::var("TIERNOTE_DOCUMENT_SMOKE_DIR") {
            fs::create_dir_all(&smoke_dir).expect("smoke directory should be created");
            fs::copy(
                &output.path,
                Path::new(&smoke_dir).join("tiernote-smoke.pdf"),
            )
            .expect("smoke PDF should be copied");
        }
        let mut header = [0u8; 5];
        fs::File::open(&output.path)
            .expect("PDF should open")
            .read_exact(&mut header)
            .expect("PDF header should be readable");
        assert_eq!(&header, b"%PDF-");
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn validates_paths_formats_and_block_shapes() {
        let root = fixture_root("guards");
        let traversal = create_document(
            request(json!({
                "title": "Unsafe",
                "format": "docx",
                "fileName": "../unsafe.docx",
                "blocks": [{"type": "paragraph", "text": "No"}]
            })),
            &root,
        );
        assert!(traversal.is_err());
        let invalid = create_document(
            request(json!({
                "title": "Invalid",
                "format": "txt",
                "blocks": [{"type": "heading", "level": 9, "text": "No"}]
            })),
            &root,
        );
        assert!(invalid.is_err());
        let oversized_blocks = (0..42)
            .map(|_| json!({"type": "paragraph", "text": "字".repeat(MAX_TEXT_CHARS)}))
            .collect::<Vec<_>>();
        let oversized = create_document(
            request(json!({
                "title": "Oversized",
                "format": "docx",
                "blocks": oversized_blocks
            })),
            &root,
        );
        assert!(oversized
            .expect_err("oversized document should be rejected")
            .contains("no more than"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn wraps_chinese_and_ascii_by_display_width() {
        assert_eq!(wrap_text("中文AB中文", 5), vec!["中文A", "B中文"]);
    }
}

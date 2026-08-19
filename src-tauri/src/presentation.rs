use chrono::Utc;
use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use zip::write::SimpleFileOptions;

const SLIDE_WIDTH: i64 = 12_192_000;
const SLIDE_HEIGHT: i64 = 6_858_000;
const MAX_SLIDES: usize = 30;
const MAX_IMAGE_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationRequest {
    title: String,
    #[serde(default)]
    file_name: Option<String>,
    #[serde(default)]
    theme: Option<String>,
    slides: Vec<PresentationSlide>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresentationSlide {
    #[serde(default = "default_layout")]
    layout: String,
    title: String,
    #[serde(default)]
    subtitle: String,
    #[serde(default)]
    body: Vec<String>,
    #[serde(default)]
    right_body: Vec<String>,
    #[serde(default)]
    image_path: Option<String>,
}

pub struct PresentationOutput {
    pub path: PathBuf,
    pub slide_count: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Copy)]
struct DeckTheme {
    background: &'static str,
    foreground: &'static str,
    muted: &'static str,
    accent: &'static str,
    panel: &'static str,
}

struct SlideImage {
    bytes: Vec<u8>,
    extension: &'static str,
    width: u32,
    height: u32,
    media_index: usize,
}

fn default_layout() -> String {
    "content".to_string()
}

impl DeckTheme {
    fn named(name: Option<&str>) -> Result<Self, String> {
        match name
            .unwrap_or("minimal")
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "minimal" => Ok(Self {
                background: "F7F6F2",
                foreground: "171717",
                muted: "66645F",
                accent: "D97706",
                panel: "ECEAE4",
            }),
            "business" => Ok(Self {
                background: "F4F7FA",
                foreground: "102A43",
                muted: "52667A",
                accent: "1976A3",
                panel: "E4EDF4",
            }),
            "dark" => Ok(Self {
                background: "17191C",
                foreground: "F5F4F0",
                muted: "B9B7B0",
                accent: "F2B84B",
                panel: "292D31",
            }),
            _ => Err("theme must be 'minimal', 'business', or 'dark'".to_string()),
        }
    }
}

#[cfg(test)]
pub fn create_presentation(
    request: PresentationRequest,
    workspace_root: &Path,
) -> Result<PresentationOutput, String> {
    create_presentation_in(request, workspace_root, workspace_root)
}

pub fn create_presentation_in(
    request: PresentationRequest,
    workspace_root: &Path,
    output_root: &Path,
) -> Result<PresentationOutput, String> {
    let title = normalize_text(&request.title);
    if title.is_empty() {
        return Err("title must be a non-empty string".to_string());
    }
    if title.chars().count() > 160 {
        return Err("title must contain no more than 160 characters".to_string());
    }
    if request.slides.is_empty() || request.slides.len() > MAX_SLIDES {
        return Err(format!(
            "slides must contain between 1 and {MAX_SLIDES} items"
        ));
    }
    let theme = DeckTheme::named(request.theme.as_deref())?;
    let slides = request
        .slides
        .into_iter()
        .enumerate()
        .map(|(index, slide)| validate_slide(slide, index))
        .collect::<Result<Vec<_>, _>>()?;

    fs::create_dir_all(workspace_root)
        .map_err(|error| format!("Could not create the workspace directory: {error}"))?;
    let canonical_root = workspace_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the workspace directory: {error}"))?;
    fs::create_dir_all(output_root)
        .map_err(|error| format!("Could not create the generated-files directory: {error}"))?;
    let canonical_output_root = output_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the generated-files directory: {error}"))?;
    let mut warnings = Vec::new();
    let mut media_index = 0usize;
    let mut images = Vec::with_capacity(slides.len());
    for (slide_index, slide) in slides.iter().enumerate() {
        let image = match slide.image_path.as_deref() {
            Some(relative) => {
                media_index += 1;
                Some(
                    load_slide_image(&canonical_root, relative, media_index)
                        .map_err(|error| format!("slide {} image: {error}", slide_index + 1))?,
                )
            }
            None => None,
        };
        if slide.layout == "quote" && slide.body.len() > 1 {
            warnings.push(format!(
                "Slide {} uses only the first body item in the quote layout.",
                slide_index + 1
            ));
        }
        images.push(image);
    }

    let (output_path, output_file) =
        reserve_output_file(&canonical_output_root, request.file_name.as_deref(), &title)?;
    if let Err(error) = write_pptx(output_file, &title, &slides, &images, theme) {
        let _ = fs::remove_file(&output_path);
        return Err(error);
    }
    Ok(PresentationOutput {
        path: output_path,
        slide_count: slides.len(),
        warnings,
    })
}

fn validate_slide(mut slide: PresentationSlide, index: usize) -> Result<PresentationSlide, String> {
    slide.layout = slide.layout.trim().to_ascii_lowercase();
    if !matches!(
        slide.layout.as_str(),
        "title" | "section" | "content" | "two-column" | "quote"
    ) {
        return Err(format!(
            "slide {} layout must be title, section, content, two-column, or quote",
            index + 1
        ));
    }
    slide.title = normalize_text(&slide.title);
    slide.subtitle = normalize_text(&slide.subtitle);
    slide.body = normalize_items(slide.body);
    slide.right_body = normalize_items(slide.right_body);
    slide.image_path = slide
        .image_path
        .map(|path| path.trim().replace('\\', "/"))
        .filter(|path| !path.is_empty());

    if slide.title.is_empty() {
        return Err(format!("slide {} title must not be empty", index + 1));
    }
    let title_limit = if matches!(slide.layout.as_str(), "title" | "section") {
        96
    } else {
        80
    };
    if slide.title.chars().count() > title_limit || slide.subtitle.chars().count() > 180 {
        return Err(format!("slide {} title or subtitle is too long", index + 1));
    }
    if slide.body.len() > 8 || slide.right_body.len() > 8 {
        return Err(format!(
            "slide {} body columns accept at most 8 items",
            index + 1
        ));
    }
    if slide
        .body
        .iter()
        .chain(slide.right_body.iter())
        .any(|item| item.chars().count() > 180)
    {
        return Err(format!(
            "slide {} contains a body item over 180 characters",
            index + 1
        ));
    }
    let total_chars: usize = slide
        .body
        .iter()
        .chain(slide.right_body.iter())
        .map(|item| item.chars().count())
        .sum();
    if total_chars > 1_200 {
        return Err(format!("slide {} contains too much text", index + 1));
    }
    if slide.layout == "two-column" && slide.right_body.is_empty() {
        return Err(format!(
            "slide {} two-column layout requires rightBody",
            index + 1
        ));
    }
    let fits = match slide.layout.as_str() {
        "two-column" => {
            estimated_lines(&slide.body, 44) <= 16 && estimated_lines(&slide.right_body, 42) <= 16
        }
        "content" if slide.image_path.is_some() => estimated_lines(&slide.body, 52) <= 17,
        "content" => estimated_lines(&slide.body, 86) <= 18,
        "quote" => slide.body.first().map_or(true, |quote| {
            estimated_lines(std::slice::from_ref(quote), 64) <= 7
        }),
        _ => true,
    };
    if !fits {
        return Err(format!(
            "slide {} text will not fit the selected layout; shorten it or split the slide",
            index + 1
        ));
    }
    Ok(slide)
}

fn display_units(value: &str) -> usize {
    value
        .chars()
        .map(|character| if character.is_ascii() { 1 } else { 2 })
        .sum()
}

fn estimated_lines(items: &[String], units_per_line: usize) -> usize {
    items
        .iter()
        .map(|item| display_units(item).max(1).div_ceil(units_per_line))
        .sum()
}

fn normalize_items(items: Vec<String>) -> Vec<String> {
    items
        .into_iter()
        .map(|item| normalize_text(&item))
        .filter(|item| !item.is_empty())
        .collect()
}

fn normalize_text(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn reserve_output_file(
    root: &Path,
    requested: Option<&str>,
    title: &str,
) -> Result<(PathBuf, fs::File), String> {
    let requested = requested.map(str::trim).filter(|name| !name.is_empty());
    let mut filename = requested
        .map(str::to_string)
        .unwrap_or_else(|| format!("{}.pptx", sanitize_filename(title)));
    if Path::new(&filename).extension().is_none() {
        filename.push_str(".pptx");
    }
    let candidate = Path::new(&filename);
    if candidate.components().count() != 1
        || !candidate
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("pptx"))
    {
        return Err("fileName must be a workspace-root .pptx filename".to_string());
    }
    let stem = candidate
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(sanitize_filename)
        .unwrap_or_else(|| "presentation".to_string());
    for number in 1..=999 {
        let filename = if number == 1 {
            format!("{stem}.pptx")
        } else {
            format!("{stem}-{number}.pptx")
        };
        let path = root.join(filename);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not reserve the presentation file: {error}")),
        }
    }
    Err("Could not choose an available presentation filename".to_string())
}

fn sanitize_filename(value: &str) -> String {
    let mut name = value
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            ch if ch.is_control() => '-',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    while name.contains("--") {
        name = name.replace("--", "-");
    }
    if name.is_empty() {
        name = "presentation".to_string();
    }
    name.chars().take(80).collect()
}

fn load_slide_image(root: &Path, relative: &str, media_index: usize) -> Result<SlideImage, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("imagePath must be relative to the workspace".to_string());
    }
    let path = root.join(relative_path);
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Could not resolve {relative}: {error}"))?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err("imagePath must point to a workspace image".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("Could not inspect {relative}: {error}"))?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err(format!("image exceeds the {MAX_IMAGE_BYTES}-byte limit"));
    }
    let extension = canonical
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let extension = match extension.as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpeg",
        _ => return Err("imagePath must point to a PNG or JPEG image".to_string()),
    };
    let bytes =
        fs::read(&canonical).map_err(|error| format!("Could not read {relative}: {error}"))?;
    let (width, height) = image_dimensions(&bytes, extension).unwrap_or((16, 9));
    Ok(SlideImage {
        bytes,
        extension,
        width,
        height,
        media_index,
    })
}

fn image_dimensions(bytes: &[u8], extension: &str) -> Option<(u32, u32)> {
    if extension == "png" && bytes.len() >= 24 && bytes.get(..8)? == b"\x89PNG\r\n\x1a\n" {
        return Some((
            u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?),
            u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?),
        ));
    }
    if extension == "jpeg" && bytes.get(..2)? == [0xff, 0xd8] {
        let mut cursor = 2usize;
        while cursor + 9 < bytes.len() {
            if bytes[cursor] != 0xff {
                cursor += 1;
                continue;
            }
            let marker = bytes[cursor + 1];
            cursor += 2;
            if matches!(marker, 0xd8 | 0xd9) {
                continue;
            }
            let length =
                u16::from_be_bytes(bytes.get(cursor..cursor + 2)?.try_into().ok()?) as usize;
            if length < 2 || cursor + length > bytes.len() {
                break;
            }
            if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
                let height =
                    u16::from_be_bytes(bytes.get(cursor + 3..cursor + 5)?.try_into().ok()?) as u32;
                let width =
                    u16::from_be_bytes(bytes.get(cursor + 5..cursor + 7)?.try_into().ok()?) as u32;
                return Some((width, height));
            }
            cursor += length;
        }
    }
    None
}

fn write_pptx(
    file: fs::File,
    title: &str,
    slides: &[PresentationSlide],
    images: &[Option<SlideImage>],
    theme: DeckTheme,
) -> Result<(), String> {
    let mut archive = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    write_part(
        &mut archive,
        options,
        "[Content_Types].xml",
        &content_types(slides.len(), images),
    )?;
    write_part(&mut archive, options, "_rels/.rels", ROOT_RELS)?;
    write_part(
        &mut archive,
        options,
        "docProps/app.xml",
        &app_properties(slides.len()),
    )?;
    write_part(
        &mut archive,
        options,
        "docProps/core.xml",
        &core_properties(title),
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/presentation.xml",
        &presentation_xml(slides.len()),
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/_rels/presentation.xml.rels",
        &presentation_rels(slides.len()),
    )?;
    write_part(&mut archive, options, "ppt/presProps.xml", PRES_PROPS)?;
    write_part(&mut archive, options, "ppt/viewProps.xml", VIEW_PROPS)?;
    write_part(&mut archive, options, "ppt/tableStyles.xml", TABLE_STYLES)?;
    write_part(
        &mut archive,
        options,
        "ppt/theme/theme1.xml",
        &theme_xml(theme),
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/slideMasters/slideMaster1.xml",
        &slide_master_xml(theme),
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        MASTER_RELS,
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/slideLayouts/slideLayout1.xml",
        SLIDE_LAYOUT,
    )?;
    write_part(
        &mut archive,
        options,
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        LAYOUT_RELS,
    )?;

    for (index, slide) in slides.iter().enumerate() {
        write_part(
            &mut archive,
            options,
            &format!("ppt/slides/slide{}.xml", index + 1),
            &slide_xml(
                slide,
                index + 1,
                slides.len(),
                images[index].as_ref(),
                theme,
            ),
        )?;
        write_part(
            &mut archive,
            options,
            &format!("ppt/slides/_rels/slide{}.xml.rels", index + 1),
            &slide_rels(images[index].as_ref()),
        )?;
    }
    for image in images.iter().flatten() {
        archive
            .start_file(
                format!("ppt/media/image{}.{}", image.media_index, image.extension),
                options,
            )
            .map_err(|error| format!("Could not add an image to the presentation: {error}"))?;
        archive
            .write_all(&image.bytes)
            .map_err(|error| format!("Could not write an image to the presentation: {error}"))?;
    }
    archive
        .finish()
        .map_err(|error| format!("Could not finish the presentation: {error}"))?;
    Ok(())
}

fn write_part(
    archive: &mut zip::ZipWriter<fs::File>,
    options: SimpleFileOptions,
    name: &str,
    contents: &str,
) -> Result<(), String> {
    archive
        .start_file(name, options)
        .map_err(|error| format!("Could not create {name}: {error}"))?;
    archive
        .write_all(contents.as_bytes())
        .map_err(|error| format!("Could not write {name}: {error}"))
}

fn content_types(slide_count: usize, images: &[Option<SlideImage>]) -> String {
    let slides = (1..=slide_count)
        .map(|index| format!(r#"<Override PartName="/ppt/slides/slide{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#))
        .collect::<String>();
    let mut image_defaults = String::new();
    if images
        .iter()
        .flatten()
        .any(|image| image.extension == "png")
    {
        image_defaults.push_str(r#"<Default Extension="png" ContentType="image/png"/>"#);
    }
    if images
        .iter()
        .flatten()
        .any(|image| image.extension == "jpeg")
    {
        image_defaults.push_str(r#"<Default Extension="jpeg" ContentType="image/jpeg"/>"#);
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{image_defaults}<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>{slides}</Types>"#
    )
}

fn app_properties(slide_count: usize) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TierNote</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>{slide_count}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><ScaleCrop>false</ScaleCrop><Company>TierNote</Company><AppVersion>1.0</AppVersion></Properties>"#
    )
}

fn core_properties(title: &str) -> String {
    let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{}</dc:title><dc:creator>TierNote</dc:creator><cp:lastModifiedBy>TierNote</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified></cp:coreProperties>"#,
        xml_escape(title)
    )
}

fn presentation_xml(slide_count: usize) -> String {
    let slide_ids = (1..=slide_count)
        .map(|index| format!(r#"<p:sldId id="{}" r:id="rId{}"/>"#, 255 + index, index + 1))
        .collect::<String>();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>{slide_ids}</p:sldIdLst><p:sldSz cx="{SLIDE_WIDTH}" cy="{SLIDE_HEIGHT}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:defaultTextStyle></p:presentation>"#
    )
}

fn presentation_rels(slide_count: usize) -> String {
    let mut rels = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>"#,
    );
    for index in 1..=slide_count {
        rels.push_str(&format!(r#"<Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{index}.xml"/>"#, index + 1));
    }
    let offset = slide_count + 2;
    rels.push_str(&format!(r#"<Relationship Id="rId{offset}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/></Relationships>"#, offset + 1, offset + 2));
    rels
}

fn slide_master_xml(theme: DeckTheme) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="TierNote Presentation"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-228600"><a:buChar char="•"/><a:defRPr sz="2200"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>"#,
        theme.background
    )
}

fn theme_xml(theme: DeckTheme) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="TierNote Presentation"><a:themeElements><a:clrScheme name="TierNote"><a:dk1><a:srgbClr val="{}"/></a:dk1><a:lt1><a:srgbClr val="{}"/></a:lt1><a:dk2><a:srgbClr val="{}"/></a:dk2><a:lt2><a:srgbClr val="{}"/></a:lt2><a:accent1><a:srgbClr val="{}"/></a:accent1><a:accent2><a:srgbClr val="4E7C73"/></a:accent2><a:accent3><a:srgbClr val="9C6B63"/></a:accent3><a:accent4><a:srgbClr val="66788A"/></a:accent4><a:accent5><a:srgbClr val="8A7552"/></a:accent5><a:accent6><a:srgbClr val="766A8A"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="TierNote"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="TierNote"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:solidFill><a:schemeClr val="accent1"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"#,
        theme.foreground, theme.background, theme.muted, theme.panel, theme.accent
    )
}

fn slide_xml(
    slide: &PresentationSlide,
    slide_number: usize,
    slide_count: usize,
    image: Option<&SlideImage>,
    theme: DeckTheme,
) -> String {
    let mut shapes = String::new();
    shapes.push_str(&accent_bar_xml(2, theme.accent));
    match slide.layout.as_str() {
        "title" => {
            shapes.push_str(&text_box_xml(
                3,
                "Title",
                777_240,
                1_700_000,
                10_637_520,
                1_500_000,
                &[slide.title.as_str()],
                4000,
                theme.foreground,
                true,
                false,
                "l",
            ));
            if !slide.subtitle.is_empty() {
                shapes.push_str(&text_box_xml(
                    4,
                    "Subtitle",
                    786_240,
                    3_260_000,
                    9_700_000,
                    800_000,
                    &[slide.subtitle.as_str()],
                    2000,
                    theme.muted,
                    false,
                    false,
                    "l",
                ));
            }
        }
        "section" => {
            shapes.push_str(&text_box_xml(
                3,
                "Section title",
                1_200_000,
                2_100_000,
                9_900_000,
                1_350_000,
                &[slide.title.as_str()],
                3600,
                theme.foreground,
                true,
                false,
                "ctr",
            ));
            if !slide.subtitle.is_empty() {
                shapes.push_str(&text_box_xml(
                    4,
                    "Section subtitle",
                    1_650_000,
                    3_500_000,
                    9_000_000,
                    700_000,
                    &[slide.subtitle.as_str()],
                    1800,
                    theme.muted,
                    false,
                    false,
                    "ctr",
                ));
            }
        }
        "two-column" => {
            shapes.push_str(&slide_title_xml(&slide.title, theme));
            shapes.push_str(&panel_xml(
                4,
                720_000,
                1_550_000,
                5_380_000,
                4_350_000,
                theme.panel,
            ));
            shapes.push_str(&panel_xml(
                5,
                6_220_000,
                1_550_000,
                5_250_000,
                4_350_000,
                theme.panel,
            ));
            shapes.push_str(&text_box_xml(
                6,
                "Left column",
                980_000,
                1_800_000,
                4_850_000,
                3_850_000,
                &string_refs(&slide.body),
                body_size(&slide.body),
                theme.foreground,
                false,
                true,
                "l",
            ));
            shapes.push_str(&text_box_xml(
                7,
                "Right column",
                6_480_000,
                1_800_000,
                4_720_000,
                3_850_000,
                &string_refs(&slide.right_body),
                body_size(&slide.right_body),
                theme.foreground,
                false,
                true,
                "l",
            ));
        }
        "quote" => {
            shapes.push_str(&slide_title_xml(&slide.title, theme));
            let quote = slide
                .body
                .first()
                .map(String::as_str)
                .unwrap_or(&slide.title);
            shapes.push_str(&text_box_xml(
                4,
                "Quote",
                1_300_000,
                1_850_000,
                9_600_000,
                2_550_000,
                &[quote],
                quote_size(quote),
                theme.foreground,
                true,
                false,
                "ctr",
            ));
            if !slide.subtitle.is_empty() {
                shapes.push_str(&text_box_xml(
                    5,
                    "Attribution",
                    2_000_000,
                    4_550_000,
                    8_200_000,
                    650_000,
                    &[slide.subtitle.as_str()],
                    1700,
                    theme.muted,
                    false,
                    false,
                    "ctr",
                ));
            }
        }
        _ => {
            shapes.push_str(&slide_title_xml(&slide.title, theme));
            if let Some(image) = image {
                shapes.push_str(&text_box_xml(
                    4,
                    "Body",
                    780_000,
                    1_580_000,
                    6_200_000,
                    4_450_000,
                    &string_refs(&slide.body),
                    body_size(&slide.body),
                    theme.foreground,
                    false,
                    true,
                    "l",
                ));
                shapes.push_str(&picture_xml(
                    5, image, 7_450_000, 1_650_000, 4_050_000, 3_950_000,
                ));
            } else {
                shapes.push_str(&text_box_xml(
                    4,
                    "Body",
                    870_000,
                    1_580_000,
                    10_450_000,
                    4_500_000,
                    &string_refs(&slide.body),
                    body_size(&slide.body),
                    theme.foreground,
                    false,
                    true,
                    "l",
                ));
            }
            if !slide.subtitle.is_empty() {
                shapes.push_str(&text_box_xml(
                    6,
                    "Subtitle",
                    870_000,
                    5_850_000,
                    10_300_000,
                    450_000,
                    &[slide.subtitle.as_str()],
                    1300,
                    theme.muted,
                    false,
                    false,
                    "l",
                ));
            }
        }
    }
    shapes.push_str(&text_box_xml(
        20,
        "Slide number",
        10_950_000,
        6_250_000,
        620_000,
        260_000,
        &[&format!("{slide_number}/{slide_count}")],
        1000,
        theme.muted,
        false,
        false,
        "r",
    ));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>{shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"#,
        theme.background
    )
}

fn slide_title_xml(title: &str, theme: DeckTheme) -> String {
    text_box_xml(
        3,
        "Title",
        760_000,
        470_000,
        10_700_000,
        780_000,
        &[title],
        2800,
        theme.foreground,
        true,
        false,
        "l",
    )
}

fn string_refs(items: &[String]) -> Vec<&str> {
    items.iter().map(String::as_str).collect()
}

fn body_size(items: &[String]) -> i32 {
    let units: usize = items.iter().map(|item| display_units(item)).sum();
    if items.len() >= 7 || units > 700 {
        1700
    } else if items.len() >= 5 || units > 440 {
        1900
    } else {
        2200
    }
}

fn quote_size(quote: &str) -> i32 {
    match quote.chars().count() {
        0..=70 => 3000,
        71..=130 => 2500,
        _ => 2100,
    }
}

#[allow(clippy::too_many_arguments)]
fn text_box_xml(
    id: u32,
    name: &str,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    paragraphs: &[&str],
    font_size: i32,
    color: &str,
    bold: bool,
    bullets: bool,
    align: &str,
) -> String {
    let paragraph_xml = if paragraphs.is_empty() {
        paragraph_xml("", font_size, color, bold, false, align)
    } else {
        paragraphs
            .iter()
            .map(|text| paragraph_xml(text, font_size, color, bold, bullets, align))
            .collect::<String>()
    };
    format!(
        r#"<p:sp><p:nvSpPr><p:cNvPr id="{id}" name="{}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{width}" cy="{height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:normAutofit fontScale="85000" lnSpcReduction="15000"/></a:bodyPr><a:lstStyle/>{paragraph_xml}</p:txBody></p:sp>"#,
        xml_escape(name)
    )
}

fn paragraph_xml(
    text: &str,
    font_size: i32,
    color: &str,
    bold: bool,
    bullet: bool,
    align: &str,
) -> String {
    let bullet_properties = if bullet {
        r#" marL="342900" indent="-228600"><a:buChar char="•"/>"#.to_string()
    } else {
        ">".to_string()
    };
    let bold = if bold { "1" } else { "0" };
    format!(
        r#"<a:p><a:pPr algn="{align}"{bullet_properties}</a:pPr><a:r><a:rPr lang="zh-CN" altLang="en-US" sz="{font_size}" b="{bold}" dirty="0"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:rPr><a:t xml:space="preserve">{}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="{font_size}"/></a:p>"#,
        xml_escape(text)
    )
}

fn accent_bar_xml(id: u32, color: &str) -> String {
    panel_xml(id, 0, 0, 125_000, SLIDE_HEIGHT, color)
}

fn panel_xml(id: u32, x: i64, y: i64, width: i64, height: i64, color: &str) -> String {
    format!(
        r#"<p:sp><p:nvSpPr><p:cNvPr id="{id}" name="Panel {id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{width}" cy="{height}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>"#
    )
}

fn picture_xml(
    id: u32,
    image: &SlideImage,
    box_x: i64,
    box_y: i64,
    box_width: i64,
    box_height: i64,
) -> String {
    let (x, y, width, height) = contain_rect(
        image.width,
        image.height,
        box_x,
        box_y,
        box_width,
        box_height,
    );
    format!(
        r#"<p:pic><p:nvPicPr><p:cNvPr id="{id}" name="Image {}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{width}" cy="{height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr></p:pic>"#,
        image.media_index
    )
}

fn contain_rect(
    image_width: u32,
    image_height: u32,
    box_x: i64,
    box_y: i64,
    box_width: i64,
    box_height: i64,
) -> (i64, i64, i64, i64) {
    let image_ratio = image_width.max(1) as f64 / image_height.max(1) as f64;
    let box_ratio = box_width as f64 / box_height as f64;
    if image_ratio > box_ratio {
        let height = (box_width as f64 / image_ratio).round() as i64;
        (box_x, box_y + (box_height - height) / 2, box_width, height)
    } else {
        let width = (box_height as f64 * image_ratio).round() as i64;
        (box_x + (box_width - width) / 2, box_y, width, box_height)
    }
}

fn slide_rels(image: Option<&SlideImage>) -> String {
    let image_rel = image.map_or_else(String::new, |image| format!(r#"<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image{}.{}"/>"#, image.media_index, image.extension));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>{image_rel}</Relationships>"#
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>"#;
const MASTER_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>"#;
const LAYOUT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>"#;
const SLIDE_LAYOUT: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"#;
const PRES_PROPS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>"#;
const VIEW_PROPS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="1" snapToObjects="1"/></p:slideViewPr><p:gridSpacing cx="78028800" cy="78028800"/></p:viewPr>"#;
const TABLE_STYLES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>"#;

#[cfg(test)]
mod tests {
    use super::*;
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use serde_json::json;
    use std::io::Read;

    fn request(value: serde_json::Value) -> PresentationRequest {
        serde_json::from_value(value).expect("fixture should deserialize")
    }

    #[test]
    fn creates_an_editable_widescreen_pptx_package() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-presentation-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let result = create_presentation(
            request(json!({
                "title": "季度复盘",
                "theme": "business",
                "slides": [
                    {"layout": "title", "title": "季度复盘", "subtitle": "TierNote"},
                    {"layout": "two-column", "title": "结果与下一步", "body": ["收入稳步增长"], "rightBody": ["扩大重点渠道"]}
                ]
            })),
            &root,
        )
        .expect("presentation should be created");
        assert_eq!(result.slide_count, 2);
        assert!(result.path.is_file());

        let file = fs::File::open(&result.path).expect("presentation should open");
        let mut archive = zip::ZipArchive::new(file).expect("presentation should be a ZIP package");
        assert!(archive.by_name("ppt/presentation.xml").is_ok());
        let mut slide = String::new();
        archive
            .by_name("ppt/slides/slide2.xml")
            .expect("second slide should exist")
            .read_to_string(&mut slide)
            .expect("slide XML should be readable");
        assert!(slide.contains("结果与下一步"));
        assert!(slide.contains("收入稳步增长"));
        assert!(slide.contains("a:normAutofit"));
        let names = (0..archive.len())
            .map(|index| {
                archive
                    .by_index(index)
                    .expect("package part should exist")
                    .name()
                    .to_string()
            })
            .filter(|name| name.ends_with(".xml") || name.ends_with(".rels"))
            .collect::<Vec<_>>();
        for name in names {
            let mut xml = String::new();
            archive
                .by_name(&name)
                .expect("XML part should exist")
                .read_to_string(&mut xml)
                .expect("XML part should be UTF-8");
            let mut reader = Reader::from_str(&xml);
            loop {
                match reader.read_event() {
                    Ok(Event::Eof) => break,
                    Ok(_) => {}
                    Err(error) => panic!("{name} is not valid XML: {error}"),
                }
            }
        }
        if let Ok(smoke_output) = std::env::var("TIERNOTE_PRESENTATION_SMOKE_OUTPUT") {
            fs::copy(&result.path, smoke_output).expect("smoke presentation should be copied");
        }
        drop(archive);
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn rejects_output_paths_and_oversized_decks() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-presentation-guard-{}",
            std::process::id()
        ));
        let traversal = create_presentation(
            request(json!({
                "title": "Unsafe",
                "fileName": "../unsafe.pptx",
                "slides": [{"title": "Slide"}]
            })),
            &root,
        );
        assert!(traversal.is_err());
        let slides = (0..=MAX_SLIDES)
            .map(|index| json!({"title": format!("Slide {index}")}))
            .collect::<Vec<_>>();
        let oversized = create_presentation(
            request(json!({"title": "Too many slides", "slides": slides})),
            &root,
        );
        assert!(oversized.is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_text_that_would_overflow_the_selected_layout() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-presentation-density-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let dense_item =
            "这是一段用于验证页面文字密度的中文内容，需要在固定宽度中换成很多行。".repeat(4);
        let result = create_presentation(
            request(json!({
                "title": "密度检查",
                "slides": [{
                    "layout": "two-column",
                    "title": "内容过多",
                    "body": [dense_item.clone(), dense_item.clone(), dense_item.clone()],
                    "rightBody": [dense_item.clone(), dense_item]
                }]
            })),
            &root,
        );
        let error = match result {
            Ok(_) => panic!("dense presentation should be rejected"),
            Err(error) => error,
        };
        assert!(error.contains("will not fit"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn repeated_titles_reserve_distinct_output_files() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-presentation-unique-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let deck = || {
            request(json!({
                "title": "Weekly review",
                "fileName": "weekly-review.pptx",
                "slides": [{"title": "Summary", "body": ["One clear message"]}]
            }))
        };
        let first = create_presentation(deck(), &root).expect("first deck should be created");
        let second = create_presentation(deck(), &root).expect("second deck should be created");
        assert_ne!(first.path, second.path);
        assert!(first.path.is_file());
        assert!(second.path.is_file());
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn embeds_workspace_images_with_slide_relationships() {
        use base64::Engine;

        let root = std::env::temp_dir().join(format!(
            "tiernote-presentation-image-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&root).expect("fixture directory should be created");
        let image = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
            .expect("fixture image should decode");
        fs::write(root.join("figure.png"), image).expect("fixture image should be written");
        let result = create_presentation(
            request(json!({
                "title": "Image deck",
                "slides": [{"title": "Evidence", "body": ["Editable context"], "imagePath": "figure.png"}]
            })),
            &root,
        )
        .expect("presentation with an image should be created");
        let file = fs::File::open(&result.path).expect("presentation should open");
        let mut archive = zip::ZipArchive::new(file).expect("presentation should be a ZIP package");
        assert!(archive.by_name("ppt/media/image1.png").is_ok());
        let mut relationships = String::new();
        archive
            .by_name("ppt/slides/_rels/slide1.xml.rels")
            .expect("slide relationships should exist")
            .read_to_string(&mut relationships)
            .expect("slide relationships should be readable");
        assert!(relationships.contains("relationships/image"));
        drop(archive);
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn image_containment_preserves_aspect_ratio() {
        assert_eq!(contain_rect(1600, 900, 0, 0, 1600, 900), (0, 0, 1600, 900));
        assert_eq!(
            contain_rect(1000, 1000, 0, 0, 1600, 900),
            (350, 0, 900, 900)
        );
    }
}

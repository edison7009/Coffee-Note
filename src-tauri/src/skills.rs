use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const INDEX_FILE: &str = "skills.json";
const INDEX_VERSION: u8 = 3;
const MAX_SKILL_BYTES: u64 = 512 * 1024;
const MAX_SKILL_ICON_BYTES: u64 = 3 * 1024 * 1024;
const FIXED_CATEGORY_IDS: [&str; 4] = ["copywriting", "ppt", "video", "media"];
const BUILTIN_MEDIA_PLUGIN_ID: &str = "coffee-media";
const BUILTIN_MEDIA_SKILL_ID: &str = "coffee-note-media-transcribe";
const BUILTIN_MEDIA_PLUGIN_MANIFEST: &str =
    include_str!("../builtin-plugins/coffee-media/coffee-plugin.json");
const BUILTIN_MEDIA_SKILL_PROMPT: &str =
    include_str!("../builtin-plugins/coffee-media/skills/media-to-text/SKILL.md");
const BUILTIN_PRESENTATION_PLUGIN_ID: &str = "coffee-presentation";
const BUILTIN_PRESENTATION_SKILL_ID: &str = "coffee-note-presentation-create";
const BUILTIN_PRESENTATION_PLUGIN_MANIFEST: &str =
    include_str!("../builtin-plugins/coffee-presentation/coffee-plugin.json");
const BUILTIN_PRESENTATION_SKILL_PROMPT: &str =
    include_str!("../builtin-plugins/coffee-presentation/skills/create-presentation/SKILL.md");
const BUILTIN_PRESENTATION_DECK_SPEC: &str = include_str!(
    "../builtin-plugins/coffee-presentation/skills/create-presentation/references/deck-spec.md"
);

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCategory {
    id: String,
    label: String,
    fixed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDefinition {
    id: String,
    title: String,
    description: String,
    category_id: String,
    codex_compatible: bool,
    source_id: String,
    source_url: String,
    source_version: Option<String>,
    enabled: bool,
    builtin: bool,
    icon_id: Option<String>,
    runtime_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPlugin {
    id: String,
    name: String,
    description: String,
    version: Option<String>,
    category_id: String,
    codex_compatible: bool,
    source_url: String,
    skill_count: usize,
    error: Option<String>,
    enabled: bool,
    builtin: bool,
    icon_id: Option<String>,
    publisher: String,
    origin: String,
    runtime_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalog {
    categories: Vec<SkillCategory>,
    skills: Vec<SkillDefinition>,
    plugins: Vec<SkillPlugin>,
    icons: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceDraft {
    source_url: String,
    category_id: String,
}

fn default_true() -> bool {
    true
}

fn default_builtin_plugins() -> BTreeMap<String, BuiltinPluginState> {
    [BUILTIN_MEDIA_PLUGIN_ID, BUILTIN_PRESENTATION_PLUGIN_ID]
        .into_iter()
        .map(|id| {
            (
                id.to_string(),
                BuiltinPluginState {
                    enabled: true,
                    disabled_skill_ids: BTreeSet::new(),
                },
            )
        })
        .collect()
}

fn builtin_media_manifest() -> BuiltinPluginManifest {
    let manifest: BuiltinPluginManifest = serde_json::from_str(BUILTIN_MEDIA_PLUGIN_MANIFEST)
        .expect("the bundled Coffee Media manifest must be valid JSON");
    debug_assert_eq!(manifest.schema_version, 1);
    debug_assert_eq!(manifest.id, BUILTIN_MEDIA_PLUGIN_ID);
    debug_assert_eq!(manifest.runtime.lifecycle, "application");
    debug_assert!(manifest.runtime.shared);
    debug_assert!(manifest.runtime.prewarm);
    manifest
}

fn builtin_presentation_manifest() -> BuiltinPluginManifest {
    let manifest: BuiltinPluginManifest =
        serde_json::from_str(BUILTIN_PRESENTATION_PLUGIN_MANIFEST)
            .expect("the bundled Coffee Presentation manifest must be valid JSON");
    debug_assert_eq!(manifest.schema_version, 1);
    debug_assert_eq!(manifest.id, BUILTIN_PRESENTATION_PLUGIN_ID);
    debug_assert_eq!(manifest.runtime.lifecycle, "application");
    debug_assert!(manifest.runtime.shared);
    debug_assert!(manifest.runtime.prewarm);
    manifest
}

fn builtin_manifests() -> Vec<BuiltinPluginManifest> {
    vec![builtin_media_manifest(), builtin_presentation_manifest()]
}

fn builtin_skill_prompt(plugin_id: &str, skill_id: &str, path: &str) -> Option<String> {
    match (plugin_id, skill_id, path) {
        (BUILTIN_MEDIA_PLUGIN_ID, BUILTIN_MEDIA_SKILL_ID, "skills/media-to-text/SKILL.md") => {
            Some(BUILTIN_MEDIA_SKILL_PROMPT.to_string())
        }
        (
            BUILTIN_PRESENTATION_PLUGIN_ID,
            BUILTIN_PRESENTATION_SKILL_ID,
            "skills/create-presentation/SKILL.md",
        ) => Some(format!(
            "{BUILTIN_PRESENTATION_SKILL_PROMPT}\n\n<bundled_reference path=\"references/deck-spec.md\">\n{BUILTIN_PRESENTATION_DECK_SPEC}\n</bundled_reference>"
        )),
        _ => None,
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillSourceMeta {
    source_url: String,
    category_id: String,
    #[serde(default)]
    order: u32,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    disabled_skill_ids: BTreeSet<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinPluginState {
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    disabled_skill_ids: BTreeSet<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillIndex {
    version: u8,
    #[serde(default = "default_builtin_plugins")]
    builtin_plugins: BTreeMap<String, BuiltinPluginState>,
    #[serde(default)]
    custom_categories: Vec<SkillCategory>,
    #[serde(default)]
    sources: BTreeMap<String, SkillSourceMeta>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinRuntimeManifest {
    id: String,
    lifecycle: String,
    shared: bool,
    prewarm: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinSkillManifest {
    id: String,
    path: String,
    title: String,
    description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuiltinPluginManifest {
    schema_version: u8,
    id: String,
    name: String,
    description: String,
    version: String,
    publisher: String,
    category_id: String,
    runtime: BuiltinRuntimeManifest,
    skills: Vec<BuiltinSkillManifest>,
}

#[derive(Debug, Default, Deserialize)]
struct SkillFrontmatter {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug)]
struct DiscoveredSkill {
    relative_path: PathBuf,
    name: String,
    title: String,
    description: String,
    icon_key: Option<String>,
}

#[derive(Debug)]
struct DiscoveredPackage {
    name: String,
    description: String,
    version: Option<String>,
    skills: Vec<DiscoveredSkill>,
    icon_key: Option<String>,
    icons: BTreeMap<String, String>,
}

fn skills_sources_root() -> PathBuf {
    crate::app_data_dir().join("skill-sources")
}

fn index_path() -> PathBuf {
    crate::app_data_dir().join(INDEX_FILE)
}

fn fixed_categories() -> Vec<SkillCategory> {
    vec![
        SkillCategory {
            id: "copywriting".into(),
            label: "文案编写".into(),
            fixed: true,
        },
        SkillCategory {
            id: "ppt".into(),
            label: "制作PPT".into(),
            fixed: true,
        },
        SkillCategory {
            id: "video".into(),
            label: "制作视频".into(),
            fixed: true,
        },
        SkillCategory {
            id: "media".into(),
            label: "音视频".into(),
            fixed: true,
        },
    ]
}

fn empty_index() -> SkillIndex {
    SkillIndex {
        version: INDEX_VERSION,
        builtin_plugins: default_builtin_plugins(),
        custom_categories: Vec::new(),
        sources: BTreeMap::new(),
    }
}

fn ensure_store() -> Result<SkillIndex, String> {
    fs::create_dir_all(skills_sources_root())
        .map_err(|error| format!("Could not create the skill source directory: {error}"))?;
    if !index_path().is_file() {
        let index = empty_index();
        save_index(&index)?;
        return Ok(index);
    }
    load_index()
}

fn load_index() -> Result<SkillIndex, String> {
    let contents = fs::read_to_string(index_path())
        .map_err(|error| format!("Could not read the skills index: {error}"))?;
    let value: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse the skills index: {error}"))?;
    let stored_version = value.get("version").and_then(Value::as_u64).unwrap_or(1);
    if stored_version >= 2 {
        let legacy_media_enabled = value
            .get("builtinMediaEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let mut index: SkillIndex = serde_json::from_value(value)
            .map_err(|error| format!("Could not parse the skills index: {error}"))?;
        index.version = INDEX_VERSION;
        let mut changed = stored_version < INDEX_VERSION as u64;
        if stored_version < INDEX_VERSION as u64 {
            index.builtin_plugins.insert(
                BUILTIN_MEDIA_PLUGIN_ID.to_string(),
                BuiltinPluginState {
                    enabled: legacy_media_enabled,
                    disabled_skill_ids: BTreeSet::new(),
                },
            );
        }
        for manifest in builtin_manifests() {
            if let std::collections::btree_map::Entry::Vacant(entry) =
                index.builtin_plugins.entry(manifest.id)
            {
                entry.insert(BuiltinPluginState {
                    enabled: true,
                    disabled_skill_ids: BTreeSet::new(),
                });
                changed = true;
            }
        }
        if changed {
            save_index(&index)?;
        }
        return Ok(index);
    }

    let mut index = empty_index();
    index.custom_categories = value
        .get("customCategories")
        .cloned()
        .and_then(|categories| serde_json::from_value(categories).ok())
        .unwrap_or_default();
    if let Some(skills) = value.get("skills").and_then(Value::as_object) {
        for (id, skill) in skills {
            let Some(source_url) = skill.get("sourceUrl").and_then(Value::as_str) else {
                continue;
            };
            let source_url = source_url.trim();
            if source_url.is_empty() || !is_valid_id(id) {
                continue;
            }
            let category_id = skill
                .get("categoryId")
                .and_then(Value::as_str)
                .unwrap_or("copywriting")
                .to_string();
            let order = skill.get("order").and_then(Value::as_u64).unwrap_or(0) as u32;
            index.sources.insert(
                id.clone(),
                SkillSourceMeta {
                    source_url: source_url.to_string(),
                    category_id,
                    order,
                    enabled: true,
                    disabled_skill_ids: BTreeSet::new(),
                },
            );
        }
    }
    save_index(&index)?;
    Ok(index)
}

fn save_index(index: &SkillIndex) -> Result<(), String> {
    fs::create_dir_all(crate::app_data_dir())
        .map_err(|error| format!("Could not create the app data directory: {error}"))?;
    let contents = serde_json::to_string_pretty(index)
        .map_err(|error| format!("Could not serialize the skills index: {error}"))?;
    fs::write(index_path(), format!("{contents}\n"))
        .map_err(|error| format!("Could not write the skills index: {error}"))
}

fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 120
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !id.starts_with('-')
        && !id.ends_with('-')
}

fn source_dir(id: &str) -> Result<PathBuf, String> {
    if !is_valid_id(id) {
        return Err("Invalid skill source ID".to_string());
    }
    Ok(skills_sources_root().join(id))
}

fn validate_git_url(url: &str) -> Result<(), String> {
    if url.starts_with('-') {
        return Err("Git URL cannot start with '-'".to_string());
    }
    let lower = url.to_ascii_lowercase();
    const ALLOWED_PREFIXES: [&str; 5] = ["https://", "http://", "git://", "ssh://", "git@"];
    if !ALLOWED_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        return Err("Only HTTPS, HTTP, Git, or SSH repository URLs are supported".to_string());
    }
    if url.len() > 2_048 || url.chars().any(char::is_control) {
        return Err("Git repository URL is invalid".to_string());
    }
    Ok(())
}

fn normalize_source_draft(mut draft: SkillSourceDraft) -> Result<SkillSourceDraft, String> {
    draft.source_url = draft.source_url.trim().to_string();
    draft.category_id = draft.category_id.trim().to_string();
    validate_git_url(&draft.source_url)?;
    Ok(draft)
}

fn slug(value: &str, fallback: &str) -> String {
    let normalized = value
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric() {
                Some(character.to_ascii_lowercase())
            } else if matches!(character, '-' | '_' | ' ' | '.') {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if normalized.is_empty() {
        fallback.to_string()
    } else {
        normalized.chars().take(72).collect()
    }
}

fn repo_name_from_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let last = trimmed.rsplit(['/', ':']).next().unwrap_or(trimmed);
    let last = last.strip_suffix(".git").unwrap_or(last);
    slug(last, "skill-source")
}

fn make_unique_source_id(url: &str, index: &SkillIndex) -> String {
    let base = repo_name_from_url(url);
    if !index.sources.contains_key(&base) {
        return base;
    }
    (2..1000)
        .map(|suffix| format!("{base}-{suffix}"))
        .find(|candidate| !index.sources.contains_key(candidate))
        .unwrap_or_else(|| format!("skill-source-{}", &Uuid::new_v4().simple().to_string()[..8]))
}

fn git_output(args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command.args(args);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|error| format!("Git is not available: {error}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            format!("Git command failed: {}", args.join(" "))
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn clone_repository(url: &str, destination: &Path) -> Result<(), String> {
    validate_git_url(url)?;
    if destination.exists() {
        return Err("The skill source cache already exists".to_string());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the Git cache directory: {error}"))?;
    }
    git_output(&[
        "clone",
        "--depth",
        "1",
        "--",
        url,
        &destination.to_string_lossy(),
    ])?;
    Ok(())
}

fn replace_source_cache(id: &str, url: &str) -> Result<DiscoveredPackage, String> {
    let destination = source_dir(id)?;
    let staging = skills_sources_root().join(format!(".staging-{id}-{}", Uuid::new_v4().simple()));
    if let Err(error) = clone_repository(url, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let package = match discover_package(&staging, url, false) {
        Ok(package) => package,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    if !destination.exists() {
        fs::rename(&staging, &destination)
            .map_err(|error| format!("Could not activate the skill source: {error}"))?;
        return Ok(package);
    }

    let backup = skills_sources_root().join(format!(".backup-{id}-{}", Uuid::new_v4().simple()));
    fs::rename(&destination, &backup)
        .map_err(|error| format!("Could not prepare the skill source update: {error}"))?;
    if let Err(error) = fs::rename(&staging, &destination) {
        let _ = fs::rename(&backup, &destination);
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "Could not activate the updated skill source: {error}"
        ));
    }
    let _ = fs::remove_dir_all(backup);
    Ok(package)
}

fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
}

fn json_string(value: &Value, names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        value
            .get(*name)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

fn package_manifest(root: &Path) -> Option<Value> {
    [
        root.join("coffee-plugin.json"),
        root.join("reasonix-plugin.json"),
        root.join(".codex-plugin").join("plugin.json"),
        root.join(".claude-plugin").join("plugin.json"),
        root.join("package.json"),
    ]
    .into_iter()
    .find_map(|path| read_json(&path))
}

fn plugin_manifest(root: &Path) -> Option<Value> {
    read_json(&root.join(".codex-plugin").join("plugin.json"))
}

fn nearest_plugin_manifest(source_root: &Path, skill_directory: &Path) -> Option<(PathBuf, Value)> {
    let mut current = skill_directory;
    loop {
        if let Some(manifest) = plugin_manifest(current) {
            return Some((current.to_path_buf(), manifest));
        }
        if current == source_root {
            return None;
        }
        current = current.parent()?;
        if !current.starts_with(source_root) {
            return None;
        }
    }
}

fn manifest_icon_data_url(plugin_root: &Path, manifest: &Value) -> Option<String> {
    let interface = manifest.get("interface")?;
    ["composerIcon", "logo"].into_iter().find_map(|key| {
        interface
            .get(key)
            .and_then(Value::as_str)
            .and_then(|value| icon_file_data_url(plugin_root, value))
    })
}

fn icon_file_data_url(plugin_root: &Path, icon_value: &str) -> Option<String> {
    let relative = icon_value.trim().trim_start_matches("./");
    let relative_path = Path::new(relative);
    if relative.is_empty()
        || relative_path.is_absolute()
        || relative_path.components().any(|component| {
            !matches!(
                component,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )
        })
    {
        return None;
    }
    let canonical_root = plugin_root.canonicalize().ok()?;
    let icon_path = plugin_root.join(relative_path).canonicalize().ok()?;
    if !icon_path.starts_with(&canonical_root) {
        return None;
    }
    let metadata = fs::metadata(&icon_path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_SKILL_ICON_BYTES {
        return None;
    }
    let mime = match icon_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => return None,
    };
    let bytes = fs::read(icon_path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn plugin_icon_key(source_root: &Path, plugin_root: &Path) -> String {
    let relative = plugin_root
        .strip_prefix(source_root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    if relative.is_empty() {
        "root".to_string()
    } else {
        relative
    }
}

fn cache_plugin_icon(
    source_root: &Path,
    plugin_root: &Path,
    manifest: &Value,
    icons: &mut BTreeMap<String, String>,
) -> Option<String> {
    let key = plugin_icon_key(source_root, plugin_root);
    if icons.contains_key(&key) {
        return Some(key);
    }
    let data_url = manifest_icon_data_url(plugin_root, manifest)?;
    icons.insert(key.clone(), data_url);
    Some(key)
}

fn collect_skill_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(root: &Path, current: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(current)
            .map_err(|error| format!("Could not read the skill source: {error}"))?
        {
            let entry = entry.map_err(|error| format!("Could not read a source entry: {error}"))?;
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Could not inspect a source entry: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if file_type.is_dir() {
                if matches!(name.as_ref(), ".git" | "node_modules" | "target" | "dist") {
                    continue;
                }
                visit(root, &entry.path(), output)?;
            } else if file_type.is_file() && name.eq_ignore_ascii_case("SKILL.md") {
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|_| "A skill path escaped its source directory".to_string())?
                    .to_path_buf();
                output.push(relative);
            }
        }
        Ok(())
    }

    let mut output = Vec::new();
    visit(root, root, &mut output)?;
    output.sort();
    Ok(output)
}

fn parse_skill_file(path: &Path) -> Result<(SkillFrontmatter, String), String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not inspect SKILL.md: {error}"))?;
    if metadata.len() > MAX_SKILL_BYTES {
        return Err("SKILL.md is too large".to_string());
    }
    let raw =
        fs::read_to_string(path).map_err(|error| format!("Could not read SKILL.md: {error}"))?;
    let normalized = raw.replace("\r\n", "\n");
    let remainder = normalized
        .strip_prefix("---\n")
        .ok_or_else(|| "SKILL.md is missing YAML frontmatter".to_string())?;
    let (yaml, body) = remainder
        .split_once("\n---\n")
        .ok_or_else(|| "SKILL.md has invalid YAML frontmatter".to_string())?;
    let frontmatter = serde_yaml::from_str::<SkillFrontmatter>(yaml)
        .map_err(|error| format!("Could not parse SKILL.md frontmatter: {error}"))?;
    if frontmatter.name.trim().is_empty() || frontmatter.description.trim().is_empty() {
        return Err("SKILL.md must declare name and description".to_string());
    }
    if body.trim().is_empty() {
        return Err("SKILL.md has no instructions".to_string());
    }
    Ok((frontmatter, normalized))
}

fn skill_display_name(directory: &Path, fallback: &str) -> String {
    fs::read_to_string(directory.join("agents").join("openai.yaml"))
        .ok()
        .and_then(|contents| serde_yaml::from_str::<Value>(&contents).ok())
        .and_then(|value| {
            value
                .get("interface")
                .and_then(|interface| interface.get("display_name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| fallback.to_string())
}

fn git_version(root: &Path) -> Option<String> {
    git_output(&[
        "-C",
        &root.to_string_lossy(),
        "describe",
        "--tags",
        "--always",
    ])
    .ok()
    .filter(|value| !value.is_empty())
}

fn discover_package(
    root: &Path,
    source_url: &str,
    include_icons: bool,
) -> Result<DiscoveredPackage, String> {
    let manifest = package_manifest(root);
    let mut icons = BTreeMap::new();
    let package_icon_key = include_icons
        .then(|| plugin_manifest(root))
        .flatten()
        .as_ref()
        .and_then(|manifest| cache_plugin_icon(root, root, manifest, &mut icons));
    let skill_paths = collect_skill_files(root)?;
    if skill_paths.is_empty() {
        return Err("The repository does not contain a Codex-compatible SKILL.md".to_string());
    }

    let mut skills = Vec::with_capacity(skill_paths.len());
    for relative_path in skill_paths {
        let full_path = root.join(&relative_path);
        let (frontmatter, _) = parse_skill_file(&full_path).map_err(|error| {
            format!(
                "{}: {error}",
                relative_path.to_string_lossy().replace('\\', "/")
            )
        })?;
        let directory = full_path.parent().unwrap_or(root);
        let name = frontmatter.name.trim().to_string();
        let icon_key = include_icons
            .then(|| nearest_plugin_manifest(root, directory))
            .flatten()
            .and_then(|(plugin_root, manifest)| {
                cache_plugin_icon(root, &plugin_root, &manifest, &mut icons)
            });
        skills.push(DiscoveredSkill {
            relative_path,
            title: skill_display_name(directory, &name),
            name,
            description: frontmatter.description.trim().to_string(),
            icon_key,
        });
    }

    let manifest_name = manifest
        .as_ref()
        .and_then(|value| json_string(value, &["displayName", "display_name", "name"]));
    let manifest_description = manifest
        .as_ref()
        .and_then(|value| json_string(value, &["description"]));
    let manifest_version = manifest
        .as_ref()
        .and_then(|value| json_string(value, &["version"]));
    let fallback_name = if skills.len() == 1 {
        skills[0].title.clone()
    } else {
        repo_name_from_url(source_url)
    };
    let fallback_description = if skills.len() == 1 {
        skills[0].description.clone()
    } else {
        format!("包含 {} 个技能。", skills.len())
    };
    let version = manifest_version.or_else(|| {
        if skills.len() == 1 {
            parse_skill_file(&root.join(&skills[0].relative_path))
                .ok()
                .and_then(|(frontmatter, _)| frontmatter.version)
        } else {
            None
        }
    });

    Ok(DiscoveredPackage {
        name: manifest_name.unwrap_or(fallback_name),
        description: manifest_description.unwrap_or(fallback_description),
        version: version.or_else(|| git_version(root)),
        skills,
        icon_key: package_icon_key,
        icons,
    })
}

fn category_exists(index: &SkillIndex, category_id: &str) -> bool {
    FIXED_CATEGORY_IDS.contains(&category_id)
        || index
            .custom_categories
            .iter()
            .any(|category| category.id == category_id)
}

fn skill_ids(source_id: &str, package: &DiscoveredPackage) -> Vec<String> {
    let mut used = HashSet::new();
    package
        .skills
        .iter()
        .enumerate()
        .map(|(index, skill)| {
            if package.skills.len() == 1 {
                return source_id.to_string();
            }
            let base = format!("{source_id}-{}", slug(&skill.name, "skill"));
            let mut candidate = base.clone();
            let mut suffix = 2;
            while !used.insert(candidate.clone()) {
                candidate = format!("{base}-{suffix}");
                suffix += 1;
            }
            if is_valid_id(&candidate) {
                candidate
            } else {
                format!("{source_id}-skill-{}", index + 1)
            }
        })
        .collect()
}

fn catalog_from_index(index: &SkillIndex) -> SkillCatalog {
    let mut categories = fixed_categories();
    categories.extend(index.custom_categories.clone());
    let mut sources = index.sources.iter().collect::<Vec<_>>();
    sources.sort_by(|left, right| {
        left.1
            .order
            .cmp(&right.1.order)
            .then_with(|| left.0.cmp(right.0))
    });

    let mut icons = BTreeMap::new();
    let mut skills = Vec::new();
    let mut plugins = Vec::new();
    for builtin in builtin_manifests() {
        let builtin_state =
            index
                .builtin_plugins
                .get(&builtin.id)
                .cloned()
                .unwrap_or(BuiltinPluginState {
                    enabled: true,
                    disabled_skill_ids: BTreeSet::new(),
                });
        skills.extend(builtin.skills.iter().map(|skill| SkillDefinition {
            id: skill.id.clone(),
            title: skill.title.clone(),
            description: skill.description.clone(),
            category_id: builtin.category_id.clone(),
            codex_compatible: true,
            source_id: builtin.id.clone(),
            source_url: String::new(),
            source_version: Some(builtin.version.clone()),
            enabled: builtin_state.enabled && !builtin_state.disabled_skill_ids.contains(&skill.id),
            builtin: true,
            icon_id: None,
            runtime_id: Some(builtin.runtime.id.clone()),
        }));
        plugins.push(SkillPlugin {
            id: builtin.id.clone(),
            name: builtin.name,
            description: builtin.description,
            version: Some(builtin.version),
            category_id: builtin.category_id,
            codex_compatible: true,
            source_url: String::new(),
            skill_count: builtin.skills.len(),
            error: None,
            enabled: builtin_state.enabled,
            builtin: true,
            icon_id: None,
            publisher: builtin.publisher,
            origin: "bundled".into(),
            runtime_id: Some(builtin.runtime.id),
        });
    }
    for (source_id, meta) in sources {
        let root = skills_sources_root().join(source_id);
        match discover_package(&root, &meta.source_url, true) {
            Ok(package) => {
                let ids = skill_ids(source_id, &package);
                for (key, data_url) in &package.icons {
                    icons
                        .entry(format!("{source_id}:{key}"))
                        .or_insert_with(|| data_url.clone());
                }
                skills.extend(package.skills.iter().zip(ids).map(|(skill, id)| {
                    let enabled = meta.enabled && !meta.disabled_skill_ids.contains(&id);
                    let icon_id = skill
                        .icon_key
                        .as_ref()
                        .map(|key| format!("{source_id}:{key}"));
                    SkillDefinition {
                        id,
                        title: skill.title.clone(),
                        description: skill.description.clone(),
                        category_id: meta.category_id.clone(),
                        codex_compatible: true,
                        source_id: source_id.clone(),
                        source_url: meta.source_url.clone(),
                        source_version: package.version.clone(),
                        enabled,
                        builtin: false,
                        icon_id,
                        runtime_id: None,
                    }
                }));
                let package_icon_id = package
                    .icon_key
                    .as_ref()
                    .map(|key| format!("{source_id}:{key}"));
                plugins.push(SkillPlugin {
                    id: source_id.clone(),
                    name: package.name,
                    description: package.description,
                    version: package.version,
                    category_id: meta.category_id.clone(),
                    codex_compatible: true,
                    source_url: meta.source_url.clone(),
                    skill_count: package.skills.len(),
                    error: None,
                    enabled: meta.enabled,
                    builtin: false,
                    icon_id: package_icon_id,
                    publisher: "Community".into(),
                    origin: "git".into(),
                    runtime_id: None,
                });
            }
            Err(error) => plugins.push(SkillPlugin {
                id: source_id.clone(),
                name: repo_name_from_url(&meta.source_url),
                description: "无法读取插件元数据。".into(),
                version: None,
                category_id: meta.category_id.clone(),
                codex_compatible: false,
                source_url: meta.source_url.clone(),
                skill_count: 0,
                error: Some(error),
                enabled: meta.enabled,
                builtin: false,
                icon_id: None,
                publisher: "Community".into(),
                origin: "git".into(),
                runtime_id: None,
            }),
        }
    }
    SkillCatalog {
        categories,
        skills,
        plugins,
        icons,
    }
}

#[tauri::command]
pub fn list_skills() -> Result<SkillCatalog, String> {
    ensure_store().map(|index| catalog_from_index(&index))
}

fn next_source_order(index: &SkillIndex) -> u32 {
    index
        .sources
        .values()
        .map(|source| source.order)
        .max()
        .unwrap_or(0)
        + 1
}

fn add_skill_source_blocking(draft: SkillSourceDraft) -> Result<SkillCatalog, String> {
    let draft = normalize_source_draft(draft)?;
    let mut index = ensure_store()?;
    if !category_exists(&index, &draft.category_id) {
        return Err("The selected skill category does not exist".to_string());
    }
    if index
        .sources
        .values()
        .any(|source| source.source_url.eq_ignore_ascii_case(&draft.source_url))
    {
        return Err("This skill source has already been added".to_string());
    }
    let id = make_unique_source_id(&draft.source_url, &index);
    replace_source_cache(&id, &draft.source_url)?;
    index.sources.insert(
        id,
        SkillSourceMeta {
            source_url: draft.source_url,
            category_id: draft.category_id,
            order: next_source_order(&index),
            enabled: true,
            disabled_skill_ids: BTreeSet::new(),
        },
    );
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub async fn add_skill_source(draft: SkillSourceDraft) -> Result<SkillCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || add_skill_source_blocking(draft))
        .await
        .map_err(|error| format!("Skill source task failed: {error}"))?
}

fn update_skill_source_blocking(id: String) -> Result<SkillCatalog, String> {
    let index = ensure_store()?;
    let source = index
        .sources
        .get(&id)
        .ok_or_else(|| "Skill source not found".to_string())?;
    replace_source_cache(&id, &source.source_url)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub async fn update_skill_source(id: String) -> Result<SkillCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || update_skill_source_blocking(id))
        .await
        .map_err(|error| format!("Skill source update task failed: {error}"))?
}

#[tauri::command]
pub fn delete_skill_source(id: String) -> Result<SkillCatalog, String> {
    let mut index = ensure_store()?;
    if index.sources.remove(&id).is_none() {
        return Err("Skill source not found".to_string());
    }
    let directory = source_dir(&id)?;
    if directory.is_dir() {
        fs::remove_dir_all(directory)
            .map_err(|error| format!("Could not delete the skill source cache: {error}"))?;
    }
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn move_skill_source(id: String, category_id: String) -> Result<SkillCatalog, String> {
    let category_id = category_id.trim().to_string();
    let mut index = ensure_store()?;
    if !category_exists(&index, &category_id) {
        return Err("The selected skill category does not exist".to_string());
    }
    let source = index
        .sources
        .get_mut(&id)
        .ok_or_else(|| "Skill source not found".to_string())?;
    source.category_id = category_id;
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn set_skill_source_enabled(id: String, enabled: bool) -> Result<SkillCatalog, String> {
    let mut index = ensure_store()?;
    let source = index
        .sources
        .get_mut(&id)
        .ok_or_else(|| "Skill source not found".to_string())?;
    source.enabled = enabled;
    if enabled {
        source.disabled_skill_ids.clear();
    }
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn set_skill_enabled(
    id: String,
    source_id: String,
    enabled: bool,
) -> Result<SkillCatalog, String> {
    if let Some(plugin) = builtin_manifests()
        .into_iter()
        .find(|plugin| plugin.skills.iter().any(|skill| skill.id == id))
    {
        if source_id != plugin.id {
            return Err("Skill not found in the selected plugin".to_string());
        }
        let mut index = ensure_store()?;
        let state = index
            .builtin_plugins
            .get_mut(&plugin.id)
            .ok_or_else(|| "Built-in plugin state is unavailable".to_string())?;
        if enabled {
            state.disabled_skill_ids.remove(&id);
        } else {
            state.disabled_skill_ids.insert(id);
        }
        save_index(&index)?;
        return Ok(catalog_from_index(&index));
    }

    let mut index = ensure_store()?;
    let source_url = index
        .sources
        .get(&source_id)
        .map(|source| source.source_url.clone())
        .ok_or_else(|| "Skill source not found".to_string())?;
    let root = source_dir(&source_id)?;
    let package = discover_package(&root, &source_url, false)?;
    if !skill_ids(&source_id, &package)
        .iter()
        .any(|skill_id| skill_id == &id)
    {
        return Err("Skill not found in the selected source".to_string());
    }
    let source = index
        .sources
        .get_mut(&source_id)
        .ok_or_else(|| "Skill source not found".to_string())?;
    if enabled {
        source.disabled_skill_ids.remove(&id);
    } else {
        source.disabled_skill_ids.insert(id);
    }
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn set_builtin_plugin_enabled(id: String, enabled: bool) -> Result<SkillCatalog, String> {
    if !builtin_manifests().iter().any(|plugin| plugin.id == id) {
        return Err("Built-in plugin not found".to_string());
    }
    let mut index = ensure_store()?;
    let state = index
        .builtin_plugins
        .get_mut(&id)
        .ok_or_else(|| "Built-in plugin state is unavailable".to_string())?;
    state.enabled = enabled;
    if enabled {
        state.disabled_skill_ids.clear();
    }
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn set_builtin_skill_enabled(enabled: bool) -> Result<SkillCatalog, String> {
    set_builtin_plugin_enabled(BUILTIN_MEDIA_PLUGIN_ID.to_string(), enabled)
}

pub(crate) fn builtin_tool_enabled(tool_name: &str) -> Result<bool, String> {
    let (plugin_id, skill_id) = match tool_name {
        "transcribe_media" => (BUILTIN_MEDIA_PLUGIN_ID, BUILTIN_MEDIA_SKILL_ID),
        "create_presentation" => (
            BUILTIN_PRESENTATION_PLUGIN_ID,
            BUILTIN_PRESENTATION_SKILL_ID,
        ),
        _ => return Ok(true),
    };
    let index = ensure_store()?;
    Ok(index
        .builtin_plugins
        .get(plugin_id)
        .is_some_and(|state| state.enabled && !state.disabled_skill_ids.contains(skill_id)))
}

fn normalize_category_label(label: String) -> Result<String, String> {
    let label = label.trim().to_string();
    if label.is_empty() || label.chars().count() > 24 {
        return Err("Category name must contain 1 to 24 characters".to_string());
    }
    Ok(label)
}

#[tauri::command]
pub fn create_skill_category(label: String) -> Result<SkillCatalog, String> {
    let label = normalize_category_label(label)?;
    let mut index = ensure_store()?;
    if fixed_categories()
        .into_iter()
        .chain(index.custom_categories.iter().cloned())
        .any(|category| category.label.eq_ignore_ascii_case(&label))
    {
        return Err("A skill category with this name already exists".to_string());
    }
    index.custom_categories.push(SkillCategory {
        id: format!("custom-{}", &Uuid::new_v4().simple().to_string()[..8]),
        label,
        fixed: false,
    });
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn rename_skill_category(id: String, label: String) -> Result<SkillCatalog, String> {
    let label = normalize_category_label(label)?;
    let mut index = ensure_store()?;
    if fixed_categories()
        .into_iter()
        .chain(
            index
                .custom_categories
                .iter()
                .filter(|category| category.id != id)
                .cloned(),
        )
        .any(|category| category.label.eq_ignore_ascii_case(&label))
    {
        return Err("A skill category with this name already exists".to_string());
    }
    let category = index
        .custom_categories
        .iter_mut()
        .find(|category| category.id == id)
        .ok_or_else(|| "Only custom categories can be renamed".to_string())?;
    category.label = label;
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

#[tauri::command]
pub fn delete_skill_category(id: String) -> Result<SkillCatalog, String> {
    let mut index = ensure_store()?;
    if index
        .sources
        .values()
        .any(|source| source.category_id == id)
    {
        return Err("Move or delete the skill sources in this category first".to_string());
    }
    let original_len = index.custom_categories.len();
    index.custom_categories.retain(|category| category.id != id);
    if original_len == index.custom_categories.len() {
        return Err("Only custom categories can be deleted".to_string());
    }
    save_index(&index)?;
    Ok(catalog_from_index(&index))
}

pub fn load_skill_prompt(id: &str) -> Result<String, String> {
    if let Some(manifest) = builtin_manifests()
        .into_iter()
        .find(|plugin| plugin.skills.iter().any(|skill| skill.id == id))
    {
        let index = ensure_store()?;
        let state = index
            .builtin_plugins
            .get(&manifest.id)
            .ok_or_else(|| "The built-in plugin is unavailable".to_string())?;
        if !state.enabled || state.disabled_skill_ids.contains(id) {
            return Err("The built-in skill is disabled".to_string());
        }
        let skill = manifest
            .skills
            .iter()
            .find(|skill| skill.id == id)
            .ok_or_else(|| "The bundled skill manifest is invalid".to_string())?;
        return builtin_skill_prompt(&manifest.id, id, &skill.path)
            .ok_or_else(|| "The bundled skill path is invalid".to_string());
    }
    let index = ensure_store()?;
    for (source_id, meta) in &index.sources {
        if !meta.enabled {
            continue;
        }
        let root = source_dir(source_id)?;
        let Ok(package) = discover_package(&root, &meta.source_url, false) else {
            continue;
        };
        let ids = skill_ids(source_id, &package);
        if meta.disabled_skill_ids.contains(id) {
            return Err("The selected skill is disabled".to_string());
        }
        if let Some(skill) = package
            .skills
            .iter()
            .zip(ids)
            .find_map(|(skill, skill_id)| (skill_id == id).then_some(skill))
        {
            let (_, prompt) = parse_skill_file(&root.join(&skill.relative_path))?;
            return Ok(prompt);
        }
    }
    Err("The selected skill does not exist".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_reject_paths_and_uppercase() {
        assert!(is_valid_id("clear-copy"));
        assert!(!is_valid_id("../skill"));
        assert!(!is_valid_id("ClearCopy"));
        assert!(!is_valid_id("skill/name"));
    }

    #[test]
    fn fixed_categories_are_exactly_the_product_categories() {
        let ids = fixed_categories()
            .into_iter()
            .map(|category| category.id)
            .collect::<HashSet<_>>();
        assert_eq!(
            ids,
            HashSet::from([
                "copywriting".into(),
                "ppt".into(),
                "video".into(),
                "media".into(),
            ])
        );
    }

    #[test]
    fn media_skill_never_saves_a_placeholder_after_transcription_failure() {
        assert!(BUILTIN_MEDIA_SKILL_PROMPT.contains("Stop without writing a file"));
        assert!(BUILTIN_MEDIA_SKILL_PROMPT.contains("without `path`"));
        assert!(BUILTIN_MEDIA_SKILL_PROMPT.contains("Never install a downloader"));
    }

    #[test]
    fn bundled_media_plugin_declares_a_shared_prewarmed_runtime() {
        let plugin = builtin_media_manifest();
        assert_eq!(plugin.id, BUILTIN_MEDIA_PLUGIN_ID);
        assert_eq!(plugin.skills[0].id, BUILTIN_MEDIA_SKILL_ID);
        assert_eq!(plugin.runtime.id, "media-transcription");
        assert_eq!(plugin.runtime.lifecycle, "application");
        assert!(plugin.runtime.shared);
        assert!(plugin.runtime.prewarm);
    }

    #[test]
    fn bundled_presentation_plugin_uses_the_native_shared_runtime() {
        let plugin = builtin_presentation_manifest();
        assert_eq!(plugin.id, BUILTIN_PRESENTATION_PLUGIN_ID);
        assert_eq!(plugin.skills[0].id, BUILTIN_PRESENTATION_SKILL_ID);
        assert_eq!(plugin.runtime.id, "presentation-engine");
        assert_eq!(plugin.runtime.lifecycle, "application");
        assert!(plugin.runtime.shared);
        assert!(plugin.runtime.prewarm);
        assert!(BUILTIN_PRESENTATION_SKILL_PROMPT.contains("create_presentation"));
        assert!(BUILTIN_PRESENTATION_SKILL_PROMPT.contains("Never install a package"));
        let prompt = builtin_skill_prompt(
            BUILTIN_PRESENTATION_PLUGIN_ID,
            BUILTIN_PRESENTATION_SKILL_ID,
            "skills/create-presentation/SKILL.md",
        )
        .expect("bundled presentation prompt should load");
        assert!(prompt.contains("<bundled_reference"));
        assert!(prompt.contains("Presentation specification"));
    }

    #[test]
    fn git_sources_accept_remote_urls_and_reject_paths_or_options() {
        assert!(validate_git_url("https://github.com/openai/skills.git").is_ok());
        assert!(validate_git_url("git@github.com:openai/skills.git").is_ok());
        assert!(validate_git_url("C:\\skills").is_err());
        assert!(validate_git_url("../skills").is_err());
        assert!(validate_git_url("--upload-pack=malicious").is_err());
    }

    #[test]
    fn repository_names_are_safe_source_ids() {
        assert_eq!(
            repo_name_from_url("https://github.com/openai/skill-creator.git"),
            "skill-creator"
        );
        assert_eq!(
            repo_name_from_url("git@github.com:owner/My_Skill.git"),
            "my-skill"
        );
    }

    #[test]
    fn skill_file_metadata_is_read_only_source_data() {
        let root = std::env::temp_dir().join(format!("coffee-note-skill-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("fixture directory should be created");
        fs::write(
            root.join("SKILL.md"),
            "---\nname: research-brief\ndescription: Use primary sources.\nversion: 1.2.0\n---\n\nDo the research.\n",
        )
        .expect("fixture skill should be written");
        let package = discover_package(&root, "https://example.com/research.git", false)
            .expect("source metadata should parse");
        assert_eq!(package.name, "research-brief");
        assert_eq!(package.description, "Use primary sources.");
        assert_eq!(package.version.as_deref(), Some("1.2.0"));
        assert_eq!(package.skills.len(), 1);
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn repositories_can_contain_hundreds_of_skills() {
        let root =
            std::env::temp_dir().join(format!("coffee-note-large-skill-test-{}", Uuid::new_v4()));
        for index in 0..200 {
            let directory = root.join(format!("skill-{index}"));
            fs::create_dir_all(&directory).expect("fixture directory should be created");
            fs::write(
                directory.join("SKILL.md"),
                format!(
                    "---\nname: skill-{index}\ndescription: Skill number {index}.\n---\n\nDo skill {index}.\n"
                ),
            )
            .expect("fixture skill should be written");
        }
        let package = discover_package(&root, "https://example.com/large-market.git", false)
            .expect("large skill markets should not be truncated");
        assert_eq!(package.skills.len(), 200);
        fs::remove_dir_all(root).expect("fixture should be removed");
    }

    #[test]
    fn official_large_skill_files_fit_within_the_supported_budget() {
        assert!(std::hint::black_box(MAX_SKILL_BYTES) >= 146_014);
        assert!(std::hint::black_box(MAX_SKILL_ICON_BYTES) >= 2_034_876);
    }

    #[test]
    fn nested_codex_plugins_supply_icons_to_their_skills() {
        let root =
            std::env::temp_dir().join(format!("coffee-note-skill-icon-test-{}", Uuid::new_v4()));
        let plugin_root = root.join("plugins").join("shopify");
        let skill_root = plugin_root.join("skills").join("shopify-hydrogen");
        let second_skill_root = plugin_root.join("skills").join("shopify-theme-check");
        fs::create_dir_all(plugin_root.join(".codex-plugin"))
            .expect("plugin manifest directory should be created");
        fs::create_dir_all(plugin_root.join("assets"))
            .expect("plugin asset directory should be created");
        fs::create_dir_all(&skill_root).expect("skill directory should be created");
        fs::create_dir_all(&second_skill_root).expect("second skill directory should be created");
        fs::write(
            plugin_root.join(".codex-plugin").join("plugin.json"),
            r#"{"name":"shopify","interface":{"composerIcon":"./assets/missing.svg","logo":"./assets/logo.svg"}}"#,
        )
        .expect("plugin manifest should be written");
        fs::write(
            plugin_root.join("assets").join("logo.svg"),
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>"#,
        )
        .expect("plugin icon should be written");
        fs::write(
            skill_root.join("SKILL.md"),
            "---\nname: shopify-hydrogen\ndescription: Build storefronts.\n---\n\nBuild a storefront.\n",
        )
        .expect("skill should be written");
        fs::write(
            second_skill_root.join("SKILL.md"),
            "---\nname: shopify-theme-check\ndescription: Review storefront themes.\n---\n\nReview a storefront theme.\n",
        )
        .expect("second skill should be written");

        let package = discover_package(&root, "https://github.com/openai/plugins", true)
            .expect("nested plugin should be discovered");
        assert_eq!(package.skills.len(), 2);
        assert_eq!(package.icons.len(), 1);
        let icon_key = package.skills[0]
            .icon_key
            .as_deref()
            .expect("nested skill should reference its plugin icon");
        assert_eq!(package.skills[1].icon_key.as_deref(), Some(icon_key));
        assert!(package
            .icons
            .get(icon_key)
            .map(String::as_str)
            .is_some_and(|icon| icon.starts_with("data:image/svg+xml;base64,")));
        fs::remove_dir_all(root).expect("fixture should be removed");
    }
}

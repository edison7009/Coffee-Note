use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const VALID_KINDS: &[&str] = &[
    "goal",
    "preference",
    "constraint",
    "profile",
    "correction",
    "health_context",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySuggestion {
    pub id: String,
    pub kind: String,
    pub content: String,
    pub source_conversation_id: String,
    #[serde(default = "default_locale")]
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub content: String,
    pub source_conversation_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub source_type: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default = "default_memory_status")]
    pub status: String,
    #[serde(default)]
    pub content_hash: String,
}

fn default_locale() -> String {
    "zh".to_string()
}

fn default_memory_status() -> String {
    "confirmed".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStore {
    pub version: u32,
    pub items: Vec<MemoryItem>,
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self {
            version: 1,
            items: Vec::new(),
        }
    }
}

fn memory_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TierNote")
        .join("memory")
}

fn memory_file() -> PathBuf {
    memory_dir().join("memory.json")
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn replace_file(temp: &Path, path: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(format!("Cannot inspect {}: {error}", path.display()));
        }
    };
    if metadata.is_none() {
        return fs::rename(temp, path)
            .map_err(|error| format!("Cannot save {}: {error}", path.display()));
    }
    if !metadata.is_some_and(|metadata| metadata.is_file()) {
        return Err(format!(
            "Refusing to replace non-file path {}",
            path.display()
        ));
    }
    let extension = path
        .extension()
        .map(|value| format!("{}.bak", value.to_string_lossy()))
        .unwrap_or_else(|| "bak".to_string());
    let backup = path.with_extension(extension);
    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|error| format!("Cannot clear stale backup {}: {error}", backup.display()))?;
    }
    fs::rename(path, &backup)
        .map_err(|error| format!("Cannot back up {}: {error}", path.display()))?;
    match fs::rename(temp, path) {
        Ok(()) => {
            let _ = fs::remove_file(backup);
            Ok(())
        }
        Err(error) => {
            let restore = fs::rename(&backup, path);
            match restore {
                Ok(()) => Err(format!("Cannot replace {}: {error}", path.display())),
                Err(restore_error) => Err(format!(
                    "Cannot replace {}: {error}; backup remains at {} because restore failed: {restore_error}",
                    path.display(),
                    backup.display()
                )),
            }
        }
    }
}

#[derive(Serialize)]
struct MemoryIndexStore<'a> {
    version: u32,
    items: Vec<MemoryIndexItem<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryIndexItem<'a> {
    id: &'a str,
    kind: &'a str,
    source_conversation_id: &'a str,
    created_at: i64,
    updated_at: i64,
    source_type: &'a str,
    source_path: &'a str,
    status: &'a str,
    content_hash: &'a str,
}

fn write_json_atomic_to(path: &Path, store: &MemoryStore) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Memory index has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Cannot create memory dir: {error}"))?;
    let temp = path.with_extension("json.tmp");
    let index = MemoryIndexStore {
        version: 2,
        items: store
            .items
            .iter()
            .map(|item| MemoryIndexItem {
                id: &item.id,
                kind: &item.kind,
                source_conversation_id: &item.source_conversation_id,
                created_at: item.created_at,
                updated_at: item.updated_at,
                source_type: &item.source_type,
                source_path: &item.source_path,
                status: &item.status,
                content_hash: &item.content_hash,
            })
            .collect(),
    };
    let json = serde_json::to_string_pretty(&index)
        .map_err(|error| format!("Cannot serialize memory: {error}"))?;
    fs::write(&temp, json).map_err(|error| format!("Cannot write {}: {error}", temp.display()))?;
    replace_file(&temp, path)
}

fn load_store_from(path: &Path) -> MemoryStore {
    fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str::<MemoryStore>(&json).ok())
        .unwrap_or_default()
}

fn validate_memory(kind: &str, content: &str) -> Result<(), String> {
    if !VALID_KINDS.contains(&kind) {
        return Err(format!("Invalid memory kind: {kind}"));
    }
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("Memory content is required".to_string());
    }
    if trimmed.chars().count() > 240 {
        return Err("Memory content must be 240 characters or fewer".to_string());
    }
    Ok(())
}

fn normalize_content(content: &str) -> String {
    content.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn content_hash(kind: &str, content: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in kind.bytes().chain([0]).chain(content.bytes()) {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn target_path(kind: &str, locale: &str) -> &'static str {
    let english = locale == "en";
    match (kind, english) {
        ("goal", false) => "plans/exercise.md",
        ("goal", true) => "plans/exercise.en.md",
        ("preference" | "profile", false) => "plans/supplements.md",
        ("preference" | "profile", true) => "plans/supplements.en.md",
        ("constraint" | "correction", false) => "plans/lessons.md",
        ("constraint" | "correction", true) => "plans/lessons.en.md",
        ("health_context", false) => "plans/daily-routine.md",
        ("health_context", true) => "plans/daily-routine.en.md",
        (_, false) => "plans/experience.md",
        (_, true) => "plans/experience.en.md",
    }
}

fn visible_memory_paths(locale: &str) -> [&'static str; 4] {
    if locale == "en" {
        [
            "plans/exercise.en.md",
            "plans/supplements.en.md",
            "plans/lessons.en.md",
            "plans/daily-routine.en.md",
        ]
    } else {
        [
            "plans/exercise.md",
            "plans/supplements.md",
            "plans/lessons.md",
            "plans/daily-routine.md",
        ]
    }
}

fn parse_visible_memory_line(line: &str) -> Option<(&str, String, String)> {
    let line = line.trim();
    let rest = line.strip_prefix("- [")?;
    let kind_end = rest.find("] ")?;
    let kind = &rest[..kind_end];
    if !VALID_KINDS.contains(&kind) {
        return None;
    }
    let content_start = kind_end + 2;
    let content = rest[content_start..]
        .split("<!-- tiernote-memory:")
        .next()?
        .trim();
    let id = rest
        .split_once("<!-- tiernote-memory:")?
        .1
        .strip_suffix("-->")?
        .trim()
        .to_string();
    if content.is_empty() || id.is_empty() {
        return None;
    }
    Some((kind, normalize_content(content), id))
}

fn read_visible_memories(root: &Path, locale: &str) -> Vec<(String, String, String, String)> {
    let mut memories = Vec::new();
    for relative in visible_memory_paths(locale) {
        let path = root.join(relative);
        let Ok(markdown) = fs::read_to_string(&path) else {
            continue;
        };
        for line in markdown.lines() {
            if let Some((kind, content, id)) = parse_visible_memory_line(line) {
                memories.push((kind.to_string(), content, id, relative.to_string()));
            }
        }
    }
    memories
}

/// Return the small set of personal facts that should apply even when a
/// question does not repeat their exact wording. The larger personal context
/// remains question-aware and is built by the Library Graph router.
pub fn build_always_on_context(root: &Path, locale: &str, max_bytes: usize) -> String {
    build_always_on_context_filtered(root, locale, max_bytes, None)
}

pub fn build_always_on_context_filtered(
    root: &Path,
    locale: &str,
    max_bytes: usize,
    allowed_paths: Option<&[String]>,
) -> String {
    let mut output = String::new();
    for (kind, content, _, path) in read_visible_memories(root, locale) {
        if allowed_paths.is_some_and(|allowed| !allowed.iter().any(|item| item == &path)) {
            continue;
        }
        if !matches!(kind.as_str(), "preference" | "constraint" | "correction") {
            continue;
        }
        let line = format!("\n- [{kind}] {content} ({path})");
        if output.len() + line.len() > max_bytes {
            break;
        }
        output.push_str(&line);
    }
    if output.is_empty() {
        return String::new();
    }
    if locale == "en" {
        format!("\n\n## ALWAYS-ON PERSONAL PREFERENCES\n{output}")
    } else {
        format!("\n\n## 始终适用的个人偏好与边界\n{output}")
    }
}

fn append_to_my_info(root: &Path, item: &MemoryItem, locale: &str) -> Result<String, String> {
    let relative = target_path(&item.kind, locale);
    let path = root.join(relative);
    let parent = path
        .parent()
        .ok_or_else(|| "Memory note has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Cannot create personal-info directory: {error}"))?;
    let mut markdown = match fs::read_to_string(&path) {
        Ok(markdown) => markdown,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if locale == "en" {
                "# My information\n".to_string()
            } else {
                "# 我的资料\n".to_string()
            }
        }
        Err(error) => {
            return Err(format!(
                "Cannot read personal memory page {}: {error}",
                path.display()
            ))
        }
    };
    let marker = format!("<!-- tiernote-memory:{} -->", item.id);
    if markdown.contains(&marker) {
        return Ok(relative.to_string());
    }
    let section_marker = "<!-- tiernote-memory-section:v1 -->";
    if !markdown.contains(section_marker) {
        let heading = if locale == "en" {
            "Confirmed memory"
        } else {
            "已确认记忆"
        };
        markdown.push_str(&format!("\n\n## {heading}\n\n{section_marker}\n"));
    }
    markdown.push_str(&format!("\n- [{}] {} {marker}\n", item.kind, item.content));
    let temp = path.with_extension("md.tmp");
    fs::write(&temp, markdown).map_err(|error| format!("Cannot write personal memory: {error}"))?;
    replace_file(&temp, &path)?;
    Ok(relative.to_string())
}

fn confirm_at(
    suggestion: MemorySuggestion,
    my_info_root: &Path,
    index_path: &Path,
) -> Result<MemoryItem, String> {
    validate_memory(&suggestion.kind, &suggestion.content)?;
    let mut store = load_store_from(index_path);
    let normalized = normalize_content(&suggestion.content);
    if let Some((_, _, visible_id, visible_path)) =
        read_visible_memories(my_info_root, &suggestion.locale)
            .into_iter()
            .find(|(kind, content, _, _)| {
                kind == &suggestion.kind && content.eq_ignore_ascii_case(&normalized)
            })
    {
        if let Some(position) = store.items.iter().position(|item| item.id == visible_id) {
            let mut item = store.items[position].clone();
            item.content = normalized.clone();
            item.content_hash = content_hash(&item.kind, &normalized);
            item.source_type = "my_info".to_string();
            item.source_path = visible_path;
            item.status = "confirmed".to_string();
            item.updated_at = now_ms();
            store.items[position] = item.clone();
            write_json_atomic_to(index_path, &store)?;
            return Ok(item);
        }
        let timestamp = now_ms();
        let kind = suggestion.kind.clone();
        let item = MemoryItem {
            id: visible_id,
            kind: kind.clone(),
            content: normalized.clone(),
            content_hash: content_hash(&kind, &normalized),
            source_conversation_id: suggestion.source_conversation_id,
            created_at: timestamp,
            updated_at: timestamp,
            source_type: "my_info".to_string(),
            source_path: visible_path,
            status: "confirmed".to_string(),
        };
        store.items.push(item.clone());
        write_json_atomic_to(index_path, &store)?;
        return Ok(item);
    }
    if let Some(existing) = store.items.iter().find(|item| {
        item.status != "superseded"
            && item.kind == suggestion.kind
            && (item.source_path.is_empty()
                || item.source_path == target_path(&suggestion.kind, &suggestion.locale))
            && item.content.trim().eq_ignore_ascii_case(&normalized)
    }) {
        return Ok(existing.clone());
    }

    let timestamp = now_ms();
    let kind = suggestion.kind;
    let mut item = MemoryItem {
        id: if suggestion.id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            suggestion.id
        },
        kind: kind.clone(),
        content_hash: content_hash(&kind, &normalized),
        content: normalized,
        source_conversation_id: suggestion.source_conversation_id,
        created_at: timestamp,
        updated_at: timestamp,
        source_type: "my_info".to_string(),
        source_path: String::new(),
        status: "confirmed".to_string(),
    };
    item.source_path = append_to_my_info(my_info_root, &item, &suggestion.locale)?;
    store.items.push(item.clone());
    write_json_atomic_to(index_path, &store)?;
    Ok(item)
}

#[tauri::command]
pub fn confirm_memory_suggestion(suggestion: MemorySuggestion) -> Result<MemoryItem, String> {
    confirm_at(suggestion, &crate::my_info_root(), &memory_file())
}

/// Move pre-router memory records into the user's visible Markdown source.
/// Legacy records are kept in the index as metadata and remain readable if a
/// migration cannot complete.
pub fn migrate_legacy_store(my_info_root: &Path) -> Result<(), String> {
    let path = memory_file();
    let mut store = load_store_from(&path);
    let mut changed = false;
    for item in &mut store.items {
        if item.status.is_empty() {
            item.status = "confirmed".to_string();
        }
        if item.source_type.is_empty() || item.source_path.is_empty() {
            if item.content.trim().is_empty() {
                continue;
            }
            item.source_type = "my_info".to_string();
            item.content = normalize_content(&item.content);
            if item.content_hash.is_empty() {
                item.content_hash = content_hash(&item.kind, &item.content);
            }
            item.source_path = append_to_my_info(my_info_root, item, "zh")?;
            changed = true;
        }
    }
    if changed {
        write_json_atomic_to(&path, &store)?;
    }
    Ok(())
}

pub fn parse_memory_suggestions(
    args: &str,
    conversation_id: &str,
    locale: &str,
) -> Vec<MemorySuggestion> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(args) else {
        return Vec::new();
    };
    let values = value
        .get("items")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_else(|| vec![value]);

    values
        .into_iter()
        .filter_map(|item| {
            let kind = item.get("kind")?.as_str()?.trim().to_string();
            let content = item.get("content")?.as_str()?.trim().to_string();
            if validate_memory(&kind, &content).is_err() {
                return None;
            }
            Some(MemorySuggestion {
                id: uuid::Uuid::new_v4().to_string(),
                kind,
                content,
                source_conversation_id: conversation_id.to_string(),
                locale: locale.to_string(),
            })
        })
        .take(3)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_memory() {
        assert!(validate_memory("goal", "Improve sleep").is_ok());
        assert!(validate_memory("unknown", "Improve sleep").is_err());
        assert!(validate_memory("goal", "").is_err());
    }

    #[test]
    fn parses_array_suggestions() {
        let parsed = parse_memory_suggestions(
            r#"{"items":[{"kind":"goal","content":"Improve sleep"},{"kind":"preference","content":"Prefers concise answers"}]}"#,
            "abc",
            "en",
        );
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].source_conversation_id, "abc");
        assert_eq!(parsed[0].locale, "en");
    }

    #[test]
    fn confirmed_memory_is_written_to_visible_personal_markdown() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-memory-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let index = root.join("memory.json");
        std::fs::create_dir_all(root.join("plans")).expect("test root should exist");
        std::fs::write(root.join("plans/exercise.md"), "# 运动计划\n")
            .expect("test plan should exist");
        let suggestion = MemorySuggestion {
            id: "memory-1".to_string(),
            kind: "goal".to_string(),
            content: "每周走路三次".to_string(),
            source_conversation_id: "conversation-1".to_string(),
            locale: "zh".to_string(),
        };
        let item = confirm_at(suggestion.clone(), &root, &index).expect("memory should save");
        assert_eq!(item.source_type, "my_info");
        assert_eq!(item.source_path, "plans/exercise.md");
        let markdown = std::fs::read_to_string(root.join("plans/exercise.md"))
            .expect("plan should be readable");
        assert!(markdown.contains("每周走路三次"));
        assert!(markdown.contains("tiernote-memory:memory-1"));
        let index_json = std::fs::read_to_string(&index).expect("index should be readable");
        assert!(!index_json.contains("每周走路三次"));
        let duplicate = confirm_at(suggestion, &root, &index).expect("duplicate should dedupe");
        assert_eq!(duplicate.id, "memory-1");
        std::fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn visible_markdown_prevents_duplicate_when_index_is_missing() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-memory-dedupe-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let index = root.join("memory.json");
        std::fs::create_dir_all(root.join("plans")).expect("test root should exist");
        std::fs::write(
            root.join("plans/lessons.md"),
            "# 我的教训\n\n## 已确认记忆\n\n<!-- tiernote-memory-section:v1 -->\n\n- [constraint] 不使用含糖饮料 <!-- tiernote-memory:existing -->\n",
        )
        .expect("plan should be readable");
        let suggestion = MemorySuggestion {
            id: "new-id".to_string(),
            kind: "constraint".to_string(),
            content: "不使用含糖饮料".to_string(),
            source_conversation_id: "conversation-1".to_string(),
            locale: "zh".to_string(),
        };
        let item = confirm_at(suggestion, &root, &index).expect("memory should dedupe");
        assert_eq!(item.id, "existing");
        let markdown = std::fs::read_to_string(root.join("plans/lessons.md")).unwrap();
        assert_eq!(markdown.matches("不使用含糖饮料").count(), 1);
        std::fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn always_on_context_keeps_preferences_without_question_term_overlap() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-memory-routing-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(root.join("plans")).expect("test root should exist");
        std::fs::write(
            root.join("plans/supplements.md"),
            "# 我的资料\n\n## 已确认记忆\n\n<!-- tiernote-memory-section:v1 -->\n\n- [preference] 请始终使用简洁回答 <!-- tiernote-memory:p -->\n",
        )
        .expect("plan should be readable");
        let context = build_always_on_context(&root, "zh", 2_000);
        assert!(context.contains("请始终使用简洁回答"));
        std::fs::remove_dir_all(root).expect("test root should be removed");
    }

    #[test]
    fn filtered_always_on_context_excludes_disabled_sources() {
        let root = std::env::temp_dir().join(format!(
            "tiernote-memory-filter-test-{}-{}",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(root.join("plans")).expect("plans directory should exist");
        std::fs::write(
            root.join("plans/supplements.md"),
            "# 我的简历\n\n- [preference] 简历偏好 <!-- tiernote-memory:resume -->\n",
        )
        .expect("resume fixture should be written");
        std::fs::write(
            root.join("plans/lessons.md"),
            "# 我的教训\n\n- [constraint] 教训边界 <!-- tiernote-memory:lesson -->\n",
        )
        .expect("lesson fixture should be written");

        let context = build_always_on_context_filtered(
            &root,
            "zh",
            2_000,
            Some(&["plans/lessons.md".to_string()]),
        );

        assert!(!context.contains("简历偏好"));
        assert!(context.contains("教训边界"));
        std::fs::remove_dir_all(root).expect("test root should be removed");
    }
}

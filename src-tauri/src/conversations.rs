use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use crate::llm_stream::{ContentBlock, Message, MessageContent};

const INDEX_FILE: &str = "index.json";
const LEGACY_IMPORT_FLAG: &str = ".legacy-session-imported";
static CONVERSATION_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: usize,
    pub estimated_context_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub custom_title: bool,
    #[serde(default)]
    pub ui_messages: Vec<Value>,
    #[serde(default)]
    pub llm_messages: Vec<Message>,
    /// Exact provider-visible transcript, including request-scoped context that
    /// must remain byte-stable for prefix caching. The regular LLM transcript
    /// stays clean for UI recovery and local conversation inspection.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub provider_messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationClientRecord {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub ui_messages: Vec<Value>,
}

impl From<ConversationRecord> for ConversationClientRecord {
    fn from(record: ConversationRecord) -> Self {
        Self {
            id: record.id,
            title: record.title,
            created_at: record.created_at,
            updated_at: record.updated_at,
            ui_messages: record.ui_messages,
        }
    }
}

fn conversation_write_lock() -> Result<MutexGuard<'static, ()>, String> {
    CONVERSATION_WRITE_LOCK
        .lock()
        .map_err(|_| "Conversation storage lock is poisoned".to_string())
}

fn app_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TierNote")
}

fn conversations_dir() -> PathBuf {
    app_data_dir().join("conversations")
}

fn index_path() -> PathBuf {
    conversations_dir().join(INDEX_FILE)
}

fn legacy_session_file() -> PathBuf {
    app_data_dir().join("sessions").join("session.json")
}

fn legacy_import_flag() -> PathBuf {
    conversations_dir().join(LEGACY_IMPORT_FLAG)
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn is_valid_conversation_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn conversation_path(id: &str) -> Result<PathBuf, String> {
    if !is_valid_conversation_id(id) {
        return Err("Invalid conversation id".to_string());
    }
    Ok(conversations_dir().join(format!("{id}.json")))
}

fn write_json_atomic<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create {}: {error}", parent.display()))?;
    }
    let temp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Cannot serialize JSON: {error}"))?;
    fs::write(&temp, json).map_err(|error| format!("Cannot write {}: {error}", temp.display()))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Cannot replace {}: {error}", path.display()))?;
    }
    fs::rename(&temp, &path).map_err(|error| {
        format!(
            "Cannot move {} to {}: {error}",
            temp.display(),
            path.display()
        )
    })
}

fn read_index() -> Vec<ConversationSummary> {
    let path = index_path();
    fs::read_to_string(path)
        .ok()
        .and_then(|json| serde_json::from_str::<Vec<ConversationSummary>>(&json).ok())
        .unwrap_or_default()
}

fn write_index(
    mut summaries: Vec<ConversationSummary>,
) -> Result<Vec<ConversationSummary>, String> {
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    write_json_atomic(index_path(), &summaries)?;
    Ok(summaries)
}

fn summary_for(record: &ConversationRecord, estimated_context_bytes: usize) -> ConversationSummary {
    ConversationSummary {
        id: record.id.clone(),
        title: record.title.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
        message_count: record.ui_messages.len().max(record.llm_messages.len()),
        estimated_context_bytes,
    }
}

fn upsert_summary(summary: ConversationSummary) -> Result<Vec<ConversationSummary>, String> {
    let mut summaries = read_index()
        .into_iter()
        .filter(|candidate| candidate.id != summary.id)
        .collect::<Vec<_>>();
    summaries.push(summary);
    write_index(summaries)
}

fn title_from_ui_messages(ui_messages: &[Value], fallback: &str) -> String {
    ui_messages
        .iter()
        .find_map(|message| {
            let role = message.get("role")?.as_str()?;
            if role != "user" {
                return None;
            }
            let content = message.get("content")?.as_str()?.trim();
            if content.is_empty() {
                return None;
            }
            Some(truncate_title(content))
        })
        .unwrap_or_else(|| fallback.to_string())
}

fn truncate_title(content: &str) -> String {
    const TITLE_MAX_CHARS: usize = 20;
    let mut title = content.lines().next().unwrap_or(content).trim().to_string();
    if title.chars().count() > TITLE_MAX_CHARS {
        title = title.chars().take(TITLE_MAX_CHARS).collect::<String>();
        title.push('…');
    }
    title
}

fn update_automatic_title(record: &mut ConversationRecord, title: Option<&str>) {
    if record.custom_title {
        return;
    }
    record.title = title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(truncate_title)
        .unwrap_or_else(|| title_from_ui_messages(&record.ui_messages, &record.title));
}

fn read_record(id: &str) -> Result<ConversationRecord, String> {
    let path = conversation_path(id)?;
    let json = fs::read_to_string(&path)
        .map_err(|error| format!("Cannot read {}: {error}", path.display()))?;
    serde_json::from_str(&json).map_err(|error| format!("Cannot parse {}: {error}", path.display()))
}

fn write_record(record: &ConversationRecord) -> Result<(), String> {
    write_json_atomic(conversation_path(&record.id)?, record)
}

fn message_to_ui(message: &Message) -> Option<Value> {
    match (&message.role[..], &message.content) {
        ("user" | "assistant", MessageContent::Text(content)) => Some(serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "role": message.role,
            "content": content,
            "createdAt": now_ms()
        })),
        ("assistant", MessageContent::Blocks(blocks)) => {
            let text = blocks
                .iter()
                .filter_map(|block| match block {
                    ContentBlock::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("");
            if text.trim().is_empty() {
                None
            } else {
                Some(serde_json::json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "role": "assistant",
                    "content": text,
                    "createdAt": now_ms()
                }))
            }
        }
        _ => None,
    }
}

fn migrate_legacy_session_if_needed() -> Result<(), String> {
    fs::create_dir_all(conversations_dir())
        .map_err(|error| format!("Cannot create conversations dir: {error}"))?;
    let _write_guard = conversation_write_lock()?;
    if legacy_import_flag().exists() || !read_index().is_empty() {
        return Ok(());
    }
    let legacy_path = legacy_session_file();
    if !legacy_path.exists() {
        return Ok(());
    }
    let json = fs::read_to_string(&legacy_path).map_err(|error| {
        format!(
            "Cannot read legacy session {}: {error}",
            legacy_path.display()
        )
    })?;
    let llm_messages = serde_json::from_str::<Vec<Message>>(&json).unwrap_or_default();
    if llm_messages.is_empty() {
        fs::write(legacy_import_flag(), b"empty")
            .map_err(|error| format!("Cannot mark legacy import: {error}"))?;
        return Ok(());
    }

    let timestamp = now_ms();
    let ui_messages = llm_messages
        .iter()
        .filter_map(message_to_ui)
        .collect::<Vec<_>>();
    let record = ConversationRecord {
        id: format!("legacy-{}", uuid::Uuid::new_v4()),
        title: title_from_ui_messages(&ui_messages, "Imported conversation"),
        created_at: timestamp,
        updated_at: timestamp,
        custom_title: false,
        ui_messages,
        llm_messages,
        provider_messages: Vec::new(),
    };
    write_record(&record)?;
    upsert_summary(summary_for(&record, 0))?;
    fs::write(legacy_import_flag(), b"imported")
        .map_err(|error| format!("Cannot mark legacy import: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_conversations() -> Result<Vec<ConversationSummary>, String> {
    migrate_legacy_session_if_needed()?;
    let _write_guard = conversation_write_lock()?;
    write_index(read_index())
}

#[tauri::command]
pub fn create_conversation(title: Option<String>) -> Result<ConversationSummary, String> {
    migrate_legacy_session_if_needed()?;
    let _write_guard = conversation_write_lock()?;
    let timestamp = now_ms();
    let record = ConversationRecord {
        id: uuid::Uuid::new_v4().to_string(),
        title: title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(truncate_title)
            .unwrap_or_else(|| "New conversation".to_string()),
        created_at: timestamp,
        updated_at: timestamp,
        custom_title: false,
        ui_messages: Vec::new(),
        llm_messages: Vec::new(),
        provider_messages: Vec::new(),
    };
    write_record(&record)?;
    let summary = summary_for(&record, 0);
    upsert_summary(summary.clone())?;
    Ok(summary)
}

#[tauri::command]
pub fn load_conversation(id: String) -> Result<ConversationClientRecord, String> {
    migrate_legacy_session_if_needed()?;
    read_record(&id).map(ConversationClientRecord::from)
}

#[tauri::command]
pub fn rename_conversation(id: String, title: String) -> Result<String, String> {
    migrate_legacy_session_if_needed()?;
    let _write_guard = conversation_write_lock()?;
    let clean_title = title.trim();
    if clean_title.is_empty() {
        return Err("Conversation title cannot be empty".to_string());
    }

    let mut record = read_record(&id)?;
    record.title = truncate_title(clean_title);
    record.custom_title = true;
    write_record(&record)?;

    let estimated_context_bytes = read_index()
        .into_iter()
        .find(|summary| summary.id == id)
        .map(|summary| summary.estimated_context_bytes)
        .unwrap_or_default();
    upsert_summary(summary_for(&record, estimated_context_bytes))?;
    Ok(record.title)
}

#[tauri::command]
pub fn conversation_file_path(id: String) -> Result<String, String> {
    let path = conversation_path(&id)?;
    if !path.is_file() {
        return Err("Conversation file does not exist".to_string());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn save_conversation_ui(
    id: String,
    ui_messages: Vec<Value>,
    title: Option<String>,
    estimated_context_bytes: Option<usize>,
) -> Result<ConversationSummary, String> {
    migrate_legacy_session_if_needed()?;
    let _write_guard = conversation_write_lock()?;
    let mut record = read_record(&id).or_else(|_| {
        let timestamp = now_ms();
        Ok::<ConversationRecord, String>(ConversationRecord {
            id: id.clone(),
            title: "New conversation".to_string(),
            created_at: timestamp,
            updated_at: timestamp,
            custom_title: false,
            ui_messages: Vec::new(),
            llm_messages: Vec::new(),
            provider_messages: Vec::new(),
        })
    })?;
    record.ui_messages = ui_messages;
    record.updated_at = now_ms();
    update_automatic_title(&mut record, title.as_deref());
    write_record(&record)?;
    let summary = summary_for(&record, estimated_context_bytes.unwrap_or_default());
    upsert_summary(summary.clone())?;
    Ok(summary)
}

#[tauri::command]
pub fn delete_conversation(id: String) -> Result<Vec<ConversationSummary>, String> {
    let _write_guard = conversation_write_lock()?;
    let path = conversation_path(&id)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Cannot delete {}: {error}", path.display()))?;
    }
    let summaries = read_index()
        .into_iter()
        .filter(|candidate| candidate.id != id)
        .collect::<Vec<_>>();
    write_index(summaries)
}

pub fn load_agent_messages(id: &str) -> (Vec<Message>, Vec<Message>) {
    let Ok(record) = read_record(id) else {
        return (Vec::new(), Vec::new());
    };
    let raw_messages = record.llm_messages;
    let provider_messages = if record.provider_messages.is_empty() {
        raw_messages.clone()
    } else {
        record.provider_messages
    };
    (raw_messages, provider_messages)
}

pub fn save_agent_messages(
    id: &str,
    llm_messages: &[Message],
    provider_messages: &[Message],
) -> Result<(), String> {
    let _write_guard = conversation_write_lock()?;
    let mut record = read_record(id).or_else(|_| {
        let timestamp = now_ms();
        Ok::<ConversationRecord, String>(ConversationRecord {
            id: id.to_string(),
            title: "New conversation".to_string(),
            created_at: timestamp,
            updated_at: timestamp,
            custom_title: false,
            ui_messages: Vec::new(),
            llm_messages: Vec::new(),
            provider_messages: Vec::new(),
        })
    })?;
    record.llm_messages = llm_messages.to_vec();
    record.provider_messages = provider_messages.to_vec();
    record.updated_at = now_ms();
    write_record(&record)?;
    let estimated = read_index()
        .into_iter()
        .find(|summary| summary.id == id)
        .map(|summary| summary.estimated_context_bytes)
        .unwrap_or_default();
    upsert_summary(summary_for(&record, estimated))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_ids() {
        assert!(!is_valid_conversation_id("../secret"));
        assert!(!is_valid_conversation_id("nested/file"));
        assert!(is_valid_conversation_id("abc-123_def"));
    }

    #[test]
    fn title_is_truncated_on_character_boundary() {
        assert_eq!(
            truncate_title("这是一个很长很长很长很长很长很长很长很长的标题"),
            "这是一个很长很长很长很长很长很长很长很长…"
        );
    }

    #[test]
    fn automatic_title_does_not_replace_custom_title() {
        let mut record = ConversationRecord {
            id: "test-id".to_string(),
            title: "Manual title".to_string(),
            created_at: 0,
            updated_at: 0,
            custom_title: true,
            ui_messages: Vec::new(),
            llm_messages: Vec::new(),
            provider_messages: Vec::new(),
        };

        update_automatic_title(&mut record, Some("First user message"));

        assert_eq!(record.title, "Manual title");
    }
}

//! Local messaging channels for Coffee Note.
//!
//! The Weixin transport follows Tencent's MIT-licensed `openclaw-weixin`
//! implementation and public iLink HTTP/JSON protocol. Linked private chats are
//! alternate entry points into Coffee Note's regular local conversation agent.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

const WEIXIN_BASE_URL: &str = "https://ilinkai.weixin.qq.com";
const TELEGRAM_BASE_URL: &str = "https://api.telegram.org";
const CHANNEL_CONFIG_FILE: &str = "messages.json";
const CHANNEL_JOBS_FILE: &str = "message-jobs.json";
const CHANNEL_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub account_id: String,
    #[serde(default)]
    pub token: String,
    #[serde(default = "default_weixin_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub allowed_user_id: String,
    #[serde(default)]
    pub sync_buf: String,
    #[serde(default)]
    pub conversation_id: String,
}

fn default_weixin_base_url() -> String {
    WEIXIN_BASE_URL.to_string()
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub bot_name: String,
    #[serde(default)]
    pub allowed_user_id: String,
    #[serde(default)]
    pub pairing_code: String,
    #[serde(default)]
    pub update_offset: i64,
    #[serde(default)]
    pub conversation_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSettings {
    #[serde(default)]
    pub knowledge_root: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default = "default_transcription_mode")]
    pub transcription_mode: String,
    #[serde(default)]
    pub weixin: WeixinSettings,
    #[serde(default)]
    pub telegram: TelegramSettings,
}

fn default_locale() -> String {
    "zh".to_string()
}

fn default_transcription_mode() -> String {
    "api".to_string()
}

impl Default for MessageSettings {
    fn default() -> Self {
        Self {
            knowledge_root: String::new(),
            locale: default_locale(),
            transcription_mode: default_transcription_mode(),
            weixin: WeixinSettings {
                base_url: default_weixin_base_url(),
                ..WeixinSettings::default()
            },
            telegram: TelegramSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatus {
    pub weixin: String,
    pub telegram: String,
    pub weixin_error: String,
    pub telegram_error: String,
    pub active_jobs: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginStart {
    pub session_id: String,
    pub qr_code_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeixinLoginPoll {
    pub status: String,
    pub connected: bool,
    pub needs_verify_code: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
struct ActiveWeixinLogin {
    session_id: String,
    qrcode: String,
    api_base_url: String,
    started_at_ms: u64,
}

#[derive(Default)]
struct RuntimeStatus {
    weixin: String,
    telegram: String,
    weixin_error: String,
    telegram_error: String,
    active_jobs: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingChannelJob {
    id: String,
    channel: String,
    input: String,
    recipient: String,
    #[serde(default)]
    context_token: String,
    #[serde(default)]
    conversation_id: String,
    #[serde(default)]
    agent_start_index: Option<usize>,
    created_at_ms: u64,
    #[serde(default)]
    final_reply: String,
    #[serde(default)]
    note_saved: bool,
}

static JOBS_FILE_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
static SETTINGS_FILE_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();

pub struct ChannelRuntime {
    weixin_cancel: Mutex<Option<CancellationToken>>,
    telegram_cancel: Mutex<Option<CancellationToken>>,
    login: Mutex<Option<ActiveWeixinLogin>>,
    status: Mutex<RuntimeStatus>,
    jobs: Arc<Semaphore>,
}

impl Default for ChannelRuntime {
    fn default() -> Self {
        Self {
            weixin_cancel: Mutex::new(None),
            telegram_cancel: Mutex::new(None),
            login: Mutex::new(None),
            status: Mutex::new(RuntimeStatus::default()),
            jobs: Arc::new(Semaphore::new(1)),
        }
    }
}

fn config_path() -> PathBuf {
    super::app_data_dir().join(CHANNEL_CONFIG_FILE)
}

fn jobs_path() -> PathBuf {
    super::app_data_dir().join(CHANNEL_JOBS_FILE)
}

fn read_jobs() -> Result<Vec<PendingChannelJob>, String> {
    let _guard = JOBS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Message job storage is unavailable".to_string())?;
    let path = jobs_path();
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Could not read pending message jobs: {error}"))?;
    serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse pending message jobs: {error}"))
}

fn mutate_jobs<T>(change: impl FnOnce(&mut Vec<PendingChannelJob>) -> T) -> Result<T, String> {
    let _guard = JOBS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Message job storage is unavailable".to_string())?;
    let path = jobs_path();
    let mut jobs = if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read pending message jobs: {error}"))?;
        serde_json::from_str(&raw)
            .map_err(|error| format!("Could not parse pending message jobs: {error}"))?
    } else {
        Vec::new()
    };
    let output = change(&mut jobs);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create message job directory: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(&jobs)
        .map_err(|error| format!("Could not serialize pending message jobs: {error}"))?;
    fs::write(path, format!("{raw}\n"))
        .map_err(|error| format!("Could not write pending message jobs: {error}"))?;
    Ok(output)
}

fn enqueue_job(job: PendingChannelJob) -> Result<bool, String> {
    mutate_jobs(|jobs| {
        if jobs.iter().any(|candidate| candidate.id == job.id) {
            false
        } else {
            jobs.push(job);
            true
        }
    })
}

fn remove_job(id: &str) -> Result<(), String> {
    mutate_jobs(|jobs| jobs.retain(|job| job.id != id))
}

fn save_job_result(id: &str, final_reply: String, note_saved: bool) -> Result<(), String> {
    mutate_jobs(|jobs| {
        if let Some(job) = jobs.iter_mut().find(|job| job.id == id) {
            job.final_reply = final_reply;
            job.note_saved = note_saved;
        }
    })
}

fn save_job_conversation(id: &str, conversation_id: String) -> Result<(), String> {
    mutate_jobs(|jobs| {
        if let Some(job) = jobs.iter_mut().find(|job| job.id == id) {
            job.conversation_id = conversation_id;
        }
    })
}

fn save_job_agent_start(id: &str, start_index: usize) -> Result<(), String> {
    mutate_jobs(|jobs| {
        if let Some(job) = jobs.iter_mut().find(|job| job.id == id) {
            job.agent_start_index = Some(start_index);
        }
    })
}

fn pending_job(id: &str) -> Result<Option<PendingChannelJob>, String> {
    Ok(read_jobs()?.into_iter().find(|job| job.id == id))
}

fn load_settings_from(path: &Path) -> Result<MessageSettings, String> {
    if !path.is_file() {
        return Ok(MessageSettings::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Could not read message settings: {error}"))?;
    serde_json::from_str(&raw).map_err(|error| format!("Could not parse message settings: {error}"))
}

fn load_settings() -> Result<MessageSettings, String> {
    let _guard = SETTINGS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Message settings storage is unavailable".to_string())?;
    load_settings_from(&config_path())
}

fn save_settings_to(path: &Path, settings: &MessageSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create message settings directory: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Could not serialize message settings: {error}"))?;
    fs::write(path, format!("{raw}\n"))
        .map_err(|error| format!("Could not write message settings: {error}"))
}

fn mutate_settings<T>(change: impl FnOnce(&mut MessageSettings) -> T) -> Result<T, String> {
    let _guard = SETTINGS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Message settings storage is unavailable".to_string())?;
    let path = config_path();
    let mut settings = load_settings_from(&path)?;
    let output = change(&mut settings);
    save_settings_to(&path, &settings)?;
    Ok(output)
}

fn settings_for_webview(mut settings: MessageSettings) -> MessageSettings {
    settings.weixin.token.clear();
    settings.weixin.allowed_user_id.clear();
    settings.weixin.sync_buf.clear();
    settings.telegram.bot_token.clear();
    settings.telegram.allowed_user_id.clear();
    settings
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn pairing_code() -> String {
    let raw = uuid::Uuid::new_v4().as_u128();
    format!("{:06}", raw % 1_000_000)
}

fn emit_status(app: &AppHandle) {
    let _ = app.emit("message-channel-status", ());
}

fn set_status(app: &AppHandle, channel: &str, state: &str, error: &str) {
    let runtime = app.state::<ChannelRuntime>();
    if let Ok(mut status) = runtime.status.lock() {
        match channel {
            "weixin" => {
                status.weixin = state.to_string();
                status.weixin_error = error.to_string();
            }
            "telegram" => {
                status.telegram = state.to_string();
                status.telegram_error = error.to_string();
            }
            _ => {}
        }
    }
    emit_status(app);
}

#[tauri::command]
pub fn load_message_settings() -> Result<MessageSettings, String> {
    load_settings().map(settings_for_webview)
}

#[tauri::command]
pub fn message_channel_status(runtime: State<'_, ChannelRuntime>) -> ChannelStatus {
    let settings = load_settings().unwrap_or_default();
    let status = runtime.status.lock().ok();
    let runtime_weixin = status
        .as_ref()
        .map(|value| value.weixin.as_str())
        .unwrap_or("");
    let runtime_telegram = status
        .as_ref()
        .map(|value| value.telegram.as_str())
        .unwrap_or("");
    ChannelStatus {
        weixin: if runtime_weixin.is_empty() {
            if settings.weixin.enabled {
                "connected"
            } else {
                "disconnected"
            }
        } else {
            runtime_weixin
        }
        .to_string(),
        telegram: if runtime_telegram.is_empty() {
            if !settings.telegram.enabled {
                "disconnected"
            } else if settings.telegram.allowed_user_id.is_empty() {
                "waiting_pairing"
            } else {
                "connected"
            }
        } else {
            runtime_telegram
        }
        .to_string(),
        weixin_error: status
            .as_ref()
            .map(|value| value.weixin_error.clone())
            .unwrap_or_default(),
        telegram_error: status
            .as_ref()
            .map(|value| value.telegram_error.clone())
            .unwrap_or_default(),
        active_jobs: status
            .as_ref()
            .map(|value| value.active_jobs)
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub fn update_message_context(knowledge_root: String, locale: String) -> Result<(), String> {
    let root = PathBuf::from(knowledge_root.trim());
    if !root.is_dir() {
        return Err("Choose a valid knowledge directory first".to_string());
    }
    let normalized_root = root.to_string_lossy().to_string();
    let normalized_locale = if locale == "en" { "en" } else { "zh" }.to_string();
    mutate_settings(|settings| {
        settings.knowledge_root = normalized_root;
        settings.locale = normalized_locale;
    })
}

#[tauri::command]
pub fn update_message_transcription_mode(transcription_mode: String) -> Result<(), String> {
    let normalized_mode = match transcription_mode.as_str() {
        "api" => "api",
        "local" => "local",
        _ => return Err("Choose a valid speech recognition mode".to_string()),
    };
    mutate_settings(|settings| settings.transcription_mode = normalized_mode.to_string())
}

fn client_version() -> u32 {
    let mut parts = CHANNEL_VERSION
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());
    ((parts.next().unwrap_or(0) & 0xff) << 16)
        | ((parts.next().unwrap_or(0) & 0xff) << 8)
        | (parts.next().unwrap_or(0) & 0xff)
}

fn weixin_uin() -> String {
    let bytes = uuid::Uuid::new_v4().as_u128().to_be_bytes();
    let value = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    base64::engine::general_purpose::STANDARD.encode(value.to_string())
}

fn weixin_headers(token: Option<&str>) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "AuthorizationType",
        HeaderValue::from_static("ilink_bot_token"),
    );
    headers.insert("iLink-App-Id", HeaderValue::from_static("bot"));
    headers.insert(
        "iLink-App-ClientVersion",
        HeaderValue::from_str(&client_version().to_string())
            .unwrap_or(HeaderValue::from_static("7")),
    );
    if let Ok(value) = HeaderValue::from_str(&weixin_uin()) {
        headers.insert("X-WECHAT-UIN", value);
    }
    if let Some(token) = token.filter(|value| !value.trim().is_empty()) {
        if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", token.trim())) {
            headers.insert(AUTHORIZATION, value);
        }
    }
    headers
}

fn weixin_base_info() -> Value {
    json!({
        "channel_version": CHANNEL_VERSION,
        "bot_agent": format!("CoffeeNote/{CHANNEL_VERSION}")
    })
}

async fn weixin_post(
    base_url: &str,
    endpoint: &str,
    token: Option<&str>,
    body: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let url = format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        endpoint.trim_start_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .headers(weixin_headers(token))
        .timeout(timeout)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Weixin request failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Could not read Weixin response: {error}"))?;
    if !status.is_success() {
        return Err(format!("Weixin returned HTTP {status}"));
    }
    serde_json::from_str(&text).map_err(|error| format!("Could not parse Weixin response: {error}"))
}

#[tauri::command]
pub async fn start_weixin_login(
    app: AppHandle,
    runtime: State<'_, ChannelRuntime>,
) -> Result<WeixinLoginStart, String> {
    let response = weixin_post(
        WEIXIN_BASE_URL,
        "ilink/bot/get_bot_qrcode?bot_type=3",
        None,
        json!({ "local_token_list": [] }),
        Duration::from_secs(20),
    )
    .await?;
    let qrcode = response
        .get("qrcode")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let qr_code_url = response
        .get("qrcode_img_content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if qrcode.is_empty() || qr_code_url.is_empty() {
        return Err("Weixin did not return a usable QR code".to_string());
    }
    let session_id = uuid::Uuid::new_v4().to_string();
    let login = ActiveWeixinLogin {
        session_id: session_id.clone(),
        qrcode: qrcode.to_string(),
        api_base_url: WEIXIN_BASE_URL.to_string(),
        started_at_ms: unix_ms(),
    };
    *runtime
        .login
        .lock()
        .map_err(|_| "Weixin login state is unavailable")? = Some(login);
    set_status(&app, "weixin", "waiting_scan", "");
    Ok(WeixinLoginStart {
        session_id,
        qr_code_url: qr_code_url.to_string(),
    })
}

#[tauri::command]
pub async fn poll_weixin_login(
    app: AppHandle,
    runtime: State<'_, ChannelRuntime>,
    session_id: String,
    verify_code: Option<String>,
) -> Result<WeixinLoginPoll, String> {
    let login = runtime
        .login
        .lock()
        .map_err(|_| "Weixin login state is unavailable")?
        .clone()
        .filter(|login| login.session_id == session_id)
        .ok_or_else(|| "The Weixin login session has expired".to_string())?;
    if unix_ms().saturating_sub(login.started_at_ms) > 10 * 60_000 {
        *runtime
            .login
            .lock()
            .map_err(|_| "Weixin login state is unavailable")? = None;
        return Ok(WeixinLoginPoll {
            status: "expired".to_string(),
            connected: false,
            needs_verify_code: false,
            message: "二维码已过期，请重新连接。".to_string(),
        });
    }
    let mut url = reqwest::Url::parse(&format!(
        "{}/ilink/bot/get_qrcode_status",
        login.api_base_url.trim_end_matches('/')
    ))
    .map_err(|_| "The Weixin login endpoint is invalid".to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("qrcode", &login.qrcode);
        if let Some(code) = verify_code
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            query.append_pair("verify_code", code);
        }
    }
    let response = reqwest::Client::new()
        .get(url)
        .headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                "iLink-App-Id",
                reqwest::header::HeaderValue::from_static("bot"),
            );
            headers.insert(
                "iLink-App-ClientVersion",
                reqwest::header::HeaderValue::from_str(&client_version().to_string()).unwrap(),
            );
            headers
        })
        .timeout(Duration::from_secs(40))
        .send()
        .await
        .map_err(|error| format!("Could not check Weixin login: {error}"))?;
    let response: Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse Weixin login: {error}"))?;
    let status = response
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("wait");
    if status == "scaned_but_redirect" {
        if let Some(host) = response.get("redirect_host").and_then(Value::as_str) {
            if let Ok(mut active) = runtime.login.lock() {
                if let Some(active) = active.as_mut() {
                    active.api_base_url = format!("https://{host}");
                }
            }
        }
    }
    if status == "confirmed" {
        let token = response
            .get("bot_token")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let account_id = response
            .get("ilink_bot_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let user_id = response
            .get("ilink_user_id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if token.is_empty() || account_id.is_empty() || user_id.is_empty() {
            return Err("Weixin login completed without account credentials".to_string());
        }
        let returned_base_url = response
            .get("baseurl")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(&login.api_base_url);
        let parsed_base_url = reqwest::Url::parse(returned_base_url)
            .map_err(|_| "Weixin returned an invalid service endpoint".to_string())?;
        if parsed_base_url.scheme() != "https" {
            return Err("Weixin returned an unsafe service endpoint".to_string());
        }
        mutate_settings(|settings| {
            if settings.weixin.allowed_user_id != user_id {
                settings.weixin.conversation_id.clear();
            }
            settings.weixin.enabled = true;
            settings.weixin.token = token.to_string();
            settings.weixin.account_id = account_id.to_string();
            settings.weixin.allowed_user_id = user_id.to_string();
            settings.weixin.base_url = returned_base_url.to_string();
            settings.weixin.sync_buf.clear();
        })?;
        *runtime
            .login
            .lock()
            .map_err(|_| "Weixin login state is unavailable")? = None;
        restart_weixin(&app)?;
        resume_pending_jobs(&app);
        return Ok(WeixinLoginPoll {
            status: "connected".to_string(),
            connected: true,
            needs_verify_code: false,
            message: "微信已连接。".to_string(),
        });
    }
    let (needs_verify_code, message) = match status {
        "scaned" => (false, "已扫码，请在手机微信确认。"),
        "need_verifycode" => (true, "请输入手机微信显示的数字。"),
        "verify_code_blocked" => (true, "验证次数过多，请稍后重新连接。"),
        "expired" => (false, "二维码已过期，请重新连接。"),
        "binded_redirect" => (false, "此微信已连接过，请先断开后重试。"),
        _ => (false, "等待微信扫码。"),
    };
    Ok(WeixinLoginPoll {
        status: status.to_string(),
        connected: false,
        needs_verify_code,
        message: message.to_string(),
    })
}

#[tauri::command]
pub fn disconnect_weixin(app: AppHandle) -> Result<(), String> {
    if let Ok(mut token) = app.state::<ChannelRuntime>().weixin_cancel.lock() {
        if let Some(token) = token.take() {
            token.cancel();
        }
    }
    mutate_settings(|settings| {
        settings.weixin = WeixinSettings {
            base_url: default_weixin_base_url(),
            ..WeixinSettings::default()
        };
    })?;
    set_status(&app, "weixin", "disconnected", "");
    Ok(())
}

#[tauri::command]
pub async fn connect_telegram(
    app: AppHandle,
    bot_token: String,
) -> Result<MessageSettings, String> {
    let token = bot_token.trim();
    if token.is_empty() {
        return Err("Enter a Telegram bot token".to_string());
    }
    let response = telegram_request(token, "getMe", json!({})).await?;
    if !response.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Err("Telegram rejected this bot token".to_string());
    }
    let bot_name = response
        .pointer("/result/username")
        .and_then(Value::as_str)
        .unwrap_or("Coffee Note bot");
    let settings = mutate_settings(|settings| {
        settings.telegram.enabled = true;
        settings.telegram.bot_token = token.to_string();
        settings.telegram.bot_name = bot_name.to_string();
        settings.telegram.allowed_user_id.clear();
        settings.telegram.pairing_code = pairing_code();
        settings.telegram.update_offset = 0;
        settings.telegram.conversation_id.clear();
        settings.clone()
    })?;
    restart_telegram(&app)?;
    resume_pending_jobs(&app);
    Ok(settings_for_webview(settings))
}

#[tauri::command]
pub fn disconnect_telegram(app: AppHandle) -> Result<(), String> {
    if let Ok(mut token) = app.state::<ChannelRuntime>().telegram_cancel.lock() {
        if let Some(token) = token.take() {
            token.cancel();
        }
    }
    mutate_settings(|settings| settings.telegram = TelegramSettings::default())?;
    set_status(&app, "telegram", "disconnected", "");
    Ok(())
}

async fn telegram_request(token: &str, method: &str, body: Value) -> Result<Value, String> {
    let url = format!("{TELEGRAM_BASE_URL}/bot{token}/{method}");
    let response = reqwest::Client::new()
        .post(url)
        .timeout(Duration::from_secs(40))
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Telegram request failed: {}", error.without_url()))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse Telegram response: {error}"))?;
    if !status.is_success() {
        return Err(format!("Telegram returned HTTP {status}"));
    }
    if value.get("ok").and_then(Value::as_bool) == Some(false) {
        let description = value
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("Telegram rejected the request");
        return Err(description.to_string());
    }
    Ok(value)
}

async fn telegram_send(token: &str, chat_id: &str, text: &str) -> Result<(), String> {
    for part in split_message(text, 3900) {
        let response = telegram_request(
            token,
            "sendMessage",
            json!({
                "chat_id": chat_id,
                "text": part,
                "disable_web_page_preview": true
            }),
        )
        .await?;
        if !response.get("ok").and_then(Value::as_bool).unwrap_or(false) {
            return Err("Telegram could not deliver the reply".to_string());
        }
    }
    Ok(())
}

async fn weixin_send(
    settings: &WeixinSettings,
    to: &str,
    context_token: &str,
    text: &str,
) -> Result<(), String> {
    for part in split_message(text, 3900) {
        let response = weixin_post(
            &settings.base_url,
            "ilink/bot/sendmessage",
            Some(&settings.token),
            json!({
                "msg": {
                    "from_user_id": "",
                    "to_user_id": to,
                    "client_id": format!("coffee-note:{}", uuid::Uuid::new_v4()),
                    "message_type": 2,
                    "message_state": 2,
                    "item_list": [{ "type": 1, "text_item": { "text": part } }],
                    "context_token": context_token
                },
                "base_info": weixin_base_info()
            }),
            Duration::from_secs(20),
        )
        .await?;
        if response.get("ret").and_then(Value::as_i64).unwrap_or(0) != 0 {
            return Err("Weixin could not deliver the reply".to_string());
        }
    }
    Ok(())
}

fn split_message(text: &str, max_chars: usize) -> Vec<String> {
    let mut output = Vec::new();
    let mut current = String::new();
    for paragraph in text.split_inclusive('\n') {
        if current.chars().count() + paragraph.chars().count() > max_chars && !current.is_empty() {
            output.push(current.trim_end().to_string());
            current.clear();
        }
        if paragraph.chars().count() > max_chars {
            for character in paragraph.chars() {
                current.push(character);
                if current.chars().count() >= max_chars {
                    output.push(std::mem::take(&mut current));
                }
            }
        } else {
            current.push_str(paragraph);
        }
    }
    if !current.trim().is_empty() {
        output.push(current.trim_end().to_string());
    }
    output
}

enum ReplyTarget {
    Weixin {
        settings: WeixinSettings,
        user_id: String,
        context_token: String,
    },
    Telegram {
        token: String,
        chat_id: String,
    },
}

fn reply_target(
    job: &PendingChannelJob,
    settings: &MessageSettings,
) -> Result<ReplyTarget, String> {
    match job.channel.as_str() {
        "weixin" if settings.weixin.enabled && !settings.weixin.token.is_empty() => {
            Ok(ReplyTarget::Weixin {
                settings: settings.weixin.clone(),
                user_id: job.recipient.clone(),
                context_token: job.context_token.clone(),
            })
        }
        "telegram" if settings.telegram.enabled && !settings.telegram.bot_token.is_empty() => {
            Ok(ReplyTarget::Telegram {
                token: settings.telegram.bot_token.clone(),
                chat_id: job.recipient.clone(),
            })
        }
        _ => Err("The originating message channel is no longer connected".to_string()),
    }
}

impl ReplyTarget {
    async fn send(&self, text: &str) -> Result<(), String> {
        match self {
            Self::Weixin {
                settings,
                user_id,
                context_token,
            } => weixin_send(settings, user_id, context_token, text).await,
            Self::Telegram { token, chat_id } => telegram_send(token, chat_id, text).await,
        }
    }
}

fn ensure_channel_conversation(channel: &str, first_message: &str) -> Result<String, String> {
    let settings = load_settings()?;
    let saved_id = match channel {
        "weixin" => settings.weixin.conversation_id,
        "telegram" => settings.telegram.conversation_id,
        _ => return Err("Unknown message channel".to_string()),
    };
    if !saved_id.is_empty() && crate::conversations::load_conversation(saved_id.clone()).is_ok() {
        return Ok(saved_id);
    }

    let summary = crate::conversations::create_conversation(Some(first_message.to_string()))?;
    let conversation_id = summary.id.clone();
    mutate_settings(|settings| match channel {
        "weixin" => settings.weixin.conversation_id = conversation_id.clone(),
        "telegram" => settings.telegram.conversation_id = conversation_id.clone(),
        _ => {}
    })?;
    Ok(summary.id)
}

fn channel_failure(locale: &str, error: &str) -> String {
    if locale == "en" {
        format!("AI reply failed: {error}")
    } else {
        format!("AI 回复失败：{error}")
    }
}

async fn run_channel_agent(
    app: &AppHandle,
    job: &mut PendingChannelJob,
    settings: &MessageSettings,
) -> Result<String, String> {
    let model_settings =
        super::load_model_config()?.ok_or_else(|| "请先在桌面端配置 AI 模型。".to_string())?;
    let provider = model_settings
        .providers
        .get(&model_settings.active_provider)
        .ok_or_else(|| "当前 AI 服务不可用。".to_string())?;
    if provider.api_key.trim().is_empty()
        || provider.base_url.trim().is_empty()
        || provider.model.trim().is_empty()
    {
        return Err("请先在桌面端完成 AI 模型配置。".to_string());
    }

    let reply_message_id = format!("channel-reply:{}", job.id);
    let conversation = crate::conversations::load_conversation(job.conversation_id.clone())?;
    if let Some(reply) = conversation.ui_messages.iter().find_map(|message| {
        (message.get("id").and_then(Value::as_str) == Some(reply_message_id.as_str()))
            .then(|| {
                message
                    .get("content")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .flatten()
    }) {
        return Ok(reply);
    }
    if job.agent_start_index.is_none() {
        save_job_agent_start(&job.id, conversation.ui_messages.len())?;
        job.agent_start_index = Some(conversation.ui_messages.len());
    }
    let current_message_id = format!("channel:{}", job.id);
    let history = conversation
        .ui_messages
        .iter()
        .filter(|message| {
            message.get("id").and_then(Value::as_str) != Some(current_message_id.as_str())
        })
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .filter_map(|message| {
            Some(crate::dsh_runtime::HistoryLine {
                role: message.get("role")?.as_str()?.to_string(),
                content: message.get("content")?.as_str()?.to_string(),
            })
        })
        .collect();
    let request = crate::dsh_runtime::AgentRequest {
        conversation_id: job.conversation_id.clone(),
        api_key: provider.api_key.clone(),
        base_url: provider.base_url.clone(),
        model: provider.model.clone(),
        message: job.input.clone(),
        locale: settings.locale.clone(),
        knowledge_root: settings.knowledge_root.clone(),
        context_paths: Vec::new(),
        skill_id: None,
        skill_prompt: None,
        enabled_my_info_sections: None,
        include_priorities: true,
        current_page: None,
        note_summary: None,
        history,
        provider: provider.protocol.clone(),
        reasoning_effort: Some(model_settings.reasoning_effort.clone()),
        model_context_window: None,
        model_max_output_tokens: None,
        model_reasoning_efforts: Vec::new(),
        web_reader: model_settings.web_reader.clone(),
        source_channel: Some(job.channel.clone()),
    };
    let research_context = super::prepare_agent_context(&request).await;
    let runtime = app
        .state::<crate::dsh_runtime::DshRuntime>()
        .inner()
        .clone();
    let final_reply = runtime.run(app.clone(), request, research_context).await?;
    if final_reply.trim().is_empty() {
        return Err(if settings.locale == "en" {
            "The model did not return a reply.".to_string()
        } else {
            "模型没有返回可发送的回复。".to_string()
        });
    }
    crate::conversations::append_channel_assistant_message_with_id(
        &job.conversation_id,
        &reply_message_id,
        &final_reply,
    )?;
    Ok(final_reply)
}

async fn process_channel_message(app: AppHandle, job_id: String) {
    let runtime = app.state::<ChannelRuntime>();
    let permit = runtime.jobs.clone().acquire_owned().await;
    let Ok(_permit) = permit else { return };
    let mut job = match pending_job(&job_id) {
        Ok(Some(job)) => job,
        _ => return,
    };
    if unix_ms().saturating_sub(job.created_at_ms) > 7 * 24 * 60 * 60_000 {
        log::warn!("[Channels] Dropping an expired pending task: {}", job.id);
        let _ = remove_job(&job.id);
        return;
    }
    let settings = match load_settings() {
        Ok(settings) => settings,
        Err(error) => {
            log::warn!("[Channels] Could not load settings for pending job: {error}");
            return;
        }
    };
    let reply = match reply_target(&job, &settings) {
        Ok(reply) => reply,
        Err(error) => {
            log::warn!("[Channels] Pending job cannot be delivered: {error}");
            return;
        }
    };
    if let Ok(mut status) = runtime.status.lock() {
        status.active_jobs += 1;
    }
    emit_status(&app);
    if job.conversation_id.is_empty() {
        match ensure_channel_conversation(&job.channel, &job.input) {
            Ok(conversation_id) => {
                job.conversation_id = conversation_id.clone();
                if let Err(error) = save_job_conversation(&job.id, conversation_id) {
                    log::warn!("[Channels] Could not persist the conversation mapping: {error}");
                    if let Ok(mut status) = runtime.status.lock() {
                        status.active_jobs = status.active_jobs.saturating_sub(1);
                    }
                    emit_status(&app);
                    return;
                }
            }
            Err(error) => {
                log::warn!("[Channels] Could not create a phone conversation: {error}");
                if let Ok(mut status) = runtime.status.lock() {
                    status.active_jobs = status.active_jobs.saturating_sub(1);
                }
                emit_status(&app);
                return;
            }
        }
    }
    let ui_message_id = format!("channel:{}", job.id);
    if let Err(error) = crate::conversations::append_channel_user_message(
        &job.conversation_id,
        &ui_message_id,
        &job.input,
    ) {
        log::warn!("[Channels] Could not persist the inbound conversation message: {error}");
        if let Ok(mut status) = runtime.status.lock() {
            status.active_jobs = status.active_jobs.saturating_sub(1);
        }
        emit_status(&app);
        return;
    }
    let (message, saved) = if job.final_reply.is_empty() {
        let message = match run_channel_agent(&app, &mut job, &settings).await {
            Ok(message) => message,
            Err(error) => {
                let message = channel_failure(&settings.locale, &error);
                let _ = crate::conversations::append_channel_assistant_message(
                    &job.conversation_id,
                    &message,
                );
                message
            }
        };
        if let Err(error) = save_job_result(&job_id, message.clone(), false) {
            log::warn!("[Channels] Could not persist the job result: {error}");
            if let Ok(mut status) = runtime.status.lock() {
                status.active_jobs = status.active_jobs.saturating_sub(1);
            }
            emit_status(&app);
            return;
        }
        let _ = app.emit("message-conversation-updated", job.conversation_id.clone());
        let _ = app.emit("message-capture-saved", ());
        (message, false)
    } else {
        (job.final_reply.clone(), job.note_saved)
    };
    if let Err(error) = reply.send(&message).await {
        log::warn!("[Channels] Could not deliver final reply: {error}");
        if let Ok(mut status) = runtime.status.lock() {
            status.active_jobs = status.active_jobs.saturating_sub(1);
        }
        emit_status(&app);
        return;
    }
    let _ = remove_job(&job_id);
    let _ = saved;
    if let Ok(mut status) = runtime.status.lock() {
        status.active_jobs = status.active_jobs.saturating_sub(1);
    }
    emit_status(&app);
}

fn restart_weixin(app: &AppHandle) -> Result<(), String> {
    let runtime = app.state::<ChannelRuntime>();
    let mut current = runtime
        .weixin_cancel
        .lock()
        .map_err(|_| "Weixin runtime is unavailable")?;
    if let Some(token) = current.take() {
        token.cancel();
    }
    let settings = load_settings()?;
    if !settings.weixin.enabled || settings.weixin.token.is_empty() {
        return Ok(());
    }
    let cancel = CancellationToken::new();
    *current = Some(cancel.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        weixin_loop(app, cancel).await;
    });
    Ok(())
}

fn restart_telegram(app: &AppHandle) -> Result<(), String> {
    let runtime = app.state::<ChannelRuntime>();
    let mut current = runtime
        .telegram_cancel
        .lock()
        .map_err(|_| "Telegram runtime is unavailable")?;
    if let Some(token) = current.take() {
        token.cancel();
    }
    let settings = load_settings()?;
    if !settings.telegram.enabled || settings.telegram.bot_token.is_empty() {
        return Ok(());
    }
    let cancel = CancellationToken::new();
    *current = Some(cancel.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        telegram_loop(app, cancel).await;
    });
    Ok(())
}

pub fn start_configured_channels(app: &AppHandle) {
    let _ = restart_weixin(app);
    let _ = restart_telegram(app);
    resume_pending_jobs(app);
}

fn resume_pending_jobs(app: &AppHandle) {
    if let Ok(jobs) = read_jobs() {
        for job in jobs {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                process_channel_message(app, job.id).await;
            });
        }
    }
}

async fn telegram_loop(app: AppHandle, cancel: CancellationToken) {
    set_status(&app, "telegram", "connecting", "");
    loop {
        if cancel.is_cancelled() {
            break;
        }
        let settings = match load_settings() {
            Ok(settings) if settings.telegram.enabled => settings,
            _ => break,
        };
        let response = telegram_request(
            &settings.telegram.bot_token,
            "getUpdates",
            json!({
                "offset": settings.telegram.update_offset,
                "timeout": 30,
                "allowed_updates": ["message"]
            }),
        )
        .await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                set_status(&app, "telegram", "error", &error);
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };
        set_status(
            &app,
            "telegram",
            if settings.telegram.allowed_user_id.is_empty() {
                "waiting_pairing"
            } else {
                "connected"
            },
            "",
        );
        let mut latest_offset = settings.telegram.update_offset;
        for update in response
            .get("result")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            let update_id = update
                .get("update_id")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            latest_offset = latest_offset.max(update_id + 1);
            let Some(message) = update.get("message") else {
                continue;
            };
            if message.pointer("/chat/type").and_then(Value::as_str) != Some("private") {
                continue;
            }
            let user_id = message
                .pointer("/from/id")
                .and_then(Value::as_i64)
                .unwrap_or_default()
                .to_string();
            let chat_id = message
                .pointer("/chat/id")
                .and_then(Value::as_i64)
                .unwrap_or_default()
                .to_string();
            let text = message
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            if text.is_empty() {
                continue;
            }
            let current = load_settings().unwrap_or_default();
            if current.telegram.allowed_user_id.is_empty() {
                let parts = text.split_whitespace().collect::<Vec<_>>();
                let presented_code = if parts.len() == 2 && parts[0] == "/pair" {
                    Some(parts[1])
                } else {
                    None
                };
                if presented_code == Some(current.telegram.pairing_code.as_str()) {
                    let paired_token = mutate_settings(|updated| {
                        if updated.telegram.allowed_user_id.is_empty()
                            && updated.telegram.pairing_code == current.telegram.pairing_code
                            && updated.telegram.bot_token == current.telegram.bot_token
                        {
                            updated.telegram.allowed_user_id = user_id.clone();
                            updated.telegram.pairing_code.clear();
                            Some(updated.telegram.bot_token.clone())
                        } else {
                            None
                        }
                    });
                    match paired_token {
                        Ok(Some(token)) => {
                            let _ = telegram_send(
                                &token,
                                &chat_id,
                                "Coffee Note 已连接。现在可以像在客户端一样直接对话；发送链接时，AI 也可以整理并保存为本地笔记。",
                            )
                            .await;
                            set_status(&app, "telegram", "connected", "");
                        }
                        Ok(None) => {}
                        Err(error) => {
                            log::warn!("[Telegram] Could not persist account pairing: {error}");
                            latest_offset = update_id;
                            break;
                        }
                    }
                }
                continue;
            }
            if user_id != current.telegram.allowed_user_id {
                continue;
            }
            let conversation_id = match ensure_channel_conversation("telegram", &text) {
                Ok(id) => id,
                Err(error) => {
                    log::warn!("[Telegram] Could not prepare conversation: {error}");
                    continue;
                }
            };
            let job_id = format!("telegram:{update_id}");
            let job = PendingChannelJob {
                id: job_id.clone(),
                channel: "telegram".to_string(),
                input: text,
                recipient: chat_id.clone(),
                context_token: String::new(),
                conversation_id,
                agent_start_index: None,
                created_at_ms: unix_ms(),
                final_reply: String::new(),
                note_saved: false,
            };
            match enqueue_job(job) {
                Ok(true) => {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        process_channel_message(app_clone, job_id).await;
                    });
                }
                Ok(false) => {}
                Err(error) => {
                    log::warn!("[Telegram] Could not persist inbound task: {error}");
                    latest_offset = update_id;
                    break;
                }
            }
        }
        if latest_offset != settings.telegram.update_offset {
            let _ = mutate_settings(|updated| {
                if updated.telegram.bot_token == settings.telegram.bot_token {
                    updated.telegram.update_offset =
                        updated.telegram.update_offset.max(latest_offset);
                }
            });
        }
    }
    if cancel.is_cancelled() {
        set_status(&app, "telegram", "disconnected", "");
    }
}

async fn weixin_loop(app: AppHandle, cancel: CancellationToken) {
    set_status(&app, "weixin", "connecting", "");
    let mut seen = HashSet::<String>::new();
    loop {
        if cancel.is_cancelled() {
            break;
        }
        let settings = match load_settings() {
            Ok(settings) if settings.weixin.enabled => settings,
            _ => break,
        };
        let response = weixin_post(
            &settings.weixin.base_url,
            "ilink/bot/getupdates",
            Some(&settings.weixin.token),
            json!({ "get_updates_buf": settings.weixin.sync_buf, "base_info": weixin_base_info() }),
            Duration::from_secs(40),
        )
        .await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                set_status(&app, "weixin", "error", &error);
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };
        if response.get("errcode").and_then(Value::as_i64) == Some(-14) {
            set_status(&app, "weixin", "error", "微信登录已失效，请重新连接。");
            break;
        }
        set_status(&app, "weixin", "connected", "");
        let next_sync_buf = response
            .get("get_updates_buf")
            .and_then(Value::as_str)
            .map(str::to_string);
        let mut persistence_failed = false;
        for message in response
            .get("msgs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            if message.get("message_type").and_then(Value::as_i64) != Some(1) {
                continue;
            }
            let from = message
                .get("from_user_id")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if from != settings.weixin.allowed_user_id {
                continue;
            }
            let id = message
                .get("message_id")
                .map(Value::to_string)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            if seen.contains(&id) {
                continue;
            }
            if seen.len() > 512 {
                seen.clear();
            }
            let text = message
                .get("item_list")
                .and_then(Value::as_array)
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| item.get("type").and_then(Value::as_i64) == Some(1))
                })
                .and_then(|item| item.pointer("/text_item/text"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            let context_token = message
                .get("context_token")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if text.is_empty() || context_token.is_empty() {
                continue;
            }
            let conversation_id = match ensure_channel_conversation("weixin", &text) {
                Ok(id) => id,
                Err(error) => {
                    log::warn!("[Weixin] Could not prepare conversation: {error}");
                    continue;
                }
            };
            let job_id = format!("weixin:{id}");
            let job = PendingChannelJob {
                id: job_id.clone(),
                channel: "weixin".to_string(),
                input: text,
                recipient: from.to_string(),
                context_token: context_token.clone(),
                conversation_id,
                agent_start_index: None,
                created_at_ms: unix_ms(),
                final_reply: String::new(),
                note_saved: false,
            };
            match enqueue_job(job) {
                Ok(true) => {
                    seen.insert(id.clone());
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        process_channel_message(app_clone, job_id).await;
                    });
                }
                Ok(false) => {
                    seen.insert(id.clone());
                }
                Err(error) => {
                    log::warn!("[Weixin] Could not persist inbound task: {error}");
                    persistence_failed = true;
                    break;
                }
            }
        }
        if !persistence_failed {
            if let Some(sync_buf) = next_sync_buf {
                if sync_buf != settings.weixin.sync_buf {
                    let _ = mutate_settings(|updated| {
                        if updated.weixin.token == settings.weixin.token {
                            updated.weixin.sync_buf = sync_buf;
                        }
                    });
                }
            }
        }
    }
    if cancel.is_cancelled() {
        set_status(&app, "weixin", "disconnected", "");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_outside_the_library() {
        let path = std::env::temp_dir().join(format!(
            "coffee-note-message-settings-{}.json",
            uuid::Uuid::new_v4()
        ));
        let settings = MessageSettings {
            knowledge_root: "C:/Notes".to_string(),
            telegram: TelegramSettings {
                bot_token: "secret".to_string(),
                conversation_id: "phone-conversation".to_string(),
                ..TelegramSettings::default()
            },
            ..MessageSettings::default()
        };
        save_settings_to(&path, &settings).expect("settings should save");
        let loaded = load_settings_from(&path).expect("settings should load");
        assert_eq!(loaded.knowledge_root, "C:/Notes");
        assert_eq!(loaded.telegram.bot_token, "secret");
        assert_eq!(loaded.telegram.conversation_id, "phone-conversation");
        fs::remove_file(path).expect("fixture should be removed");
    }

    #[test]
    fn outbound_messages_split_without_losing_text() {
        let input = format!("{}\n{}", "a".repeat(12), "b".repeat(12));
        let parts = split_message(&input, 10);
        assert!(parts.iter().all(|part| part.chars().count() <= 10));
        assert_eq!(parts.concat().replace('\n', ""), input.replace('\n', ""));
    }
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const globalStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../src/settings/MessageSettings.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/settings/MessageSettings.css', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../src-tauri/src/channels.rs', import.meta.url), 'utf8');
const agentRuntimeSource = await readFile(new URL('../src-tauri/src/dsh_runtime.rs', import.meta.url), 'utf8');
const [weixinIcon, telegramIcon] = await Promise.all([
  readFile(new URL('../public/channels/weixin.png', import.meta.url)),
  readFile(new URL('../public/channels/telegram.png', import.meta.url)),
]);

test('message settings expose only Weixin and Telegram channels', () => {
  assert.match(settingsSource, /微信/);
  assert.match(settingsSource, /Telegram/);
  assert.match(settingsSource, /\/channels\/weixin\.png/);
  assert.match(settingsSource, /\/channels\/telegram\.png/);
  assert.doesNotMatch(settingsSource, /weixin-mark|telegram-mark/);
  assert.doesNotMatch(settingsSource, /WhatsApp|Discord|Slack/);
  assert.deepEqual([...weixinIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...telegramIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('Weixin follows Tencent iLink QR login and long polling', () => {
  assert.match(rustSource, /ilink\/bot\/get_bot_qrcode\?bot_type=3/);
  assert.match(rustSource, /ilink\/bot\/get_qrcode_status/);
  assert.match(rustSource, /ilink\/bot\/getupdates/);
  assert.match(rustSource, /ilink\/bot\/sendmessage/);
  assert.match(rustSource, /CoffeeNote\/\{CHANNEL_VERSION\}/);
});

test('channel messages enter the shared persisted conversation agent', () => {
  assert.match(rustSource, /CHANNEL_JOBS_FILE/);
  assert.match(rustSource, /enqueue_job\(job\)/);
  assert.match(rustSource, /run_channel_agent/);
  assert.match(rustSource, /dsh_runtime::DshRuntime/);
  assert.match(rustSource, /\.run\(app\.clone\(\), request, research_context\)/);
  assert.match(rustSource, /source_channel:\s*Some\(job\.channel\.clone\(\)\)/);
  assert.match(rustSource, /append_channel_user_message/);
  assert.match(rustSource, /append_channel_assistant_message_with_id/);
  assert.match(rustSource, /agent_start_index/);
  assert.match(rustSource, /channel-reply:/);
  assert.match(rustSource, /"message-conversation-updated"/);
  assert.doesNotMatch(rustSource, /process_capture|prepare_capture\(super::PrepareCaptureRequest|super::save_capture/);
  assert.doesNotMatch(rustSource, /收到，正在整理并保存/);
  assert.match(settingsSource, /像在客户端一样与 Coffee Note 对话/);
  assert.match(settingsSource, /手机对话会同步到客户端的对话记录/);
  assert.match(apiSource, /listenMessageConversationUpdated/);
  assert.match(appSource, /listenMessageConversationUpdated\(\(conversationId\)/);
  assert.match(agentRuntimeSource, /linked phone channel is only another conversation entry point/);
  assert.match(agentRuntimeSource, /message primarily containing a public URL implies fetch, organize, and save/);
  assert.match(agentRuntimeSource, /other writes require expressed user intent/);
});

test('Telegram uses private-chat polling and one-time account pairing', () => {
  assert.match(rustSource, /"getUpdates"/);
  assert.match(rustSource, /pointer\("\/chat\/type"\).*Some\("private"\)/s);
  assert.match(rustSource, /pairing_code/);
  assert.match(settingsSource, /\/pair \{pairingCode\}/);
});

test('message credentials live behind Tauri commands and inputs share desktop rules', () => {
  assert.match(apiSource, /invoke<MessageSettingsConfig>\('load_message_settings'\)/);
  assert.match(settingsSource, /type="password"/);
  assert.doesNotMatch(settingsSource, /title=/);
  assert.match(styles, /background:\s*var\(--control-surface\)/);
  assert.match(styles, /font-size:\s*14px/);
  assert.match(styles, /\.message-inline-form input:focus-visible[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*none;/);
  assert.doesNotMatch(styles, /--focus-border/);
  assert.match(globalStyles, /input\[type='password'\][\s\S]*textarea[\s\S]*:focus-visible[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*none;/);
});

test('message speech recognition mode matches capture copy and saves independently', () => {
  assert.match(settingsSource, /captureTranscriptionPrefix/);
  assert.match(settingsSource, /captureTranscriptionApi/);
  assert.match(settingsSource, /captureTranscriptionLocal/);
  assert.match(i18nSource, /captureTranscriptionPrefix:\s*'语音识别方式：'/);
  assert.match(i18nSource, /captureTranscriptionApi:\s*'语音模型'/);
  assert.match(i18nSource, /captureTranscriptionLocal:\s*'本地语音模型'/);
  assert.doesNotMatch(settingsSource, /云端服务/);
  assert.match(apiSource, /invoke\('update_message_transcription_mode', \{ transcriptionMode \}\)/);
  assert.match(rustSource, /pub fn update_message_transcription_mode/);
  assert.doesNotMatch(settingsSource, /if \(!settings\?\.knowledgeRoot\) return/);
  assert.doesNotMatch(styles, /--selected-surface/);
  assert.match(styles, /\.message-mode-switch button\.active[\s\S]*background:\s*var\(--tertiary-surface\)/);
  assert.doesNotMatch(settingsSource, /message-mode-check/);
});

test('sidebar status reflects the two real channels', () => {
  assert.match(appSource, /messageChannelStatus\.weixin === 'connected'/);
  assert.match(appSource, /messageChannelStatus\.telegram === 'connected'/);
  assert.match(appSource, /尚未连接消息渠道/);
});

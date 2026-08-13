import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../src/settings/MessageSettings.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/settings/MessageSettings.css', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../src-tauri/src/channels.rs', import.meta.url), 'utf8');
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

test('channel messages enter a restricted persisted capture pipeline', () => {
  assert.match(rustSource, /CHANNEL_JOBS_FILE/);
  assert.match(rustSource, /enqueue_job\(job\)/);
  assert.match(rustSource, /prepare_capture\(super::PrepareCaptureRequest/);
  assert.match(rustSource, /super::save_capture/);
  assert.doesNotMatch(rustSource, /run_agent|agent_tools::execute_tool/);
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
});

test('sidebar status reflects the two real channels', () => {
  assert.match(appSource, /messageChannelStatus\.weixin === 'connected'/);
  assert.match(appSource, /messageChannelStatus\.telegram === 'connected'/);
  assert.match(appSource, /尚未连接消息渠道/);
});

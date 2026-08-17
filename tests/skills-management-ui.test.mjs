import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../src/settings/SkillsSettings.tsx', import.meta.url), 'utf8');
const multimodalSettingsSource = await readFile(new URL('../src/settings/MultimodalSettings.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const transcriptionCssSource = await readFile(new URL('../src/transcriptionSettings.css', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../src-tauri/src/skills.rs', import.meta.url), 'utf8');
const appBackendSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const agentSource = await readFile(new URL('../src-tauri/src/agent_loop.rs', import.meta.url), 'utf8');
const presentationSource = await readFile(new URL('../src-tauri/src/presentation.rs', import.meta.url), 'utf8');
const presentationManifest = await readFile(new URL('../src-tauri/builtin-plugins/coffee-presentation/coffee-plugin.json', import.meta.url), 'utf8');
const presentationSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-presentation/skills/create-presentation/SKILL.md', import.meta.url), 'utf8');
const videoSource = await readFile(new URL('../src-tauri/src/video.rs', import.meta.url), 'utf8');
const videoManifest = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/coffee-plugin.json', import.meta.url), 'utf8');
const videoSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/skills/create-video/SKILL.md', import.meta.url), 'utf8');

test('settings includes a plugin market backed by one shared catalog', () => {
  assert.match(appSource, /type SettingsSectionId = 'model' \| 'skills' \| 'transcription' \| 'multimodal' \| 'appearance'/);
  assert.match(appSource, /<SkillsSettings/);
  assert.match(appSource, /listSkills\(\)/);
  assert.match(settingsSource, /插件市场/);
  assert.match(settingsSource, /catalog\.categories\.map/);
  assert.match(settingsSource, /visiblePlugins\.map/);
  assert.match(settingsSource, /className="skills-package-back"/);
  assert.match(settingsSource, /className="skills-package-grid"/);
  assert.match(settingsSource, /selectedPluginSkills\.map/);
});

test('plugin source form only asks for Git address and category', () => {
  assert.match(settingsSource, /className="skills-editor skills-source-form"/);
  assert.match(settingsSource, /draft\.sourceUrl/);
  assert.match(settingsSource, /draft\.categoryId/);
  assert.match(settingsSource, /Git 仓库地址/);
  assert.match(settingsSource, /<SettingsSelect/);
  assert.doesNotMatch(settingsSource, /<select/);
  assert.doesNotMatch(settingsSource, /draft\.(title|description|instructions|version)/);
  assert.match(settingsSource, /编辑技能插件|Edit skill plugin/);
  assert.doesNotMatch(settingsSource, /modal-backdrop|aria-modal|title=|window\.confirm|plugin-dialog|askConfirmation/);
  assert.match(settingsSource, /一个插件可以包含多个小技能/);
  assert.match(settingsSource, /支持 Coffee 插件清单/);
  assert.match(cssSource, /\.skills-package-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
});

test('skill sources are cached once and metadata stays read only', () => {
  for (const command of [
    'list_skills',
    'add_skill_source',
    'update_skill_source',
    'delete_skill_source',
    'create_skill_category',
    'rename_skill_category',
    'delete_skill_category',
    'set_skill_enabled',
    'set_builtin_plugin_enabled',
  ]) {
    assert.match(rustSource, new RegExp(`pub (?:async )?fn ${command}`));
  }
  assert.match(rustSource, /join\("SKILL\.md"\)/);
  assert.match(rustSource, /fn discover_package/);
  assert.match(rustSource, /fn package_manifest/);
  assert.match(rustSource, /fn is_valid_id/);
  assert.match(rustSource, /fn validate_git_url/);
  assert.doesNotMatch(rustSource, /write_skill_files|replace_skill_from_source/);
  assert.match(apiSource, /invoke<SkillCatalog>\('list_skills'\)/);
  assert.match(apiSource, /invoke<SkillCatalog>\('add_skill_source'/);
  assert.match(apiSource, /invoke<SkillCatalog>\('update_skill_source'/);
  assert.match(apiSource, /invoke<SkillCatalog>\('set_skill_enabled'/);
  assert.doesNotMatch(rustSource, /MAX_SKILLS_PER_SOURCE|more than \{MAX_SKILLS_PER_SOURCE\} skills/);
});

test('selected skill is loaded from its source and added to the request prompt', () => {
  assert.match(agentSource, /pub skill_id: Option<String>/);
  assert.match(agentSource, /pub skill_prompt: Option<String>/);
  assert.match(agentSource, /<selected_skill>/);
  assert.match(rustSource, /pub fn load_skill_prompt/);
});

test('every plugin row exposes read-only metadata with update and delete actions', () => {
  assert.match(settingsSource, /updateSkillFromSource\(plugin\.id\)/);
  assert.doesNotMatch(settingsSource, /className="skills-count"/);
  assert.doesNotMatch(cssSource, /\.skills-count\s*\{/);
  assert.match(settingsSource, /setUpdatedPluginNotice\(\{\s*pluginId: plugin\.id,/s);
  assert.match(
    settingsSource,
    /className="skills-row-actions">\s*\{updatedPluginNotice\?\.pluginId === plugin\.id[\s\S]*className="skills-row-notice"[\s\S]*onClick=\{\(\) => void refreshPlugin\(plugin\)\}/,
  );
  assert.match(cssSource, /\.skills-row-notice\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.doesNotMatch(cssSource, /\.skills-row-icon\s*\{[^}]*background:/s);
  assert.match(cssSource, /\.skills-row-icon img\s*\{[^}]*width:\s*30px;[^}]*height:\s*30px;/s);
  assert.match(transcriptionCssSource, /\.transcription-component-mark\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--ink\) 7%, var\(--secondary-surface\)\)/s);
  assert.match(settingsSource, /className="skills-version"/);
  assert.match(settingsSource, /更新中…/);
  assert.match(settingsSource, /<RefreshCw/);
  assert.match(settingsSource, /<Trash2/);
  assert.doesNotMatch(settingsSource, /startEditSkill|updateSkill\(/);
});

test('settings separates image recognition, image generation, and speech generation', () => {
  assert.match(appSource, /id: 'multimodal'.*识别与生成/s);
  assert.match(appSource, /<MultimodalSettings locale=\{locale\}/);
  assert.match(multimodalSettingsSource, /识别与生成/);
  assert.match(multimodalSettingsSource, /图片识别/);
  assert.match(multimodalSettingsSource, /图片生成/);
  assert.match(multimodalSettingsSource, /语音生成/);
  assert.match(multimodalSettingsSource, /activeTab === 'recognition'/);
  assert.match(multimodalSettingsSource, /selectTab\('generation'\)/);
  assert.match(multimodalSettingsSource, /selectTab\('speech'\)/);
  assert.match(multimodalSettingsSource, /API 地址/);
  assert.match(multimodalSettingsSource, /API Key/);
  assert.match(multimodalSettingsSource, /checkImageSettings\(settings, activeTab\)/);
  assert.doesNotMatch(multimodalSettingsSource, /本地 OCR|local OCR/);
  assert.match(appBackendSource, /const IMAGE_SETTINGS_CONFIG_FILE: &str = "image-models\.json"/);
  assert.match(appBackendSource, /fn load_image_settings/);
  assert.match(appBackendSource, /fn save_image_settings/);
  assert.match(appBackendSource, /async fn check_image_settings/);
  assert.match(appBackendSource, /"type": "image_url"/);
  assert.match(appBackendSource, /fn image_generation_model_url/);
  assert.match(appBackendSource, /client\s*\.get\(model_url\)/);
  assert.match(multimodalSettingsSource, /openai-images/);
  assert.match(multimodalSettingsSource, /openrouter-images/);
  assert.match(multimodalSettingsSource, /gemini-interactions/);
  assert.match(multimodalSettingsSource, /openai-speech/);
  assert.match(appBackendSource, /async fn recognize_workspace_image/);
  assert.match(appBackendSource, /async fn generate_workspace_image/);
  assert.match(agentSource, /image_tool_availability/);
  assert.match(agentSource, /image_recognition: image_tools\.recognition/);
  assert.match(agentSource, /image_generation: image_tools\.generation/);
});

test('video is a bundled fallback plugin backed by guarded shared tools', () => {
  assert.match(videoManifest, /"id": "coffee-video"/);
  assert.match(videoManifest, /"id": "coffee-video-engine"/);
  assert.match(videoManifest, /"categoryId": "video"/);
  assert.match(videoSkill, /generate_image/);
  assert.match(videoSkill, /create_video/);
  assert.match(videoSkill, /Never install a/);
  assert.match(videoSource, /sidecar\("coffee-video-ffmpeg"\)/);
  assert.match(videoSource, /generate_speech_audio/);
  assert.match(videoSource, /subtitles=scene\.ass/);
  assert.match(agentSource, /video: crate::skills::builtin_tool_enabled\("create_video"\)/);
  assert.match(appSource, /create_video/);
});

test('plugin packages open a two-column detail page with independent skill switches', () => {
  assert.match(settingsSource, /setSelectedPluginId\(plugin\.id\)/);
  assert.match(settingsSource, /返回插件市场|Back to plugin market/);
  assert.match(settingsSource, /setSkillEnabled\(skill\.id, skill\.sourceId, !skill\.enabled\)/);
  assert.match(settingsSource, /已启用 \$\{enabledSkillCount\} \/ \$\{selectedPluginSkills\.length\} 个技能/);
  assert.match(rustSource, /disabled_skill_ids: BTreeSet<String>/);
  assert.match(rustSource, /meta\.enabled && !meta\.disabled_skill_ids\.contains\(&id\)/);
  assert.match(rustSource, /The selected skill is disabled/);
  assert.match(settingsSource, /skill\.iconId && catalog\.icons\[skill\.iconId\][\s\S]*?<img src=\{catalog\.icons\[skill\.iconId\]\} alt=""/);
  assert.match(settingsSource, /plugin\.iconId && catalog\.icons\[plugin\.iconId\][\s\S]*?<img src=\{catalog\.icons\[plugin\.iconId\]\} alt=""/);
  assert.match(rustSource, /icons: BTreeMap<String, String>/);
  assert.match(rustSource, /const MAX_SKILL_BYTES: u64 = 512 \* 1024/);
  assert.match(rustSource, /fn nearest_plugin_manifest/);
  assert.match(rustSource, /fn manifest_icon_data_url/);
});

test('built-in media skill is visible, toggleable, and has no source actions', () => {
  assert.match(apiSource, /setBuiltinPluginEnabled/);
  assert.match(rustSource, /pub fn set_builtin_plugin_enabled/);
  assert.match(rustSource, /builtin_plugins/);
  assert.match(settingsSource, /plugin\.builtin/);
  assert.match(settingsSource, /skills-built-in-mark/);
  assert.match(settingsSource, /id === 'media'.*Audio & video/s);
  assert.match(settingsSource, /plugin\.builtin\s*\?\s*setBuiltinPluginEnabled/);
  assert.match(settingsSource, /!plugin\.builtin/);
  assert.match(appSource, /captureMediaSkillDisabled/);
});

test('plugin market is one workspace and keeps runtime details internal', () => {
  assert.doesNotMatch(settingsSource, /activeView|skills-view-tabs|已安装插件|Installed plugins/);
  assert.doesNotMatch(settingsSource, /plugin\.publisher|plugin\.runtimeId|selectedPlugin\.permissions/);
  assert.doesNotMatch(cssSource, /\.skills-row-meta|\.skills-package-facts|\.skills-permissions/);
  assert.doesNotMatch(cssSource, /\.skills-market-installed/);
  assert.match(rustSource, /coffee-plugin\.json/);
  assert.match(rustSource, /runtime_id: Option<String>/);
});

test('presentation is a bundled plugin backed by one reusable native runtime', () => {
  assert.match(presentationManifest, /"id": "coffee-presentation"/);
  assert.match(presentationManifest, /"id": "presentation-engine"/);
  assert.match(presentationManifest, /"lifecycle": "application"/);
  assert.match(presentationManifest, /"shared": true/);
  assert.match(presentationManifest, /"prewarm": true/);
  assert.match(presentationSkill, /create_presentation/);
  assert.match(presentationSkill, /Never install a package/);
  assert.match(presentationSource, /fn write_pptx/);
  assert.match(presentationSource, /SLIDE_WIDTH: i64 = 12_192_000/);
  assert.match(presentationSource, /"minimal".*"business".*"dark"/s);
  assert.match(presentationSource, /a:normAutofit/);
  assert.match(presentationSource, /reserve_output_file/);
  assert.match(agentSource, /skill_prompt/);
  assert.match(agentSource, /presentation: crate::skills::builtin_tool_enabled\("create_presentation"\)/);
  assert.match(rustSource, /pub\(crate\) fn builtin_tool_enabled/);
  assert.match(appSource, /create_presentation/);
  assert.match(appSource, /recognize_image/);
  assert.match(appSource, /generate_image/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../src/settings/SkillsSettings.tsx', import.meta.url), 'utf8');
const multimodalSettingsSource = await readFile(new URL('../src/settings/MultimodalSettings.tsx', import.meta.url), 'utf8');
const transcriptionSettingsSource = await readFile(new URL('../src/settings/TranscriptionSettings.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const transcriptionCssSource = await readFile(new URL('../src/transcriptionSettings.css', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../src-tauri/src/skills.rs', import.meta.url), 'utf8');
const appBackendSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const transcriptionBackendSource = await readFile(new URL('../src-tauri/src/transcription.rs', import.meta.url), 'utf8');
const agentSource = await readFile(new URL('../src-tauri/src/agent_loop.rs', import.meta.url), 'utf8');
const presentationSource = await readFile(new URL('../src-tauri/src/presentation.rs', import.meta.url), 'utf8');
const presentationManifest = await readFile(new URL('../src-tauri/builtin-plugins/coffee-presentation/coffee-plugin.json', import.meta.url), 'utf8');
const presentationSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-presentation/skills/create-presentation/SKILL.md', import.meta.url), 'utf8');
const videoSource = await readFile(new URL('../src-tauri/src/video.rs', import.meta.url), 'utf8');
const videoManifest = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/coffee-plugin.json', import.meta.url), 'utf8');
const videoSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/skills/create-video/SKILL.md', import.meta.url), 'utf8');
const storyboardSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/skills/storyboard-director/SKILL.md', import.meta.url), 'utf8');
const storyboardSpec = await readFile(new URL('../src-tauri/builtin-plugins/coffee-video/references/cinematic-storyboard.md', import.meta.url), 'utf8');
const documentSource = await readFile(new URL('../src-tauri/src/document.rs', import.meta.url), 'utf8');
const documentManifest = await readFile(new URL('../src-tauri/builtin-plugins/coffee-documents/coffee-plugin.json', import.meta.url), 'utf8');
const docxSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-documents/skills/create-docx/SKILL.md', import.meta.url), 'utf8');
const pdfSkill = await readFile(new URL('../src-tauri/builtin-plugins/coffee-documents/skills/create-pdf/SKILL.md', import.meta.url), 'utf8');

test('settings includes a plugin market backed by one shared catalog', () => {
  assert.match(appSource, /type SettingsSectionId = 'general' \| 'appearance' \| 'model' \| 'skills' \| 'transcription' \| 'multimodal'/);
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
  assert.match(settingsSource, /支持 TierNote 插件清单/);
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

test('multimodal model settings separate recognition, image, speech, video, music, and sound generation', () => {
  assert.match(appSource, /id: 'multimodal'.*多模态模型/s);
  assert.match(appSource, /<MultimodalSettings locale=\{locale\}/);
  assert.match(multimodalSettingsSource, /多模态模型/);
  assert.match(multimodalSettingsSource, /图片识别/);
  assert.match(multimodalSettingsSource, /图片生成/);
  assert.match(multimodalSettingsSource, /语音生成/);
  assert.match(multimodalSettingsSource, /视频生成/);
  assert.match(multimodalSettingsSource, /音乐生成/);
  assert.match(multimodalSettingsSource, /音效生成/);
  assert.match(multimodalSettingsSource, /activeTab === 'recognition'/);
  assert.match(multimodalSettingsSource, /selectTab\('generation'\)/);
  assert.match(multimodalSettingsSource, /selectTab\('speech'\)/);
  assert.match(multimodalSettingsSource, /selectTab\('video'\)/);
  assert.match(multimodalSettingsSource, /selectTab\('music'\)/);
  assert.match(multimodalSettingsSource, /selectTab\('sound'\)/);
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
  assert.match(multimodalSettingsSource, /openai-video/);
  assert.match(multimodalSettingsSource, /gemini-music/);
  assert.match(multimodalSettingsSource, /elevenlabs-music/);
  assert.match(multimodalSettingsSource, /minimax-music/);
  assert.match(multimodalSettingsSource, /elevenlabs-sound/);
  assert.match(multimodalSettingsSource, /https:\/\/api\.openai\.com\/v1\/videos/);
  assert.match(appBackendSource, /async fn check_video_generation/);
  assert.match(appBackendSource, /"video" => \(&config\.video, "video generation"\)/);
  assert.match(appBackendSource, /"music" => \(&config\.music, "music generation"\)/);
  assert.match(appBackendSource, /async fn check_music_generation/);
  assert.match(appBackendSource, /"sound" => \(&config\.sound, "sound effects generation"\)/);
  assert.match(appBackendSource, /async fn check_sound_generation/);
  assert.match(appBackendSource, /async fn recognize_workspace_image/);
  assert.match(appBackendSource, /async fn generate_workspace_image/);
  assert.match(agentSource, /image_tool_availability/);
  assert.match(agentSource, /image_recognition: image_tools\.recognition/);
  assert.match(agentSource, /image_generation: image_tools\.generation/);
});

test('video generation exposes every direct provider and the Runway model catalog', () => {
  assert.match(multimodalSettingsSource, /models: \['sora-2', 'sora-2-pro'\]/);
  assert.match(multimodalSettingsSource, /id: 'runway'/);
  assert.match(multimodalSettingsSource, /protocol: 'runway-video'/);
  assert.match(multimodalSettingsSource, /https:\/\/api\.dev\.runwayml\.com\/v1\/image_to_video/);
  for (const model of [
    'seedance2_5',
    'grok_imagine_1_5',
    'seedance2',
    'seedance2_fast',
    'seedance2_mini',
    'hailuo3',
    'aleph2',
    'gen4.5',
    'gen4_turbo',
    'act_two',
    'veo3.1',
    'veo3.1_fast',
    'happyhorse_1_0',
    'gemini_omni_flash',
  ]) {
    assert.match(multimodalSettingsSource, new RegExp(`'${model.replace('.', '\\.')}'`));
  }
  assert.match(multimodalSettingsSource, /model && !modelOptions\.includes\(model\)/);
  assert.match(multimodalSettingsSource, /visibleModelOptions\.length > 0/);
  assert.match(appBackendSource, /"runway-video" =>/);
  assert.match(appBackendSource, /endpoint\.set_path\("\/v1\/organization"\)/);
  assert.match(appBackendSource, /header\("X-Runway-Version", "2024-11-06"\)/);
  for (const protocol of [
    'byteplus-video',
    'kling-video',
    'vertex-video',
    'minimax-video',
    'luma-video',
    'vidu-video',
    'pika-video',
    'wan-video',
    'ltx-video',
    'adobe-firefly-video',
    'tencent-tokenhub-video',
  ]) {
    assert.match(multimodalSettingsSource, new RegExp(`protocol: '${protocol}'`));
  }
  for (const model of [
    'dreamina-seedance-2-5-260628',
    'doubao-seedance-2-5-260628',
    'kling-v3',
    'kling-v3-omni',
    'veo-3.1-generate-001',
    'veo-3.1-fast-generate-001',
    'MiniMax-H3',
    'ray-3.2',
    'viduq3-pro',
    'viduq3-turbo',
    'pika/pika-2.5/text-to-video',
    'wan2.7-t2v-2026-06-12',
    'wan2.7-i2v-2026-04-25',
    'ltx-2-5-pro',
    'ltx-2-5-fast',
    'dreamina-seedance-2-0-260128',
    'seedance-1-5-pro-251215',
    'kling-v2-6',
    'hy-video-1.5',
    'yt-video-2.0',
    'pixverse-video-v6.0',
    'pixverse-video-c1',
    'wan3.0-video',
    'wan2.7-t2v',
    'wan2.7-r2v',
    'happyhorse-1.1-t2v',
  ]) {
    assert.match(multimodalSettingsSource, new RegExp(model.replaceAll('.', '\\.')));
  }
  assert.match(multimodalSettingsSource, /OpenAI Sora（2026-09-24 停用）/);
  assert.match(multimodalSettingsSource, /modelRequired: false/);
  assert.match(multimodalSettingsSource, /secondaryApiKeyLabel/);
  assert.match(multimodalSettingsSource, /OAuth Access Token/);
  assert.match(multimodalSettingsSource, /Adobe x-api-key/);
  assert.match(appBackendSource, /"vidu-video" =>/);
  assert.match(appBackendSource, /"tencent-tokenhub-video" =>/);
  assert.match(appBackendSource, /endpoint\.set_path\("\/v1\/models"\)/);
  assert.match(appBackendSource, /endpoint\.set_path\("\/ent\/v2\/credits"\)/);
  assert.match(appBackendSource, /format!\("Token \{\}"/);
  assert.match(appBackendSource, /provider\.protocol != "adobe-firefly-video"/);
  assert.match(appBackendSource, /provider\.secondary_api_key\.trim\(\)\.is_empty\(\)/);
  assert.match(appBackendSource, /Replace PROJECT_ID and MODEL_ID/);
});

test('verified image, speech, music, and sound providers expose model choices', () => {
  for (const model of [
    'gpt-5.6',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
    'gpt-image-2',
    'gpt-image-1.5',
    'gpt-image-1',
    'gpt-image-1-mini',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image',
    'gpt-4o-mini-tts',
    'tts-1',
    'tts-1-hd',
    'lyria-3-pro-preview',
    'lyria-3-clip-preview',
    'music_v2',
    'music_v1',
    'music-3.0',
    'music-2.6',
    'music-cover',
    'eleven_text_to_sound_v2',
  ]) {
    assert.match(multimodalSettingsSource, new RegExp(`'${model.replaceAll('.', '\\.')}'`));
  }
  assert.match(multimodalSettingsSource, /https:\/\/api\.elevenlabs\.io\/v1\/music/);
  assert.match(multimodalSettingsSource, /https:\/\/api\.minimax\.io\/v1\/music_generation/);
  assert.match(appBackendSource, /endpoint\.set_path\("\/v1\/user"\)/);
  assert.match(appBackendSource, /header\("xi-api-key", provider\.api_key\.trim\(\)\)/);
  assert.match(appBackendSource, /"minimax-music" =>/);
  assert.match(apiSource, /music: \{ activeProvider: '', providers: \{\} \}/);
  assert.match(apiSource, /sound: \{ activeProvider: '', providers: \{\} \}/);
});

test('audio-to-text keeps file transcription protocols and current model choices explicit', () => {
  for (const model of [
    'gpt-transcribe',
    'gpt-4o-transcribe',
    'gpt-4o-mini-transcribe',
    'gpt-4o-transcribe-diarize',
    'whisper-1',
    'nova-3',
    'universal-3-pro',
    'universal-2',
    'scribe_v2',
    'scribe_v1',
  ]) {
    assert.match(transcriptionSettingsSource, new RegExp(`'${model.replaceAll('.', '\\.')}'`));
  }
  assert.match(transcriptionSettingsSource, /protocol: 'elevenlabs'/);
  assert.match(transcriptionSettingsSource, /https:\/\/api\.elevenlabs\.io\/v1\/speech-to-text/);
  assert.match(transcriptionBackendSource, /text\("response_format", "diarized_json"\)/);
  assert.match(transcriptionBackendSource, /text\("chunking_strategy", "auto"\)/);
  assert.match(transcriptionBackendSource, /"speech_models": \[config\.model\.clone\(\)\]/);
  assert.match(transcriptionBackendSource, /"elevenlabs" => transcribe_elevenlabs/);
  for (const model of ['sensevoice-small', 'paraformer-large', 'funasr-nano']) {
    assert.match(transcriptionSettingsSource, new RegExp(`id: '${model}'`));
    assert.match(transcriptionBackendSource, new RegExp(`"${model}"`));
  }
  for (const model of ['fireredasr2-aed', 'fireredasr2-llm']) {
    assert.match(transcriptionSettingsSource, new RegExp(`id: '${model}'`));
  }
  assert.match(transcriptionSettingsSource, /可用模型/);
  assert.match(transcriptionSettingsSource, /运行引擎/);
  for (const tab of ['FunASR', 'Whisper CPU', 'Whisper NVIDIA', 'FireRedASR2']) {
    assert.match(transcriptionSettingsSource, new RegExp(`'${tab}'`));
  }
  assert.match(transcriptionSettingsSource, /function runtimeComponents[\s\S]*?const runtimes[\s\S]*?id: 'firered'[\s\S]*?id: 'funasr'/);
  assert.match(transcriptionSettingsSource, /visibleModels/);
  assert.doesNotMatch(transcriptionSettingsSource, /transcription-tabs-divider/);
  assert.match(transcriptionSettingsSource, /transcription-tab-active-state/);
  assert.match(transcriptionSettingsSource, /className="transcription-model-switch"/);
  assert.match(transcriptionSettingsSource, /role="switch"/);
  assert.match(transcriptionSettingsSource, /aria-checked=\{active\}/);
  assert.match(transcriptionSettingsSource, /modelStates\[modelStateKey\(tabRuntime, modelId\)\] !== 'installed'/);
  assert.match(transcriptionSettingsSource, /runtimeStates\[tabRuntime\] !== 'installed'/);
  assert.match(transcriptionSettingsSource, /kind === 'model' && state === 'installed' && runtimeReady/);
  assert.match(transcriptionSettingsSource, /runtimeStates\[runtime\.id\] === 'installed'/);
  assert.match(transcriptionSettingsSource, /modelStateKey\(item\.runtimeId, item\.id\)/);
  assert.match(transcriptionSettingsSource, /getTranscriptionStorage\(activeTab\)/);
  assert.match(transcriptionSettingsSource, /const runtimeId = selectedRuntime\.id/);
  assert.match(transcriptionSettingsSource, /setTranscriptionStorageDirectory\(runtimeId, directory\)/);
  assert.match(transcriptionSettingsSource, /activeTabRef\.current === runtimeId/);
  assert.match(transcriptionSettingsSource, /displayStoragePath\(storageInfo\.directory\)/);
  assert.match(transcriptionSettingsSource, /已下载/);
  assert.doesNotMatch(transcriptionSettingsSource, /transcription-tab-recommended/);
  assert.match(transcriptionCssSource, /\.transcription-tab-active-state[\s\S]*color: var\(--switch-on\)/);
  assert.match(transcriptionCssSource, /\.transcription-model-switch\[aria-checked='true'\][\s\S]*background: var\(--switch-on\)/);
  assert.doesNotMatch(transcriptionSettingsSource, /推荐仅在当前体系内比较|所需引擎：|Required engine:/);
  assert.doesNotMatch(transcriptionSettingsSource, /transcription-model-runtime/);
  assert.match(transcriptionSettingsSource, /选择目录/);
  assert.match(transcriptionSettingsSource, /打开目录/);
  assert.match(transcriptionBackendSource, /gitcode\.com\/gh_mirrors\/fi\/FireRedASR2S/);
  assert.match(transcriptionBackendSource, /huggingface\.co\/FireRedTeam\/FireRedASR2/);
  assert.match(transcriptionBackendSource, /resolve_transcription_resource_source/);
  assert.match(transcriptionBackendSource, /set_transcription_storage_directory/);
  assert.match(transcriptionBackendSource, /directories: BTreeMap<String, String>/);
  assert.match(transcriptionBackendSource, /resource_root_for_runtime/);
  assert.match(transcriptionBackendSource, /runtime_storage_folder/);
  assert.match(transcriptionBackendSource, /strip_prefix\(r"\\\\\?\\UNC\\"\)/);
  assert.match(transcriptionBackendSource, /modelscope\.cn\/models\/FunAudioLLM/);
  assert.match(transcriptionBackendSource, /runtime-llamacpp-v0\.2\.0/);
  assert.match(transcriptionBackendSource, /async fn transcribe_local_funasr/);
  assert.match(transcriptionBackendSource, /async fn transcribe_local_firered/);
  assert.match(transcriptionBackendSource, /prepare_firered_runtime/);
  assert.match(transcriptionBackendSource, /modelscope\.cn\/models\/xukaituo\/FireRedASR2/);
  assert.match(transcriptionBackendSource, /FireRedASR2S\/archive\/4e7d9aaf/);
  assert.doesNotMatch(transcriptionSettingsSource, /externalOnly/);
  assert.doesNotMatch(transcriptionSettingsSource, /flux-general-en|flux-general/);
});

test('video is a bundled fallback plugin backed by guarded shared tools', () => {
  assert.match(videoManifest, /"id": "coffee-video"/);
  assert.match(videoManifest, /"id": "coffee-video-engine"/);
  assert.match(videoManifest, /"categoryId": "video"/);
  assert.match(videoManifest, /"id": "coffee-note-video-storyboard"/);
  assert.match(videoManifest, /电影分镜导演/);
  assert.match(videoSkill, /generate_image/);
  assert.match(videoSkill, /create_video/);
  assert.match(videoSkill, /Never install a/);
  assert.match(videoSkill, /Cinematic storyboard specification/);
  assert.match(storyboardSkill, /name: storyboard-director/);
  assert.match(storyboardSkill, /keyframe prompt/);
  assert.match(storyboardSkill, /motion prompt/);
  assert.match(storyboardSpec, /Movement is a response to change/);
  assert.match(storyboardSpec, /continuity bible/i);
  assert.match(rustSource, /BUILTIN_VIDEO_STORYBOARD_SPEC/);
  assert.match(rustSource, /coffee-note-video-storyboard/);
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

test('documents are two bundled skills backed by one native DOCX and PDF runtime', () => {
  assert.match(documentManifest, /"id": "coffee-documents"/);
  assert.match(documentManifest, /"id": "document-engine"/);
  assert.match(documentManifest, /coffee-note-document-create-docx/);
  assert.match(documentManifest, /coffee-note-document-create-pdf/);
  assert.match(documentManifest, /"skillCount"|"skills"/);
  assert.match(docxSkill, /create_document/);
  assert.match(docxSkill, /format` set to `docx/);
  assert.match(pdfSkill, /create_document/);
  assert.match(pdfSkill, /format` set to `pdf/);
  assert.match(documentSource, /fn write_docx/);
  assert.match(documentSource, /fn write_pdf/);
  assert.match(documentSource, /WordprocessingML|word\/document\.xml/);
  assert.match(documentSource, /add_external_font_with_subsetting/);
  assert.match(agentSource, /document_docx: crate::skills::builtin_tool_enabled\("create_docx"\)/);
  assert.match(agentSource, /document_pdf: crate::skills::builtin_tool_enabled\("create_pdf"\)/);
  assert.match(appSource, /create_document/);
});

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { fallbackLibrary, fallbackMarkdown } from './data';
import type {
  CaptureDraft,
  CaptureRequest,
  ChatRequest,
  ConversationRecord,
  ConversationSummary,
  FileContent,
  LibrarySnapshot,
  MemoryItem,
  MemorySuggestion,
  ModelCatalog,
  ModelSettings,
  ImageCapabilityConfig,
  ImageCapabilityMode,
  ImageCheckResult,
  ImageSettingsConfig,
  GeneratedFilesSettings,
  PrepareCaptureRequest,
  SkillCatalog,
  SkillSourceDraft,
  TranscriptionCheckResult,
  TranscriptionSettingsConfig,
  TranscriptionResourceProgress,
  TranscriptionResourceStatus,
  TranscriptionStorageInfo,
  MessageSettingsConfig,
  MessageChannelStatus,
  WeixinLoginStart,
  WeixinLoginPoll,
  Locale,
} from './types';
import { normalizeModelSettings } from './modelSettings';
import { normalizeModelCatalog } from './modelCatalog';
import { readStorageValue, storageKey, writeStorageValue } from './storage';

const MODEL_CONFIG_KEY = storageKey('model-config');
const TRANSCRIPTION_CONFIG_KEY = storageKey('transcription-config');
const IMAGE_SETTINGS_CONFIG_KEY = storageKey('image-settings');
const LEGACY_MULTIMODAL_CONFIG_KEY = storageKey('multimodal-config');
const CAPTURES_KEY = storageKey('captures');
const SKILLS_KEY = storageKey('skill-sources-v2');

const fallbackSkillCatalog: SkillCatalog = {
  categories: [
    { id: 'copywriting', label: '文案编写', fixed: true },
    { id: 'ppt', label: '制作PPT', fixed: true },
    { id: 'video', label: '制作视频', fixed: true },
    { id: 'media', label: '音视频', fixed: true },
  ],
  skills: [
    {
      id: 'coffee-note-media-transcribe',
      title: '媒体转文字',
      description: '把视频或音频链接、本地媒体文件转成文字，并整理成笔记。',
      categoryId: 'media',
      codexCompatible: true,
      sourceId: 'coffee-media',
      sourceUrl: '',
      sourceVersion: '1.0.0',
      enabled: true,
      builtin: true,
      runtimeId: 'media-transcription',
    },
    {
      id: 'coffee-note-presentation-create',
      title: '生成演示文稿',
      description: '从笔记、选中文档或对话内容生成可编辑的 .pptx 文件。',
      categoryId: 'ppt',
      codexCompatible: true,
      sourceId: 'coffee-presentation',
      sourceUrl: '',
      sourceVersion: '1.0.0',
      enabled: true,
      builtin: true,
      runtimeId: 'presentation-engine',
    },
    {
      id: 'coffee-note-document-create-docx',
      title: '生成 DOCX',
      description: '从笔记、资料或对话内容生成结构清晰、可继续编辑的 Word 文档。',
      categoryId: 'copywriting',
      codexCompatible: true,
      sourceId: 'coffee-documents',
      sourceUrl: '',
      sourceVersion: '1.0.0',
      enabled: true,
      builtin: true,
      runtimeId: 'document-engine',
    },
    {
      id: 'coffee-note-document-create-pdf',
      title: '生成 PDF',
      description: '从笔记、资料或对话内容生成排版清晰、可直接分享的 PDF。',
      categoryId: 'copywriting',
      codexCompatible: true,
      sourceId: 'coffee-documents',
      sourceUrl: '',
      sourceVersion: '1.0.0',
      enabled: true,
      builtin: true,
      runtimeId: 'document-engine',
    },
  ],
  plugins: [
    {
      id: 'coffee-media',
      name: '媒体处理',
      description: '把音视频内容转换为可编辑、可继续整理的本地文字。',
      version: '1.0.0',
      categoryId: 'media',
      codexCompatible: true,
      sourceUrl: '',
      skillCount: 1,
      enabled: true,
      builtin: true,
      publisher: 'TierNote',
      origin: 'bundled',
      runtimeId: 'media-transcription',
    },
    {
      id: 'coffee-presentation',
      name: '演示文稿',
      description: '把笔记、资料和想法整理为结构清晰、可继续编辑的 PowerPoint 演示文稿。',
      version: '1.0.0',
      categoryId: 'ppt',
      codexCompatible: true,
      sourceUrl: '',
      skillCount: 1,
      enabled: true,
      builtin: true,
      publisher: 'TierNote',
      origin: 'bundled',
      runtimeId: 'presentation-engine',
    },
    {
      id: 'coffee-documents',
      name: '文档生成',
      description: '把笔记、资料和对话内容整理为可编辑的 Word 文档或可直接分享的 PDF。',
      version: '1.0.0',
      categoryId: 'copywriting',
      codexCompatible: true,
      sourceUrl: '',
      skillCount: 2,
      enabled: true,
      builtin: true,
      publisher: 'TierNote',
      origin: 'bundled',
      runtimeId: 'document-engine',
    },
  ],
  icons: {},
};

function normalizeFallbackSkillCatalog(catalog: SkillCatalog): SkillCatalog {
  const builtinPlugins = fallbackSkillCatalog.plugins.map((fallback) => {
    const existing = catalog.plugins.find((plugin) => (
      plugin.id === fallback.id
      || (fallback.id === 'coffee-media' && plugin.id === 'coffee-note-media-transcribe')
    ));
    return {
      ...fallback,
      ...existing,
      id: fallback.id,
      builtin: true,
      publisher: existing?.publisher ?? 'TierNote',
      origin: 'bundled' as const,
    };
  });
  const builtinSkills = fallbackSkillCatalog.skills.map((fallback) => {
    const existing = catalog.skills.find((skill) => skill.id === fallback.id);
    const plugin = builtinPlugins.find((item) => item.id === fallback.sourceId);
    return {
      ...fallback,
      ...existing,
      enabled: existing?.enabled !== false && plugin?.enabled !== false,
      builtin: true,
      sourceId: fallback.sourceId,
    };
  });
  const builtinSkillIds = new Set(builtinSkills.map((skill) => skill.id));
  const builtinPluginIds = new Set(builtinPlugins.flatMap((plugin) => (
    plugin.id === 'coffee-media' ? [plugin.id, 'coffee-note-media-transcribe'] : [plugin.id]
  )));
  const fixedCategoryIds = new Set(fallbackSkillCatalog.categories.map((category) => category.id));
  const categories = [
    ...fallbackSkillCatalog.categories.map((fallback) => ({
      ...fallback,
      ...catalog.categories.find((category) => category.id === fallback.id),
      fixed: true,
    })),
    ...catalog.categories.filter((category) => !fixedCategoryIds.has(category.id)),
  ];
  return {
    ...catalog,
    categories,
    skills: [...builtinSkills, ...catalog.skills.filter((item) => !builtinSkillIds.has(item.id))],
    plugins: [...builtinPlugins, ...catalog.plugins.filter((item) => !builtinPluginIds.has(item.id))],
    icons: catalog.icons ?? {},
  };
}

function readFallbackSkillCatalog(): SkillCatalog {
  try {
    const stored = readStorageValue(SKILLS_KEY);
    if (!stored) return structuredClone(fallbackSkillCatalog);
    const catalog = JSON.parse(stored) as SkillCatalog;
    catalog.plugins = (catalog.plugins ?? []).map((plugin) => ({
      ...plugin,
      enabled: plugin.enabled !== false,
      publisher: plugin.publisher || (plugin.builtin ? 'TierNote' : 'Community'),
      origin: plugin.origin || (plugin.builtin ? 'bundled' : 'git'),
    }));
    catalog.skills = (catalog.skills ?? []).map((skill) => ({
      ...skill,
      enabled: skill.enabled !== false,
    }));
    return normalizeFallbackSkillCatalog(catalog);
  } catch {
    return structuredClone(fallbackSkillCatalog);
  }
}

function writeFallbackSkillCatalog(catalog: SkillCatalog): SkillCatalog {
  writeStorageValue(SKILLS_KEY, JSON.stringify(catalog));
  return catalog;
}

export const isTauri = '__TAURI_INTERNALS__' in window;

export async function setTrayLocale(locale: 'zh' | 'en'): Promise<void> {
  if (!isTauri) return;
  await invoke('set_tray_locale', { locale });
}

export async function openExternalUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`);
  }

  if (isTauri) {
    await openUrl(parsed.href);
    return;
  }

  window.open(parsed.href, '_blank', 'noopener,noreferrer');
}

export async function revealInFolder(path: string): Promise<void> {
  if (!isTauri) return;
  await revealItemInDir(path);
}

export interface SelfUpdateProgress {
  status: 'checking' | 'downloading' | 'launching' | 'error';
  percent: number;
}

export async function checkForUpdate(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>('check_for_update');
}

export async function downloadAndInstallUpdate(): Promise<void> {
  if (!isTauri) {
    throw new Error('Self-update is only available in the desktop app.');
  }
  await invoke('download_and_install_update');
}

export async function onSelfUpdateProgress(
  callback: (progress: SelfUpdateProgress) => void,
): Promise<() => void> {
  return listen<SelfUpdateProgress>('self-update-progress', (event) => callback(event.payload));
}

export async function loadModelConfig(): Promise<ModelSettings | null> {
  if (!isTauri) {
    try {
      const stored = readStorageValue(MODEL_CONFIG_KEY);
      return stored ? normalizeModelSettings(JSON.parse(stored)) : null;
    } catch {
      return null;
    }
  }
  const stored = await invoke<unknown | null>('load_model_config');
  return stored ? normalizeModelSettings(stored) : null;
}

export async function persistModelConfig(config: ModelSettings): Promise<void> {
  if (!isTauri) {
    writeStorageValue(MODEL_CONFIG_KEY, JSON.stringify(config));
    return;
  }
  await invoke('save_model_config', { config });
}

export async function listSkills(): Promise<SkillCatalog> {
  if (!isTauri) return readFallbackSkillCatalog();
  return invoke<SkillCatalog>('list_skills');
}

export async function addSkillSource(draft: SkillSourceDraft): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const repositoryName = draft.sourceUrl
      .trim()
      .replace(/\/$/, '')
      .split('/')
      .at(-1)
      ?.replace(/\.git$/i, '');
    const title = repositoryName || 'Imported skill';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `skill-${crypto.randomUUID().slice(0, 8)}`;
    let id = slug;
    let suffix = 2;
    while (catalog.plugins.some((plugin) => plugin.id === id)) id = `${slug}-${suffix++}`;
    const sourceUrl = draft.sourceUrl.trim();
    catalog.skills.push({
      id,
      title,
      description: '从 Git 来源读取的技能。',
      categoryId: draft.categoryId,
      codexCompatible: true,
      sourceId: id,
      sourceUrl,
      sourceVersion: 'preview',
      enabled: true,
    });
    catalog.plugins.push({
      id,
      name: title,
      description: '从 Git 来源读取的技能插件。',
      version: 'preview',
      categoryId: draft.categoryId,
      codexCompatible: true,
      sourceUrl,
      skillCount: 1,
      enabled: true,
      publisher: 'Community',
      origin: 'git',
    });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('add_skill_source', { draft });
}

export async function updateSkillFromSource(id: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const plugin = catalog.plugins.find((item) => item.id === id);
    if (!plugin) throw new Error('Skill source not found');
    plugin.version = 'preview';
    catalog.skills
      .filter((skill) => skill.sourceId === id)
      .forEach((skill) => { skill.sourceVersion = 'preview'; });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('update_skill_source', { id });
}

export async function deleteSkillSource(id: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    catalog.plugins = catalog.plugins.filter((plugin) => plugin.id !== id);
    catalog.skills = catalog.skills.filter((skill) => skill.sourceId !== id);
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('delete_skill_source', { id });
}

export async function moveSkillSource(id: string, categoryId: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const plugin = catalog.plugins.find((item) => item.id === id);
    if (!plugin) throw new Error('Skill source not found');
    plugin.categoryId = categoryId;
    catalog.skills
      .filter((skill) => skill.sourceId === id)
      .forEach((skill) => { skill.categoryId = categoryId; });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('move_skill_source', { id, categoryId });
}

export async function setSkillSourceEnabled(id: string, enabled: boolean): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const plugin = catalog.plugins.find((item) => item.id === id);
    if (!plugin) throw new Error('Skill source not found');
    plugin.enabled = enabled;
    catalog.skills
      .filter((skill) => skill.sourceId === id)
      .forEach((skill) => { skill.enabled = enabled; });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('set_skill_source_enabled', { id, enabled });
}

export async function loadGeneratedFilesSettings(
  workspaceRoot: string,
): Promise<GeneratedFilesSettings> {
  if (!isTauri) {
    return { directory: workspaceRoot || 'Workspace', usesWorkspaceDefault: true };
  }
  return invoke<GeneratedFilesSettings>('load_generated_files_settings', { workspaceRoot });
}

export async function chooseGeneratedFilesDirectory(
  currentDirectory?: string,
): Promise<string | null> {
  if (!isTauri) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: currentDirectory,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function saveGeneratedFilesDirectory(
  directory: string | null,
  workspaceRoot: string,
): Promise<GeneratedFilesSettings> {
  if (!isTauri) {
    return {
      directory: directory || workspaceRoot || 'Workspace',
      usesWorkspaceDefault: !directory,
    };
  }
  return invoke<GeneratedFilesSettings>('save_generated_files_directory', {
    directory,
    workspaceRoot,
  });
}

export async function setSkillEnabled(id: string, sourceId: string, enabled: boolean): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const skill = catalog.skills.find((item) => item.id === id);
    if (!skill) throw new Error('Skill not found');
    if (!skill.builtin && skill.sourceId !== sourceId) throw new Error('Skill not found in the selected source');
    skill.enabled = enabled;
    if (skill.builtin) {
      const plugin = catalog.plugins.find((item) => item.id === skill.sourceId);
      if (plugin) plugin.enabled = enabled;
    }
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('set_skill_enabled', { id, sourceId, enabled });
}

export async function loadMessageSettings(): Promise<MessageSettingsConfig | null> {
  if (!isTauri) return null;
  return invoke<MessageSettingsConfig>('load_message_settings');
}

export async function getMessageChannelStatus(): Promise<MessageChannelStatus> {
  if (!isTauri) {
    return {
      weixin: 'disconnected',
      telegram: 'disconnected',
      weixinError: '',
      telegramError: '',
      activeJobs: 0,
    };
  }
  return invoke<MessageChannelStatus>('message_channel_status');
}

export async function updateMessageContext(
  knowledgeRoot: string,
  locale: Locale,
): Promise<void> {
  if (!isTauri) return;
  await invoke('update_message_context', { knowledgeRoot, locale });
}

export async function updateMessageTranscriptionMode(
  transcriptionMode: 'api' | 'local',
): Promise<void> {
  if (!isTauri) return;
  await invoke('update_message_transcription_mode', { transcriptionMode });
}

export async function startWeixinLogin(): Promise<WeixinLoginStart> {
  return invoke<WeixinLoginStart>('start_weixin_login');
}

export async function pollWeixinLogin(
  sessionId: string,
  verifyCode?: string,
): Promise<WeixinLoginPoll> {
  return invoke<WeixinLoginPoll>('poll_weixin_login', { sessionId, verifyCode });
}

export async function disconnectWeixin(): Promise<void> {
  await invoke('disconnect_weixin');
}

export async function connectTelegram(botToken: string): Promise<MessageSettingsConfig> {
  return invoke<MessageSettingsConfig>('connect_telegram', { botToken });
}

export async function disconnectTelegram(): Promise<void> {
  await invoke('disconnect_telegram');
}

export async function listenMessageChannelStatus(handler: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen('message-channel-status', handler);
}

export async function listenMessageCaptureSaved(handler: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen('message-capture-saved', handler);
}

export async function listenMessageConversationUpdated(
  handler: (conversationId: string) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<string>('message-conversation-updated', (event) => handler(event.payload));
}

export async function setBuiltinPluginEnabled(id: string, enabled: boolean): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const plugin = catalog.plugins.find((item) => item.id === id && item.builtin);
    if (!plugin) throw new Error('Built-in plugin not found');
    plugin.enabled = enabled;
    catalog.skills
      .filter((item) => item.sourceId === id)
      .forEach((skill) => { skill.enabled = enabled; });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('set_builtin_plugin_enabled', { id, enabled });
}

export async function setBuiltinSkillEnabled(enabled: boolean): Promise<SkillCatalog> {
  return setBuiltinPluginEnabled('coffee-media', enabled);
}

export async function createSkillCategory(label: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    catalog.categories.push({
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      label: label.trim(),
      fixed: false,
    });
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('create_skill_category', { label });
}

export async function renameSkillCategory(id: string, label: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    const category = catalog.categories.find((item) => item.id === id && !item.fixed);
    if (!category) throw new Error('Only custom categories can be renamed');
    category.label = label.trim();
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('rename_skill_category', { id, label });
}

export async function deleteSkillCategory(id: string): Promise<SkillCatalog> {
  if (!isTauri) {
    const catalog = readFallbackSkillCatalog();
    if (catalog.plugins.some((plugin) => plugin.categoryId === id)) {
      throw new Error('Move or delete the skill sources in this category first');
    }
    catalog.categories = catalog.categories.filter((category) => category.id !== id || category.fixed);
    return writeFallbackSkillCatalog(catalog);
  }
  return invoke<SkillCatalog>('delete_skill_category', { id });
}

export async function loadLibrary(root: string | undefined, locale: 'zh' | 'en'): Promise<LibrarySnapshot> {
  if (!isTauri) {
    return { ...fallbackLibrary, root: root || fallbackLibrary.root };
  }
  return invoke<LibrarySnapshot>('load_library', { root: root || null, locale });
}

export async function loadTranscriptionConfig(): Promise<TranscriptionSettingsConfig | null> {
  if (!isTauri) {
    try {
      const stored = readStorageValue(TRANSCRIPTION_CONFIG_KEY);
      return stored ? JSON.parse(stored) as TranscriptionSettingsConfig : null;
    } catch {
      return null;
    }
  }
  return invoke<TranscriptionSettingsConfig | null>('load_transcription_config');
}

export async function persistTranscriptionConfig(config: TranscriptionSettingsConfig): Promise<void> {
  if (!isTauri) {
    writeStorageValue(TRANSCRIPTION_CONFIG_KEY, JSON.stringify(config));
    return;
  }
  await invoke('save_transcription_config', { config });
}

export async function checkTranscriptionConfig(config: TranscriptionSettingsConfig): Promise<TranscriptionCheckResult> {
  if (!isTauri) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { ok: true, message: 'Browser preview configuration accepted.' };
  }
  return invoke<TranscriptionCheckResult>('check_transcription_config', { config });
}

export async function loadImageSettings(): Promise<ImageSettingsConfig | null> {
  if (!isTauri) {
    try {
      const stored = readStorageValue(IMAGE_SETTINGS_CONFIG_KEY);
      if (stored) return JSON.parse(stored) as ImageSettingsConfig;
      const legacy = readStorageValue(LEGACY_MULTIMODAL_CONFIG_KEY);
      if (!legacy) return null;
      const recognition = JSON.parse(legacy) as ImageCapabilityConfig;
      return {
        recognition,
        generation: { activeProvider: '', providers: {} },
        speech: { activeProvider: '', providers: {} },
        video: { activeProvider: '', providers: {} },
        music: { activeProvider: '', providers: {} },
        sound: { activeProvider: '', providers: {} },
      };
    } catch {
      return null;
    }
  }
  return invoke<ImageSettingsConfig | null>('load_image_settings');
}

export async function persistImageSettings(config: ImageSettingsConfig): Promise<void> {
  if (!isTauri) {
    writeStorageValue(IMAGE_SETTINGS_CONFIG_KEY, JSON.stringify(config));
    return;
  }
  await invoke('save_image_settings', { config });
}

export async function checkImageSettings(
  config: ImageSettingsConfig,
  mode: ImageCapabilityMode,
): Promise<ImageCheckResult> {
  if (!isTauri) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { ok: true, message: 'Browser preview configuration accepted.' };
  }
  return invoke<ImageCheckResult>('check_image_settings', { config, mode });
}

export async function listTranscriptionResources(): Promise<TranscriptionResourceStatus[]> {
  if (!isTauri) return [];
  return invoke<TranscriptionResourceStatus[]>('list_transcription_resources');
}

export async function getTranscriptionStorage(runtimeId: string): Promise<TranscriptionStorageInfo | null> {
  if (!isTauri) return null;
  return invoke<TranscriptionStorageInfo>('get_transcription_storage', { runtimeId });
}

export async function chooseTranscriptionStorageDirectory(): Promise<string | null> {
  if (!isTauri) return null;
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

export async function setTranscriptionStorageDirectory(runtimeId: string, directory: string): Promise<TranscriptionStorageInfo> {
  if (!isTauri) throw new Error('Storage settings are only available in the desktop app.');
  return invoke<TranscriptionStorageInfo>('set_transcription_storage_directory', { runtimeId, directory });
}

export async function openTranscriptionStorageDirectory(runtimeId: string): Promise<void> {
  if (!isTauri) return;
  await invoke('open_transcription_storage_directory', { runtimeId });
}

export async function resolveTranscriptionResourceSource(
  kind: 'runtime' | 'model',
  id: string,
): Promise<string> {
  if (!isTauri) throw new Error('Automatic source selection is only available in the desktop app.');
  return invoke<string>('resolve_transcription_resource_source', { kind, id });
}

export async function downloadTranscriptionResource(kind: 'runtime' | 'model', id: string, runtimeId: string): Promise<void> {
  if (!isTauri) throw new Error('Resource downloads are only available in the desktop app.');
  await invoke('download_transcription_resource', { kind, id, runtimeId });
}

export async function cancelTranscriptionDownload(kind: 'runtime' | 'model', id: string, runtimeId: string): Promise<void> {
  if (!isTauri) return;
  await invoke('cancel_transcription_download', { kind, id, runtimeId });
}

export async function removeTranscriptionResource(kind: 'runtime' | 'model', id: string, runtimeId: string): Promise<void> {
  if (!isTauri) return;
  await invoke('remove_transcription_resource', { kind, id, runtimeId });
}

export async function onTranscriptionResourceProgress(
  callback: (progress: TranscriptionResourceProgress) => void,
): Promise<() => void> {
  if (!isTauri) return () => undefined;
  return listen<TranscriptionResourceProgress>('transcription-resource-progress', (event) => callback(event.payload));
}

export async function loadModelCatalog(refresh = false): Promise<ModelCatalog> {
  // The provider/model directory ships with the app; it never hits the
  // network. The browser build imports the bundled catalog JSON directly,
  // and the Tauri build reads the same bundled resource from the backend.
  if (!isTauri) {
    const response = await fetch('/model-catalog.json');
    if (!response.ok) throw new Error(`Could not load the bundled model catalog (HTTP ${response.status})`);
    return normalizeModelCatalog(await response.json());
  }
  return normalizeModelCatalog(await invoke<unknown>('load_model_catalog', { refresh }));
}

export interface GraphDiagnostics {
  noteCount: number;
  edgeCount: number;
  brokenLinks: string[];
  orphanNotes: string[];
  registryFresh: boolean;
}

export async function inspectLibraryGraph(
  root: string,
  locale: 'zh' | 'en',
): Promise<GraphDiagnostics> {
  if (!isTauri) {
    return {
      noteCount: 0,
      edgeCount: 0,
      brokenLinks: [],
      orphanNotes: [],
      registryFresh: false,
    };
  }
  return invoke<GraphDiagnostics>('inspect_library_graph', { root, locale });
}

export async function moveTierItem(
  root: string,
  itemId: string,
  targetTier: string,
  targetIndex: number,
): Promise<void> {
  if (!isTauri) return;
  await invoke('move_tier_item', { root, itemId, targetTier, targetIndex });
}

export async function readNote(root: string, relativePath: string): Promise<string> {
  if (!isTauri) {
    return (
      fallbackMarkdown[relativePath] ||
      `# ${relativePath.split('/').pop()?.replace('.md', '') || 'Note'}\n\n这篇笔记会从你的本地知识库读取。`
    );
  }
  return invoke<string>('read_note', { root, relativePath });
}

export async function writeNote(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (!isTauri) {
    throw new Error('Editing notes is only available in the desktop app.');
  }
  await invoke('write_note', { root, relativePath, content });
}

export async function openNote(root: string, relativePath: string): Promise<void> {
  if (!isTauri) {
    throw new Error('Opening notes is only available in the desktop app.');
  }
  await invoke('open_note', { root, relativePath });
}

export async function deleteNote(root: string, relativePath: string): Promise<void> {
  if (!isTauri) {
    throw new Error('Deleting notes is only available in the desktop app.');
  }
  await invoke('delete_note', { root, relativePath });
}

export async function setNoteTier(
  root: string,
  relativePath: string,
  tier: string,
): Promise<void> {
  if (!isTauri) {
    throw new Error('Setting a priority is only available in the desktop app.');
  }
  await invoke('set_note_tier', { root, relativePath, tier });
}

export interface DirectoryEntry {
  name: string;
  relativePath: string;
  isDir: boolean;
  isMarkdown: boolean;
  icon?: string;
}

export async function listDirectory(
  root: string,
  relativePath: string,
): Promise<DirectoryEntry[]> {
  if (!isTauri) return [];
  return invoke<DirectoryEntry[]>('list_directory', { root, relativePath });
}

export async function createFolder(
  root: string,
  parentRelative: string,
  name: string,
): Promise<string> {
  if (!isTauri) throw new Error('File operations are only available in the desktop app.');
  return invoke<string>('create_folder', { root, parentRelative, name });
}

export async function createNote(
  root: string,
  parentRelative: string,
  name: string,
  icon?: string,
): Promise<string> {
  if (!isTauri) throw new Error('File operations are only available in the desktop app.');
  return invoke<string>('create_note', { root, parentRelative, name, icon: icon || null });
}

export async function renameEntry(
  root: string,
  relativePath: string,
  newName: string,
): Promise<string> {
  if (!isTauri) throw new Error('File operations are only available in the desktop app.');
  return invoke<string>('rename_entry', { root, relativePath, newName });
}

export async function deleteEntry(root: string, relativePath: string): Promise<void> {
  if (!isTauri) throw new Error('File operations are only available in the desktop app.');
  await invoke('delete_entry', { root, relativePath });
}

export async function pasteEntry(
  root: string,
  sourceRelative: string,
  targetDirRelative: string,
  action: 'copy' | 'cut',
): Promise<string> {
  if (!isTauri) throw new Error('File operations are only available in the desktop app.');
  return invoke<string>('paste_entry', { root, sourceRelative, targetDirRelative, action });
}

export async function chooseKnowledgeFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

export async function chooseImportFile(): Promise<string | null> {
  if (!isTauri) return null;
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Documents',
        extensions: [
          'txt', 'md', 'markdown', 'text', 'log', 'csv', 'tsv', 'json', 'yaml', 'yml',
          'html', 'htm', 'docx', 'pptx', 'xlsx', 'pdf',
          'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp',
        ],
      },
    ],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function readFileContent(path: string): Promise<FileContent> {
  if (!isTauri) {
    return {
      kind: 'text',
      text: `[Browser preview] Reading local files is not available outside the Tauri app.\nRequested: ${path}`,
      imagePath: undefined,
      label: path.split(/[\\/]/).pop() ?? path,
      extension: (path.split('.').pop() ?? '').toLowerCase(),
    };
  }
  return invoke<FileContent>('read_file_content', { path });
}

export async function saveCapture(request: CaptureRequest): Promise<string> {
  if (!isTauri) {
    const captures = JSON.parse(readStorageValue(CAPTURES_KEY) || '[]');
    captures.push({ ...request, createdAt: Date.now() });
    writeStorageValue(CAPTURES_KEY, JSON.stringify(captures));
    return 'prototype/workspace-root';
  }
  return invoke<string>('save_capture', { request });
}

export async function prepareCapture(request: PrepareCaptureRequest): Promise<CaptureDraft> {
  if (!isTauri) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const sourceUrl = /^https?:\/\/\S+$/i.test(request.input.trim())
      ? request.input.trim()
      : undefined;
    return {
      title: request.locale === 'zh' ? '待整理的笔记' : 'Note to organize',
      content:
        request.locale === 'zh'
          ? `## 原始资料\n\n${request.input.trim()}\n\n## 待核查事项\n\n- 浏览器预览不会调用模型或抓取网页。`
          : `## Source material\n\n${request.input.trim()}\n\n## Items to verify\n\n- The browser preview does not call a model or fetch webpages.`,
      sourceUrl,
    };
  }
  return invoke<CaptureDraft>('prepare_capture', { request });
}

export async function chatCompletion(request: ChatRequest): Promise<string> {
  if (!isTauri) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return request.locale === 'zh'
      ? '当前浏览器预览已连接界面与本地示例数据。安装桌面版后，我会先检索相关笔记，再基于命中的本地内容回答。'
      : 'This browser preview is wired to sample local data. In the desktop app, I first retrieve relevant notes and answer from the local context that matches your question.';
  }
  return invoke<string>('chat_completion', { request });
}

// ── Agent API ──

import type { AgentEvent, AgentRequest } from './types';

export async function sendAgentMessage(request: AgentRequest): Promise<string> {
  if (!isTauri) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return 'ok';
  }
  return invoke<string>('agent_send_message', { request });
}

export async function listenAgentEvents(
  handler: (event: AgentEvent) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<AgentEvent>('agent_event', (e) => handler(e.payload));
}

export async function abortAgent(conversationId?: string): Promise<boolean> {
  if (!isTauri) return false;
  return invoke<boolean>('agent_abort', { conversationId });
}

export async function listConversations(): Promise<ConversationSummary[]> {
  if (!isTauri) return [];
  return invoke<ConversationSummary[]>('list_conversations');
}

export async function createConversation(title?: string): Promise<ConversationSummary> {
  if (!isTauri) {
    const timestamp = Date.now();
    return {
      id: crypto.randomUUID(),
      title: title || 'New conversation',
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: 0,
      estimatedContextBytes: 0,
    };
  }
  return invoke<ConversationSummary>('create_conversation', { title });
}

export async function loadConversation(id: string): Promise<ConversationRecord> {
  if (!isTauri) {
    const timestamp = Date.now();
    return {
      id,
      title: 'New conversation',
      createdAt: timestamp,
      updatedAt: timestamp,
      uiMessages: [],
    };
  }
  return invoke<ConversationRecord>('load_conversation', { id });
}

export async function renameConversation(id: string, title: string): Promise<string> {
  if (!isTauri) {
    const characters = Array.from(title.trim());
    return characters.length > 20 ? `${characters.slice(0, 20).join('')}…` : characters.join('');
  }
  return invoke<string>('rename_conversation', { id, title });
}

export async function getConversationFilePath(id: string): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string>('conversation_file_path', { id });
}

export async function saveConversationUi(
  id: string,
  uiMessages: ConversationRecord['uiMessages'],
  title: string | undefined,
  estimatedContextBytes: number,
): Promise<ConversationSummary> {
  if (!isTauri) {
    const timestamp = Date.now();
    return {
      id,
      title: title || 'New conversation',
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: uiMessages.length,
      estimatedContextBytes,
    };
  }
  return invoke<ConversationSummary>('save_conversation_ui', {
    id,
    uiMessages,
    title,
    estimatedContextBytes,
  });
}

export async function deleteConversation(id: string): Promise<ConversationSummary[]> {
  if (!isTauri) return [];
  return invoke<ConversationSummary[]>('delete_conversation', { id });
}

export async function confirmMemorySuggestion(
  suggestion: MemorySuggestion,
): Promise<MemoryItem> {
  if (!isTauri) {
    const timestamp = Date.now();
    return { ...suggestion, createdAt: timestamp, updatedAt: timestamp };
  }
  return invoke<MemoryItem>('confirm_memory_suggestion', { suggestion });
}

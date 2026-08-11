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
  LibrarySnapshot,
  MemoryItem,
  MemorySuggestion,
  ModelCatalog,
  ModelSettings,
  PrepareCaptureRequest,
  TranscriptionCheckResult,
  TranscriptionSettingsConfig,
  TranscriptionResourceProgress,
  TranscriptionResourceStatus,
} from './types';
import { normalizeModelSettings } from './modelSettings';
import { normalizeModelCatalog } from './modelCatalog';
import { readStorageValue, storageKey, writeStorageValue } from './storage';

const MODEL_CONFIG_KEY = storageKey('model-config');
const TRANSCRIPTION_CONFIG_KEY = storageKey('transcription-config');
const CAPTURES_KEY = storageKey('captures');

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

export async function listTranscriptionResources(): Promise<TranscriptionResourceStatus[]> {
  if (!isTauri) return [];
  return invoke<TranscriptionResourceStatus[]>('list_transcription_resources');
}

export async function downloadTranscriptionResource(kind: 'runtime' | 'model', id: string): Promise<void> {
  if (!isTauri) throw new Error('Resource downloads are only available in the desktop app.');
  await invoke('download_transcription_resource', { kind, id });
}

export async function cancelTranscriptionDownload(kind: 'runtime' | 'model', id: string): Promise<void> {
  if (!isTauri) return;
  await invoke('cancel_transcription_download', { kind, id });
}

export async function removeTranscriptionResource(kind: 'runtime' | 'model', id: string): Promise<void> {
  if (!isTauri) return;
  await invoke('remove_transcription_resource', { kind, id });
}

export async function onTranscriptionResourceProgress(
  callback: (progress: TranscriptionResourceProgress) => void,
): Promise<() => void> {
  if (!isTauri) return () => undefined;
  return listen<TranscriptionResourceProgress>('transcription-resource-progress', (event) => callback(event.payload));
}

export async function loadModelCatalog(refresh = false): Promise<ModelCatalog> {
  if (!isTauri) {
    const response = await fetch('https://models.dev/api.json', { cache: refresh ? 'reload' : 'default' });
    if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`);
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

export async function saveCapture(request: CaptureRequest): Promise<string> {
  if (!isTauri) {
    const captures = JSON.parse(readStorageValue(CAPTURES_KEY) || '[]');
    captures.push({ ...request, createdAt: Date.now() });
    writeStorageValue(CAPTURES_KEY, JSON.stringify(captures));
    return 'prototype/inbox';
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

export async function resetAgent(conversationId?: string): Promise<string> {
  if (!isTauri) return 'ok';
  return invoke<string>('agent_reset', { conversationId });
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

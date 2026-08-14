import {
  ArrowRight,
  BookOpen,
  Bot,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Activity,
  AudioLines,
  Dumbbell,
  FolderOpen,
  Github,
  Globe2,
  Hash,
  House,
  Layers3,
  ListChecks,
  LoaderCircle,
  MessageCircleMore,
  Minus,
  Monitor,
  Smartphone,
  Moon,
  ChevronDown,
  NotebookPen,
  Pill,
  Plus,
  Download,
  ArrowUp,
  Pencil,
  Presentation,
  Video,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  Scissors,
  Copy,
  ClipboardPaste,
  FolderSearch,
  Link2,
  Target,
  Lightbulb,
  Archive,
  Settings,
  ShieldAlert,
  Settings2,
  Square,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Utensils,
  UserRound,
  UsersRound,
  Wrench,
  X,
  Redo2,
  RefreshCw,
  Search,
  ExternalLink,
  Undo2,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm } from '@tauri-apps/plugin-dialog';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import React, {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPortal } from 'react-dom';
import { EditorView } from 'codemirror';
import { EditorSelection, EditorState } from '@codemirror/state';
import {
  dropCursor,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo as cmRedo,
  undo as cmUndo,
} from '@codemirror/commands';
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown as markdownLanguage } from '@codemirror/lang-markdown';
import packageMetadata from '../package.json';
import {
  checkForUpdate,
  chooseKnowledgeFolder,
  downloadAndInstallUpdate,
  isTauri,
  loadModelConfig,
  loadModelCatalog,
  listSkills,
  loadLibrary,
  moveTierItem,
  onSelfUpdateProgress,
  openExternalUrl,
  persistModelConfig,
  readNote,
  writeNote,
  chooseImportFile,
  sendAgentMessage,
  listenAgentEvents,
  abortAgent,
  listConversations,
  loadConversation,
  renameConversation,
  getConversationFilePath,
  updateMessageContext,
  getMessageChannelStatus,
  listenMessageChannelStatus,
  listenMessageCaptureSaved,
  listenMessageConversationUpdated,
  saveConversationUi,
  createConversation,
  deleteConversation,
  confirmMemorySuggestion,
  deleteNote,
  setNoteTier,
  setTrayLocale,
  listDirectory,
  createFolder,
  createNote,
  renameEntry,
  deleteEntry,
  pasteEntry,
  revealInFolder,
  chatCompletion,
  type DirectoryEntry,
} from './api';
import {
  AGENT_CONTEXT_MAX_BYTES,
  estimateContextBytes,
} from './chat/contextUsage';
import { fallbackLibrary, fallbackMarkdown } from './data';
import { WeatherAmbient } from './home/WeatherAmbient';
import { translate, type TranslationKey } from './i18n';
import { WeatherLocationSettings } from './settings/WeatherLocationSettings';
import { TranscriptionSettings } from './settings/TranscriptionSettings';
import { SkillsSettings } from './settings/SkillsSettings';
import { MessageSettings } from './settings/MessageSettings';
import './settings/MessageSettings.css';
import type {
  AgentEvent,
  ChatMessage,
  ConversationSummary,
  LibrarySnapshot,
  Locale,
  LlmUsage,
  MemorySuggestion,
  MessageChannelStatus,
  ModelCatalog,
  ModelCatalogModel,
  ModelConfig,
  ModelSettings,
  Person,
  PriorityNote,
  ProviderConfig,
  ReasoningEffort,
  SkillCatalog,
  SkillDefinition,
  Story,
  View,
} from './types';
import {
  createEmptyModelSettings,
  configuredModelChoices,
  configuredProviderModels,
  getActiveModelConfig,
  normalizeModelSettings,
} from './modelSettings';
import {
  defaultEndpointForProvider,
  defaultProtocolForProvider,
  getCatalogModel,
  providerLogoUrl,
  supportedCatalogProviders,
} from './modelCatalog';
import {
  createNavigationHistory,
  recordNavigation,
  stepBack,
  stepForward,
} from './navigationHistory';
import { defaultPaneSizes, normalizePaneSizes, type PaneSizes } from './paneSizes';
import {
  enabledMyInfoSections,
  MY_PRIORITIES_RETRIEVAL_KEY,
  MY_INFO_RETRIEVAL_KEY,
  parseMyInfoRetrieval,
  type MyInfoRetrievalState,
  type MyInfoSectionId,
} from './myInfoRetrieval';
import {
  readStorageValue,
  storageKey,
  writeStorageValue,
} from './storage';

const APP_VERSION = packageMetadata.version;
const PRODUCT_WEBSITE = 'https://note.coffeecli.com/';
const BUILTIN_MEDIA_SKILL_ID = 'coffee-note-media-transcribe';
const FEEDBACK_URL = 'https://github.com/edison7009/Coffee-Note/issues';
const CONVERSATION_USAGE_KEY = storageKey('conversation-usage:v1');
const CAPTURE_TRANSCRIPTION_MODE_KEY = storageKey('capture-transcription-mode:v1');

type TranscriptionMode = 'api' | 'local';

function skillTitle(skill: SkillDefinition, locale: Locale) {
  if (skill.builtin && locale === 'en') return 'Media to text';
  return skill.title;
}

function skillDescription(skill: SkillDefinition, locale: Locale) {
  if (skill.builtin && locale === 'en') return 'Transcribe media links or local files into notes.';
  return skill.description;
}

type ConversationUsage = LlmUsage & { requestCount: number };

const EMPTY_USAGE: ConversationUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  cacheWriteTokens: 0,
  requestCount: 0,
};

function loadConversationUsage(): Record<string, ConversationUsage> {
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  try {
    const stored = JSON.parse(readStorageValue(CONVERSATION_USAGE_KEY) || '{}');
    if (!stored || typeof stored !== 'object') return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, Partial<ConversationUsage>>).map(([id, usage]) => [
        id,
        {
          promptTokens: count(usage.promptTokens),
          completionTokens: count(usage.completionTokens),
          totalTokens: count(usage.totalTokens),
          cacheHitTokens: count(usage.cacheHitTokens),
          cacheMissTokens: count(usage.cacheMissTokens),
          cacheWriteTokens: count(usage.cacheWriteTokens),
          requestCount: count(usage.requestCount),
        },
      ]),
    );
  } catch {
    return {};
  }
}

function resolveCurrency(currencyMode: CurrencyMode, locale: Locale): 'CNY' | 'USD' {
  return currencyMode === 'auto' ? (locale === 'zh' ? 'CNY' : 'USD') : currencyMode;
}

function estimateModelCost(
  usage: LlmUsage,
  config: ModelConfig,
  currency: 'CNY' | 'USD',
  catalog: ModelCatalog,
): number | null {
  const catalogModel = getCatalogModel(catalog, config.providerId, config.model);
  if (config.customModels.includes(config.model) || !catalogModel) return null;
  const identity = `${config.baseUrl} ${config.model}`.toLowerCase();
  let prices: {
    cacheHit: number;
    cacheMiss: number;
    cacheWrite: number;
    output: number;
  } | null = null;
  if (currency === 'CNY' && identity.includes('deepseek')) {
    // DeepSeek publishes separate regional prices; do not convert them as exchange rates.
    const pro = /v4[-_. ]?pro/.test(identity);
    prices = pro
      ? { cacheHit: 0.025, cacheMiss: 3, cacheWrite: 3, output: 6 }
      : { cacheHit: 0.02, cacheMiss: 1, cacheWrite: 1, output: 2 };
  } else if (currency === 'USD') {
    const cost = catalogModel.cost;
    if (cost?.input != null && cost.output != null) {
      prices = {
        cacheHit: cost.cacheRead ?? cost.input,
        cacheMiss: cost.input,
        cacheWrite: cost.cacheWrite ?? cost.input,
        output: cost.output,
      };
    }
  }
  if (!prices) return null;
  return (
    usage.cacheHitTokens * prices.cacheHit
    + usage.cacheMissTokens * prices.cacheMiss
    + usage.cacheWriteTokens * prices.cacheWrite
    + usage.completionTokens * prices.output
  ) / 1_000_000;
}

function createAmbientAssignments(count: number) {
  const assignments: Array<{
    delay: string;
    duration: string;
    direction: 'alternate' | 'alternate-reverse';
    secondaryDelay: string;
    secondaryDuration: string;
    secondaryDirection: 'alternate' | 'alternate-reverse';
  }> = [];
  const durationOffset = Math.random() * 11;

  for (let index = 0; index < count; index += 1) {
    assignments.push({
      delay: `${(-4 - Math.random() * 17).toFixed(2)}s`,
      duration: `${(10.6 + ((durationOffset + index * 2.71) % 12.8)).toFixed(2)}s`,
      direction: Math.random() > 0.5 ? 'alternate' : 'alternate-reverse',
      secondaryDelay: `${(-3 - Math.random() * 19).toFixed(2)}s`,
      secondaryDuration: `${(14.2 + ((durationOffset + index * 3.17) % 13.6)).toFixed(2)}s`,
      secondaryDirection: Math.random() > 0.5 ? 'alternate' : 'alternate-reverse',
    });
  }

  return assignments;
}

const isMacOSPlatform =
  typeof navigator !== 'undefined' && /Macintosh|Mac OS X/.test(navigator.userAgent);

const tierMeta: Record<string, { label: Record<Locale, string>; color: string }> = {
  T1: { label: { zh: '现在处理', en: 'Now' }, color: '#e99a9c' },
  T2: { label: { zh: '接下来', en: 'Next' }, color: '#eab77d' },
  T3: { label: { zh: '需要选择', en: 'Decide' }, color: '#dfc86f' },
  T4: { label: { zh: '等待信息', en: 'Wait' }, color: '#86c7ba' },
  T5: { label: { zh: '以后再看', en: 'Later' }, color: '#a8cb8f' },
  pending: { label: { zh: '仅收录', en: 'Collected' }, color: '#bcc9d6' },
};

const COMPOSER_REASONING_LEVELS = [
  { value: 'low', label: { zh: '轻度', en: 'Low' } },
  { value: 'medium', label: { zh: '中', en: 'Medium' } },
  { value: 'high', label: { zh: '高', en: 'High' } },
  { value: 'xhigh', label: { zh: '超高', en: 'XHigh' } },
  { value: 'max', label: { zh: '极致', en: 'Max' } },
] as const;

const TIER_IDS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;
type TierId = (typeof TIER_IDS)[number];

function extractFrontmatterTier(markdown: string): string | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  const field = match[1]
    .split(/\r?\n/)
    .find((line) => /^tier\s*:/i.test(line.trim()));
  if (!field) return undefined;
  const value = field
    .split(':')
    .slice(1)
    .join(':')
    .trim()
    .replace(/^["']|["']$/g, '');
  return value || undefined;
}

function normalizeTier(tier: string | undefined): string | undefined {
  if (!tier) return undefined;
  const upper = tier.toUpperCase();
  return upper === 'PENDING' ? 'pending' : upper;
}

function reorderTierItems(
  items: PriorityNote[],
  itemId: string,
  targetTier: TierId,
  targetIndex: number,
): PriorityNote[] {
  const moved = items.find((item) => item.id === itemId);
  if (!moved) return items;

  const remaining = items.filter((item) => item.id !== itemId);
  const visible = TIER_IDS.flatMap((tier) => {
    const tierItems = remaining.filter((item) => item.tier === tier);
    if (tier === targetTier) {
      tierItems.splice(Math.min(Math.max(targetIndex, 0), tierItems.length), 0, {
        ...moved,
        tier: targetTier,
      });
    }
    return tierItems;
  });
  const hidden = remaining.filter((item) => !TIER_IDS.includes(item.tier as TierId));
  return [...visible, ...hidden];
}

function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = readStorageValue(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const update = (value: T) => {
    setState(value);
    try {
      writeStorageValue(key, JSON.stringify(value));
    } catch {
      // Private browsing and full storage should not stop the app.
    }
  };
  return [state, update];
}

function bindAutoHideScrollbar(element: HTMLElement, hideDelay = 450, slim = false, insetY = 0): () => void {
  let hideTimer: number | null = null;
  let updateFrame: number | null = null;
  let maxScroll = 0;
  let thumbTravel = 0;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  element.classList.add('auto-hide-scrollbar');

  const rail = document.createElement('div');
  rail.className = slim ? 'tier-scrollbar tier-scrollbar-slim' : 'tier-scrollbar';
  const railWidth = slim ? 7 : 10;
  rail.setAttribute('aria-hidden', 'true');
  const slider = document.createElement('div');
  slider.className = 'tier-scrollbar-slider';
  rail.append(slider);
  document.body.append(rail);

  const updatePosition = () => {
    if (updateFrame != null) return;
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = null;
      const rect = element.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      const viewportHeight = Math.max(0, bottom - top);
      maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);

      if (maxScroll <= 1 || viewportHeight < 24 || rect.width <= 0) {
        rail.classList.add('is-empty');
        return;
      }

      rail.classList.remove('is-empty');
      rail.style.top = `${Math.round(top + insetY)}px`;
      rail.style.left = `${Math.round(Math.min(window.innerWidth - railWidth, rect.right - railWidth))}px`;
      rail.style.height = `${Math.round(viewportHeight - insetY * 2)}px`;

      const trackHeight = Math.max(0, viewportHeight - insetY * 2 - 4);
      const thumbHeight = Math.max(28, trackHeight * (element.clientHeight / element.scrollHeight));
      thumbTravel = Math.max(0, trackHeight - thumbHeight);
      const thumbTop = maxScroll > 0 ? (element.scrollTop / maxScroll) * thumbTravel : 0;
      slider.style.height = `${Math.round(thumbHeight)}px`;
      slider.style.transform = `translateY(${Math.round(thumbTop + 2)}px)`;
    });
  };

  const reveal = () => {
    updatePosition();
    rail.classList.add('is-visible');
    if (hideTimer != null) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      rail.classList.remove('is-visible');
    }, hideDelay);
  };

  const handleDragMove = (event: PointerEvent) => {
    if (thumbTravel <= 0) return;
    const scrollDelta = ((event.clientY - dragStartY) / thumbTravel) * maxScroll;
    element.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScrollTop + scrollDelta));
  };

  const handleDragEnd = () => {
    rail.classList.remove('is-dragging');
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    document.removeEventListener('pointercancel', handleDragEnd);
    reveal();
  };

  const handleDragStart = (event: PointerEvent) => {
    if (event.button !== 0 || maxScroll <= 0) return;
    event.preventDefault();
    dragStartY = event.clientY;
    dragStartScrollTop = element.scrollTop;
    rail.classList.add('is-dragging', 'is-visible');
    if (hideTimer != null) window.clearTimeout(hideTimer);
    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
    document.addEventListener('pointercancel', handleDragEnd);
  };

  element.addEventListener('scroll', reveal, { passive: true });
  element.addEventListener('wheel', reveal, { passive: true });
  element.addEventListener('pointermove', reveal, { passive: true });
  element.addEventListener('touchstart', reveal, { passive: true });
  element.addEventListener('keydown', reveal);
  element.addEventListener('focusin', reveal);
  slider.addEventListener('pointerdown', handleDragStart);
  window.addEventListener('resize', updatePosition);
  document.addEventListener('scroll', updatePosition, true);
  const resizeObserver = new ResizeObserver(updatePosition);
  resizeObserver.observe(element);
  const observeContentChildren = () => {
    Array.from(element.children).forEach((child) => resizeObserver.observe(child));
  };
  observeContentChildren();
  // The scroll container keeps the same box while AI messages are appended or
  // streamed into it, so also watch child mutations and direct content size.
  const mutationObserver = new MutationObserver(() => {
    observeContentChildren();
    reveal();
  });
  mutationObserver.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  updatePosition();

  return () => {
    if (hideTimer != null) window.clearTimeout(hideTimer);
    if (updateFrame != null) window.cancelAnimationFrame(updateFrame);
    element.removeEventListener('scroll', reveal);
    element.removeEventListener('wheel', reveal);
    element.removeEventListener('pointermove', reveal);
    element.removeEventListener('touchstart', reveal);
    element.removeEventListener('keydown', reveal);
    element.removeEventListener('focusin', reveal);
    slider.removeEventListener('pointerdown', handleDragStart);
    window.removeEventListener('resize', updatePosition);
    document.removeEventListener('scroll', updatePosition, true);
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    document.removeEventListener('pointercancel', handleDragEnd);
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    rail.remove();
    element.classList.remove('auto-hide-scrollbar');
  };
}

function useAutoHideScrollbar<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return bindAutoHideScrollbar(element);
  }, []);
  return ref;
}

function normalizeMarkdown(markdown: string): string {
  const withoutFrontmatter = markdown.replace(
    /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
    '',
  );

  return withoutFrontmatter
    .replace(
    /::: tip\s*([^\n]*)\n([\s\S]*?)\n:::/g,
      (_match, title: string, body: string) => {
        const normalizedTitle = title.trim().toLowerCase();
        const visibleTitle =
          title.trim() === '30 秒结论' ||
          normalizedTitle === '30-second summary' ||
          normalizedTitle === '30-second conclusion'
            ? ''
            : title.trim();
        const heading = visibleTitle ? `> **${visibleTitle}**\n>\n` : '';
        return `${heading}${body
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}`;
      },
    )
    .replace(
      /^> \*\*(?:30 秒结论|30-second (?:summary|conclusion))\*\*\r?\n>\s*\r?\n/gim,
      '',
    );
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeSummaryText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[(.*?)\]\((?:https?:\/\/[^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenSummaryText(value: string, maxChars = 280): string {
  const normalized = sanitizeSummaryText(value);
  if (normalized.length <= maxChars) return normalized;
  const clipped = normalized.slice(0, maxChars);
  const sentence = clipped.match(/^.*?[。！？.!?](?:\s|$)/u)?.[0]?.trim();
  if (sentence && sentence.length >= Math.min(maxChars, 120)) {
    return sentence;
  }
  return clipped.trim();
}

function extractLocalNoteSummary(markdown: string): string {
  const normalized = normalizeMarkdown(markdown).replace(/\r/g, '');
  const blocks = normalized.split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^```/.test(trimmed)) continue;
    const cleaned = sanitizeSummaryText(
      trimmed
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/^\s*\|\s*/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, ''),
    );
    if (cleaned.length >= 20) {
      return shortenSummaryText(cleaned);
    }
  }
  const fallback = sanitizeSummaryText(normalized);
  return fallback.length >= 20 ? shortenSummaryText(fallback) : '';
}

type NoteSummarySource = 'local' | 'ai';
type NoteSummaryStatus = 'loading' | 'ready';

interface NoteSummaryRecord {
  text: string;
  source: NoteSummarySource;
  status: NoteSummaryStatus;
}

interface RailEditorTarget {
  root: string;
  relativePath: string;
  title: string;
  markdown: string;
}

const REASONING_DETAILS_PATTERN =
  /<details>\s*<summary>\s*reasoning\s*<\/summary>[\s\S]*?<\/details>\s*/gi;

function sanitizeConversationMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => {
      if (message.role !== 'assistant') return message;
      const withoutReasoning = message.content.replace(REASONING_DETAILS_PATTERN, '');
      return withoutReasoning === message.content
        ? message
        : { ...message, content: withoutReasoning.trimStart() };
    })
    .filter((message) => message.role !== 'assistant' || message.content.trim().length > 0);
}

type InternalNoteKind = 'person' | 'story' | 'file';
type PlanSection = 'supplements' | 'exercise' | 'experience' | 'lessons' | 'sleep' | 'log';

const PLAN_SECTION_FILES: Record<Exclude<PlanSection, 'log'>, string> = {
  supplements: 'plans/supplements.md',
  exercise: 'plans/exercise.md',
  experience: 'plans/experience.md',
  lessons: 'plans/lessons.md',
  sleep: 'plans/daily-routine.md',
};

function getPlanSectionFile(section: Exclude<PlanSection, 'log'>, locale: Locale): string {
  const path = PLAN_SECTION_FILES[section];
  return locale === 'en' ? path.replace(/\.md$/, '.en.md') : path;
}
type ThemeMode = 'system' | 'light' | 'dark';
type CurrencyMode = 'auto' | 'CNY' | 'USD';
type SettingsSectionId = 'model' | 'skills' | 'transcription' | 'appearance' | 'messages';
type ResizeSide = 'left' | 'right';
type SurfaceSchemeId =
  | 'openscience'
  | 'openscience-1'
  | 'aura'
  | 'ayu'
  | 'carbonfox'
  | 'catppuccin'
  | 'dracula'
  | 'gruvbox'
  | 'monokai'
  | 'nightowl'
  | 'nord'
  | 'onedarkpro'
  | 'shadesofpurple'
  | 'solarized'
  | 'tokyonight'
  | 'vesper';

interface SurfaceSchemeVariant {
  shell: string;
  canvas: string;
  secondary: string;
  tertiary: string;
  composer: string;
  bubble: string;
  accentContrast: string;
}

interface SurfaceScheme {
  id: SurfaceSchemeId;
  labelZh: string;
  labelEn: string;
  light: SurfaceSchemeVariant;
  dark: SurfaceSchemeVariant;
}

const SURFACE_SCHEMES: SurfaceScheme[] = [
  {
    id: 'openscience',
    labelZh: '燕麦',
    labelEn: 'Oat',
    light: {
      shell: '#EFE9DF',
      canvas: '#F7F4ED',
      secondary: '#FBF9F4',
      tertiary: '#FFFDF8',
      composer: '#FBF9F4',
      bubble: '#FFFDF8',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#202120',
      canvas: '#1C1D1C',
      secondary: '#181918',
      tertiary: '#141514',
      composer: '#181918',
      bubble: '#141514',
      accentContrast: '#1C1D1C',
    },
  },
  {
    id: 'openscience-1',
    labelZh: '雾灰',
    labelEn: 'Mist',
    light: {
      shell: '#F2F2F2',
      canvas: '#F8F7F7',
      secondary: '#FFFFFF',
      tertiary: '#FCFCFC',
      composer: '#FFFFFF',
      bubble: '#FCFCFC',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#1C1717',
      canvas: '#151313',
      secondary: '#151313',
      tertiary: '#191515',
      composer: '#151313',
      bubble: '#191515',
      accentContrast: '#151313',
    },
  },
  {
    id: 'aura',
    labelZh: '薰衣草',
    labelEn: 'Lavender',
    light: {
      shell: '#EFE8FC',
      canvas: '#F5F0FF',
      secondary: '#FAF7FF',
      tertiary: '#FDFCFF',
      composer: '#FAF7FF',
      bubble: '#FDFCFF',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#1A1921',
      canvas: '#15141B',
      secondary: '#121118',
      tertiary: '#0F0E14',
      composer: '#121118',
      bubble: '#0F0E14',
      accentContrast: '#15141B',
    },
  },
  {
    id: 'ayu',
    labelZh: '松灰',
    labelEn: 'Pine',
    light: {
      shell: '#FCF9F3',
      canvas: '#FDFAF4',
      secondary: '#FBF8F2',
      tertiary: '#FAF7F1',
      composer: '#FBF8F2',
      bubble: '#FAF7F1',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#18222C',
      canvas: '#0F1419',
      secondary: '#0B1015',
      tertiary: '#080C10',
      composer: '#0B1015',
      bubble: '#080C10',
      accentContrast: '#0F1419',
    },
  },
  {
    id: 'carbonfox',
    labelZh: '碳黑',
    labelEn: 'Carbon',
    light: {
      shell: '#F4F4F4',
      canvas: '#FFFFFF',
      secondary: '#E8E8E8',
      tertiary: '#DCDCDC',
      composer: '#E8E8E8',
      bubble: '#DCDCDC',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#262626',
      canvas: '#161616',
      secondary: '#0D0D0D',
      tertiary: '#000000',
      composer: '#0D0D0D',
      bubble: '#000000',
      accentContrast: '#161616',
    },
  },
  {
    id: 'catppuccin',
    labelZh: '拿铁',
    labelEn: 'Latte',
    light: {
      shell: '#F2D8D4',
      canvas: '#F5E0DC',
      secondary: '#F9E8E4',
      tertiary: '#FDEEEE',
      composer: '#F9E8E4',
      bubble: '#FDEEEE',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#211F31',
      canvas: '#1E1E2E',
      secondary: '#1C1C29',
      tertiary: '#191926',
      composer: '#1C1C29',
      bubble: '#191926',
      accentContrast: '#1E1E2E',
    },
  },
  {
    id: 'dracula',
    labelZh: '夜紫',
    labelEn: 'Night violet',
    light: {
      shell: '#F1F2ED',
      canvas: '#F8F8F2',
      secondary: '#F6F6F1',
      tertiary: '#F2F2EC',
      composer: '#F6F6F1',
      bubble: '#F2F2EC',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#181926',
      canvas: '#14151F',
      secondary: '#161722',
      tertiary: '#191A26',
      composer: '#161722',
      bubble: '#191A26',
      accentContrast: '#14151F',
    },
  },
  {
    id: 'gruvbox',
    labelZh: '奶油',
    labelEn: 'Cream',
    light: {
      shell: '#F2E5BC',
      canvas: '#FBF1C7',
      secondary: '#F9F5D7',
      tertiary: '#FDF9E8',
      composer: '#F9F5D7',
      bubble: '#FDF9E8',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#32302F',
      canvas: '#282828',
      secondary: '#1D2021',
      tertiary: '#141617',
      composer: '#1D2021',
      bubble: '#141617',
      accentContrast: '#282828',
    },
  },
  {
    id: 'monokai',
    labelZh: '芥末',
    labelEn: 'Mustard',
    light: {
      shell: '#F8F2E6',
      canvas: '#FDF8EC',
      secondary: '#FBF5E8',
      tertiary: '#F7EFDD',
      composer: '#FBF5E8',
      bubble: '#F7EFDD',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#27281F',
      canvas: '#23241E',
      secondary: '#25261F',
      tertiary: '#292A23',
      composer: '#25261F',
      bubble: '#292A23',
      accentContrast: '#23241E',
    },
  },
  {
    id: 'nightowl',
    labelZh: '深海',
    labelEn: 'Deep sea',
    light: {
      shell: '#F0F0F0',
      canvas: '#FBFBFB',
      secondary: '#FFFFFF',
      tertiary: '#FFFFFF',
      composer: '#FFFFFF',
      bubble: '#FFFFFF',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#0B253A',
      canvas: '#011627',
      secondary: '#001122',
      tertiary: '#000C17',
      composer: '#001122',
      bubble: '#000C17',
      accentContrast: '#011627',
    },
  },
  {
    id: 'nord',
    labelZh: '冰川',
    labelEn: 'Glacier',
    light: {
      shell: '#E4E8F0',
      canvas: '#ECEFF4',
      secondary: '#F1F3F8',
      tertiary: '#F6F8FC',
      composer: '#F1F3F8',
      bubble: '#F6F8FC',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#222938',
      canvas: '#1F2430',
      secondary: '#1C202A',
      tertiary: '#181C24',
      composer: '#1C202A',
      bubble: '#181C24',
      accentContrast: '#1F2430',
    },
  },
  {
    id: 'onedarkpro',
    labelZh: '蓝石墨',
    labelEn: 'Blue graphite',
    light: {
      shell: '#EEF0F4',
      canvas: '#F5F6F8',
      secondary: '#FAFBFC',
      tertiary: '#FFFFFF',
      composer: '#FAFBFC',
      bubble: '#FFFFFF',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#212631',
      canvas: '#1E222A',
      secondary: '#1B1F27',
      tertiary: '#171B23',
      composer: '#1B1F27',
      bubble: '#171B23',
      accentContrast: '#1E222A',
    },
  },
  {
    id: 'shadesofpurple',
    labelZh: '葡萄紫',
    labelEn: 'Grape',
    light: {
      shell: '#F2E2FF',
      canvas: '#F7EBFF',
      secondary: '#FBF2FF',
      tertiary: '#FFF7FF',
      composer: '#FBF2FF',
      bubble: '#FFF7FF',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#1F1434',
      canvas: '#1A102B',
      secondary: '#1C122F',
      tertiary: '#170E26',
      composer: '#1C122F',
      bubble: '#170E26',
      accentContrast: '#1A102B',
    },
  },
  {
    id: 'solarized',
    labelZh: '青灰',
    labelEn: 'Teal gray',
    light: {
      shell: '#F6EFDA',
      canvas: '#FDF6E3',
      secondary: '#FAF3DC',
      tertiary: '#F6EDD4',
      composer: '#FAF3DC',
      bubble: '#F6EDD4',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#022733',
      canvas: '#001F27',
      secondary: '#01222B',
      tertiary: '#032830',
      composer: '#01222B',
      bubble: '#032830',
      accentContrast: '#001F27',
    },
  },
  {
    id: 'tokyonight',
    labelZh: '东京蓝',
    labelEn: 'Tokyo blue',
    light: {
      shell: '#DEE0EA',
      canvas: '#E1E2E7',
      secondary: '#E5E6EE',
      tertiary: '#E9EAF1',
      composer: '#E5E6EE',
      bubble: '#E9EAF1',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#111428',
      canvas: '#0F111A',
      secondary: '#101324',
      tertiary: '#13172A',
      composer: '#101324',
      bubble: '#13172A',
      accentContrast: '#0F111A',
    },
  },
  {
    id: 'vesper',
    labelZh: '墨黑',
    labelEn: 'Ink',
    light: {
      shell: '#F8F8F8',
      canvas: '#FFFFFF',
      secondary: '#F0F0F0',
      tertiary: '#E8E8E8',
      composer: '#F0F0F0',
      bubble: '#E8E8E8',
      accentContrast: '#FFFFFF',
    },
    dark: {
      shell: '#141414',
      canvas: '#101010',
      secondary: '#0C0C0C',
      tertiary: '#080808',
      composer: '#0C0C0C',
      bubble: '#080808',
      accentContrast: '#101010',
    },
  },
];

interface InternalNoteTarget {
  kind: InternalNoteKind;
  id: string;
  label: string;
}


interface ContextNoteSelection {
  path: string;
  title: string;
}

interface NavigationLocation {
  view: View;
  personId?: string;
  storyId?: string;
  filePath?: string;
}


type HealthLogField = 'exercise' | 'diet' | 'body';

interface HealthDayEntry {
  exercise?: string;
  diet?: string;
  body?: string;
}

type HealthLog = Record<string, HealthDayEntry>;

const HEALTH_LOG_KEY = storageKey('health-log:v1');

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function todayKey(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function shiftKey(key: string, delta: number): string {
  const parts = key.split('-').map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + delta);
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}

function formatRelativeTime(timestamp: number, locale: Locale): string {
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale === 'zh' ? '刚刚' : 'just now';
  if (minutes < 60) return locale === 'zh' ? `${minutes} 分钟前` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'zh' ? `${hours} 小时前` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return locale === 'zh' ? `${days} 天前` : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return locale === 'zh' ? `${months} 个月前` : `${months} mo ago`;
  const years = Math.floor(months / 12);
  return locale === 'zh' ? `${years} 年前` : `${years} yr ago`;
}

function entryHasContent(entry: HealthDayEntry | undefined): boolean {
  return Boolean(entry && (entry.exercise || entry.diet || entry.body));
}

function getPlanSections(locale: Locale): Array<{
  id: MyInfoSectionId;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
}> {
  return [
    {
      id: 'supplements',
      title: locale === 'zh' ? '我的简历' : 'My Resume',
      description:
        locale === 'zh'
          ? '个人简介、经历与当前状态'
          : 'Your background, experience, and current context',
      icon: <UserRound size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'exercise',
      title: locale === 'zh' ? '我的目标' : 'My Goals',
      description:
        locale === 'zh'
          ? '正在推进的事，以及想得到的结果'
          : 'What you are working toward and why',
      icon: <Target size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'experience',
      title: locale === 'zh' ? '我的经验' : 'My Experience',
      description:
        locale === 'zh'
          ? '试过什么、结果如何，以及什么真的有效'
          : 'What you have tried, what worked, and what actually helps',
      icon: <Lightbulb size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'lessons',
      title: locale === 'zh' ? '我的教训' : 'My Lessons',
      description:
        locale === 'zh'
          ? '避开什么、什么不行，以及现实边界'
          : 'What to avoid and the constraints you have',
      icon: <ShieldAlert size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'sleep',
      title: locale === 'zh' ? '重要记录' : 'Key Records',
      description:
        locale === 'zh'
          ? '项目、经历与值得回看的资料'
          : 'Projects, experiences, and useful reference',
      icon: <Archive size={17} />,
      accent: '#e5e5e7',
    },
  ];
}

function parseInternalNoteLink(href?: string): Omit<InternalNoteTarget, 'label'> | null {
  if (!href) return null;
  // Existing #/kind/id navigation links.
  const nav = href.match(/^#\/(person|story)\/([^/?#]+)$/);
  if (nav) {
    return {
      kind: nav[1] as InternalNoteKind,
      id: decodeURIComponent(nav[2]),
    };
  }
  // Relative library file paths: plans/current-protocol.md etc.
  const fileMatch = href.match(/^([a-z][a-z-]*)\/([^?#]+\.md)$/);
  if (fileMatch) {
    return {
      kind: 'file' as InternalNoteKind,
      id: decodeURIComponent(fileMatch[1] + '/' + fileMatch[2]),
    };
  }
  return null;
}

function AppLink({
  href,
  children,
  onClick,
  onInternalNavigate,
  node: _node,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  node?: unknown;
  onInternalNavigate?: (target: Omit<InternalNoteTarget, 'label'>) => void;
}) {
  const internalTarget = parseInternalNoteLink(href);
  const external = Boolean(href && /^https?:\/\//i.test(href));
  const className = [props.className, internalTarget ? 'internal-note-link' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <a
      {...props}
      href={href}
      className={className || undefined}
      rel={external ? 'noreferrer' : props.rel}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (internalTarget && onInternalNavigate) {
          event.preventDefault();
          onInternalNavigate(internalTarget);
          return;
        }
        if (!external || !href) return;
        event.preventDefault();
        void openExternalUrl(href);
      }}
    >
      {children}
    </a>
  );
}

function isAsciiWordCharacter(value?: string): boolean {
  return Boolean(value && /[A-Za-z0-9_]/.test(value));
}

function findTermIndex(text: string, label: string): number {
  const haystack = text.toLocaleLowerCase();
  const needle = label.toLocaleLowerCase();
  let from = 0;

  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return -1;
    const before = text[index - 1];
    const after = text[index + label.length];
    const startsWithWord = isAsciiWordCharacter(label[0]);
    const endsWithWord = isAsciiWordCharacter(label[label.length - 1]);
    if (
      (!startsWithWord || !isAsciiWordCharacter(before)) &&
      (!endsWithWord || !isAsciiWordCharacter(after))
    ) {
      return index;
    }
    from = index + 1;
  }

  return -1;
}

function linkInternalKeywords(
  markdown: string,
  targets: InternalNoteTarget[],
  currentTarget: Omit<InternalNoteTarget, 'label'>,
): string {
  const currentKey = `${currentTarget.kind}:${currentTarget.id}`;
  const seenLabels = new Set<string>();
  const candidates = targets
    .filter((target) => `${target.kind}:${target.id}` !== currentKey)
    .filter((target) => {
      const label = target.label.trim().toLocaleLowerCase();
      if (!label || seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    })
    .sort((left, right) => right.label.length - left.label.length);
  const linkedTargets = new Set<string>();
  let inFence = false;

  const linkText = (text: string) => {
    let remaining = text;
    let output = '';

    while (remaining) {
      let next:
        | {
            target: InternalNoteTarget;
            index: number;
          }
        | undefined;

      for (const target of candidates) {
        const key = `${target.kind}:${target.id}`;
        if (linkedTargets.has(key)) continue;
        const index = findTermIndex(remaining, target.label);
        if (
          index >= 0 &&
          (!next ||
            index < next.index ||
            (index === next.index && target.label.length > next.target.label.length))
        ) {
          next = { target, index };
        }
      }

      if (!next) {
        output += remaining;
        break;
      }

      const matchedText = remaining.slice(next.index, next.index + next.target.label.length);
      output += remaining.slice(0, next.index);
      output += `[${matchedText}](#/${next.target.kind}/${encodeURIComponent(next.target.id)})`;
      linkedTargets.add(`${next.target.kind}:${next.target.id}`);
      remaining = remaining.slice(next.index + next.target.label.length);
    }

    return output;
  };

  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || /^\s{0,3}#{1,6}\s/.test(line)) return line;

      const protectedMarkdown =
        /(`[^`]*`|!?\[[^\]]*\]\([^)]*\)|https?:\/\/[^\s<]+|<[^>]+>)/g;
      let output = '';
      let cursor = 0;
      for (const match of line.matchAll(protectedMarkdown)) {
        const index = match.index ?? 0;
        output += linkText(line.slice(cursor, index));
        output += match[0];
        cursor = index + match[0].length;
      }
      output += linkText(line.slice(cursor));
      return output;
    })
    .join('\n');
}

function locationsMatch(left: NavigationLocation, right: NavigationLocation): boolean {
  return (
    left.view === right.view &&
    left.personId === right.personId &&
    left.storyId === right.storyId &&
    left.filePath === right.filePath
  );
}

type ToastState = {
  message: string;
  kind: 'status';
};

function App() {
  const [locale, setLocale] = useStoredState<Locale>(storageKey('locale'), 'zh');
  const [themeMode, setThemeMode] = useStoredState<ThemeMode>(
    storageKey('theme'),
    'system',
  );
  const [surfaceScheme, setSurfaceScheme] = useStoredState<SurfaceSchemeId>(
    storageKey('surface-scheme:v1'),
    'openscience',
  );
  const [currencyMode, setCurrencyMode] = useStoredState<CurrencyMode>(
    storageKey('currency'),
    'auto',
  );
  const [paneSizes, setPaneSizes] = useStoredState<PaneSizes>(
    storageKey('pane-sizes'),
    defaultPaneSizes,
  );
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const normalizedPaneSizes = normalizePaneSizes(paneSizes, viewportWidth);
  const [knowledgeRoot, setKnowledgeRoot] = useStoredState(
    storageKey('knowledge-root:v2'),
    '',
  );
  const isManagedDefaultRoot = (root: string) => {
    const normalized = root.replace(/\\/g, '/').toLowerCase();
    return (
      normalized.endsWith('.coffee-note/我的笔记(演示)') ||
      normalized.endsWith('.tiernote/演示笔记')
    );
  };
  const normalizedKnowledgeRoot =
    knowledgeRoot && !isManagedDefaultRoot(knowledgeRoot) ? knowledgeRoot : '';
  const [modelSettings, setModelSettings] = useState<ModelSettings>(createEmptyModelSettings);
  const [messageChannelStatus, setMessageChannelStatus] = useState<MessageChannelStatus>({
    weixin: 'disconnected',
    telegram: 'disconnected',
    weixinError: '',
    telegramError: '',
    activeJobs: 0,
  });
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({});
  const [modelCatalogError, setModelCatalogError] = useState('');
  const [modelCatalogLoading, setModelCatalogLoading] = useState(true);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalog>({ categories: [], skills: [], plugins: [] });
  const [skillCatalogError, setSkillCatalogError] = useState('');
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(true);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const modelConfigSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    loadModelConfig()
      .then((storedConfig) => {
        if (!alive) return;
        if (storedConfig) setModelSettings(storedConfig);
      })
      .catch((error) => {
        console.error('Could not load the saved model config.', error);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refreshModelCatalog = useCallback((refresh = false) => {
    setModelCatalogLoading(true);
    setModelCatalogError('');
    return loadModelCatalog(refresh)
      .then((catalog) => {
        setModelCatalog(catalog);
        return catalog;
      })
      .catch((error) => {
        setModelCatalogError(String(error).replace(/^Error:\s*/i, ''));
        throw error;
      })
      .finally(() => setModelCatalogLoading(false));
  }, []);

  useEffect(() => {
    void refreshModelCatalog().catch(() => undefined);
  }, [refreshModelCatalog]);

  useEffect(() => {
    let alive = true;
    setSkillCatalogLoading(true);
    listSkills()
      .then((catalog) => {
        if (!alive) return;
        setSkillCatalog(catalog);
        setSkillCatalogError('');
      })
      .catch((error) => {
        if (alive) setSkillCatalogError(String(error).replace(/^Error:\s*/i, ''));
      })
      .finally(() => {
        if (alive) setSkillCatalogLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSkillId && !skillCatalog.skills.some((skill) => skill.id === selectedSkillId && skill.enabled)) {
      setSelectedSkillId(null);
    }
  }, [selectedSkillId, skillCatalog.skills]);

  const [library, setLibrary] = useState<LibrarySnapshot>(fallbackLibrary);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [view, setView] = useState<View>('home');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [myInfoRetrieval, setMyInfoRetrieval] = useState<MyInfoRetrievalState>(() =>
    parseMyInfoRetrieval(readStorageValue(MY_INFO_RETRIEVAL_KEY)),
  );
  const [includePriorities, setIncludePriorities] = useStoredState<boolean>(
    MY_PRIORITIES_RETRIEVAL_KEY,
    true,
  );
  const [fileNotePath, setFileNotePath] = useState<string | null>(null);
  const [fileNoteSource, setFileNoteSource] = useState<'library' | 'myInfo'>('library');
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [selectedContextNotes, setSelectedContextNotes] = useState<ContextNoteSelection[]>([]);
  const [implicitContextDismissed, setImplicitContextDismissed] = useState(false);
  const libraryRootRef = useRef(library.root || normalizedKnowledgeRoot || '');
  const tierMoveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const libraryGenerationRef = useRef(0);
  libraryRootRef.current = normalizedKnowledgeRoot || library.root || '';
  const fileNotePathRef = useRef(fileNotePath);
  fileNotePathRef.current = fileNotePath;
  const fileNoteSourceRef = useRef(fileNoteSource);
  fileNoteSourceRef.current = fileNoteSource;

  const fileNoteTitle = useMemo(() => {
    if (!fileNotePath) return '';
    const sectionId = (Object.keys(PLAN_SECTION_FILES) as Array<Exclude<PlanSection, 'log'>>).find(
      (id) => getPlanSectionFile(id, locale) === fileNotePath,
    );
    if (sectionId) {
      return getPlanSections(locale).find((section) => section.id === sectionId)?.title || '';
    }
    return fileNotePath.split('/').pop()?.replace(/\.md$/, '') || fileNotePath;
  }, [fileNotePath, locale]);
  const currentPageTitle = useMemo(() => {
    if (view === 'file') return fileNoteTitle || undefined;
    if (view === 'person' && selectedPerson) return selectedPerson.name;
    if (view === 'story' && selectedStory) {
      return locale === 'zh' ? selectedStory.title : selectedStory.titleEn || selectedStory.title;
    }
    return undefined;
  }, [view, fileNoteTitle, selectedPerson, selectedStory, locale]);
  useEffect(() => {
    setImplicitContextDismissed(false);
  }, [view, fileNotePath, selectedPerson?.id, selectedStory?.id]);
  const selectedContextPaths = useMemo(
    () => selectedContextNotes.map((note) => note.path),
    [selectedContextNotes],
  );
  const implicitContextPaths = useMemo(
    () => [
      selectedPerson?.filePath,
      selectedStory?.filePath,
      view === 'file' && fileNoteSource === 'library' ? fileNotePath : undefined,
    ].filter(Boolean) as string[],
    [fileNotePath, fileNoteSource, selectedPerson, selectedStory, view],
  );
  const implicitContextEnabled = Boolean(currentPageTitle) && !implicitContextDismissed;
  const composerContextLabel = useMemo(() => {
    if (selectedContextNotes.length === 0) {
      return implicitContextEnabled ? currentPageTitle : undefined;
    }
    const firstTitle = selectedContextNotes[0].title;
    if (selectedContextNotes.length === 1) return firstTitle;
    return locale === 'zh'
      ? `${firstTitle}等${selectedContextNotes.length}篇`
      : `${firstTitle} and ${selectedContextNotes.length - 1} more`;
  }, [currentPageTitle, implicitContextEnabled, locale, selectedContextNotes]);
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const fileNoteTier = useMemo(
    () => (view === 'file' ? extractFrontmatterTier(noteMarkdown) : undefined),
    [view, noteMarkdown],
  );
  const [noteLoading, setNoteLoading] = useState(false);
  const noteSummaryCacheRef = useRef<Record<string, NoteSummaryRecord>>({});
  const noteSummaryRequestIdRef = useRef(0);
  const [noteSummaryVersion, setNoteSummaryVersion] = useState(0);
  const [railEditorTarget, setRailEditorTarget] = useState<RailEditorTarget | null>(null);
  const railEditorDraftRef = useRef('');
  const [activeTextSurface, setActiveTextSurface] = useState<TextCommandSurface>('none');
  const editorTextCommandsRef = useRef<TextCommandController | null>(null);
  const readerTextCommandsRef = useRef<TextCommandController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('appearance');
  const [captureGuideOpen, setCaptureGuideOpen] = useState(false);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const conversationSaveSnapshotRef = useRef<{ id: string; json: string } | null>(null);
  const conversationSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [unreadConversationIds, setUnreadConversationIds] = useState<string[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [contextBytes, setContextBytes] = useState(0);
  const [usageByConversation, setUsageByConversation] = useState<Record<string, ConversationUsage>>(
    loadConversationUsage,
  );
  const [chatBusy, setChatBusy] = useState(false);
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const appViewRef = useRef(view);
  appViewRef.current = view;
  const [toast, setToast] = useState<ToastState | null>(null);
  const [resizingPane, setResizingPane] = useState<ResizeSide | null>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement>(null);
  const contentScrollRef = useAutoHideScrollbar<HTMLDivElement>();
  const navigationHistoryRef = useRef(createNavigationHistory<NavigationLocation>());
  const [, setNavigationHistoryVersion] = useState(0);

  const t = (key: TranslationKey) => translate(locale, key);
  const modelConfig = getActiveModelConfig(modelSettings);
  const activeTextController = useCallback(() => {
    if (activeTextSurface === 'editor') {
      return editorTextCommandsRef.current || readerTextCommandsRef.current;
    }
    if (activeTextSurface === 'reader') return readerTextCommandsRef.current;
    return readerTextCommandsRef.current;
  }, [activeTextSurface]);
  const isTextCommandEnabled = useCallback(
    (command: TextCommand) => {
      const controller = activeTextController();
      return Boolean(controller?.canRun(command));
    },
    [activeTextController],
  );
  const runTextCommand = useCallback(
    (command: TextCommand) => {
      const controller = activeTextController();
      if (!controller?.canRun(command)) return;
      void controller.run(command);
    },
    [activeTextController],
  );
  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme =
        themeMode === 'system' ? (systemTheme.matches ? 'dark' : 'light') : themeMode;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [themeMode]);

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applySurface = () => {
      const resolvedTheme =
        themeMode === 'system' ? (systemTheme.matches ? 'dark' : 'light') : themeMode;
      const scheme =
        SURFACE_SCHEMES.find((item) => item.id === surfaceScheme) ?? SURFACE_SCHEMES[0];
      const variant = resolvedTheme === 'dark' ? scheme.dark : scheme.light;
      const root = document.documentElement;

      root.style.setProperty('--sidebar-surface', variant.shell);
      root.style.setProperty('--paper', variant.canvas);
      root.style.setProperty('--canvas', variant.canvas);
      root.style.setProperty('--secondary-surface', variant.secondary);
      root.style.setProperty('--tertiary-surface', variant.tertiary);
      root.style.setProperty('--composer-surface', variant.composer);
      root.style.setProperty('--chat-user-bubble', variant.bubble);
      root.style.setProperty('--accent-contrast', variant.accentContrast);
    };

    applySurface();
    systemTheme.addEventListener('change', applySurface);
    return () => systemTheme.removeEventListener('change', applySurface);
  }, [surfaceScheme, themeMode]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  useEffect(() => {
    void setTrayLocale(locale).catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (
      paneSizes.left === normalizedPaneSizes.left &&
      paneSizes.right === normalizedPaneSizes.right
    ) {
      return;
    }
    setPaneSizes(normalizedPaneSizes);
  }, [normalizedPaneSizes.left, normalizedPaneSizes.right, paneSizes.left, paneSizes.right]);

  const resizePane = (side: ResizeSide, requestedSize: number) => {
    const viewportWidth = window.innerWidth;
    const visibleRightWidth = viewportWidth <= 1120 ? 0 : normalizedPaneSizes.right;
    const maximum =
      side === 'left'
        ? Math.max(210, Math.min(380, viewportWidth - visibleRightWidth - 560))
        : Math.max(270, viewportWidth - normalizedPaneSizes.left - 560);
    const minimum = side === 'left' ? 210 : 270;
    const nextSize = Math.round(Math.min(maximum, Math.max(minimum, requestedSize)));
    setPaneSizes({ ...normalizedPaneSizes, [side]: nextSize });
  };

  const getCurrentLocation = (): NavigationLocation => ({
    view,
    personId: selectedPerson?.id,
    storyId: selectedStory?.id,
    filePath: fileNotePath || undefined,
  });

  const rememberCurrentLocation = (nextLocation: NavigationLocation) => {
    const currentLocation = getCurrentLocation();
    const nextHistory = recordNavigation(
      navigationHistoryRef.current,
      currentLocation,
      nextLocation,
      locationsMatch,
    );
    if (nextHistory === navigationHistoryRef.current) return;
    navigationHistoryRef.current = nextHistory;
    setNavigationHistoryVersion((version) => version + 1);
  };

  useEffect(() => {
    let alive = true;
    const generation = ++libraryGenerationRef.current;
    setLoadingLibrary(true);
    loadLibrary(normalizedKnowledgeRoot || undefined, locale)
      .then((snapshot) => {
        if (!alive || generation !== libraryGenerationRef.current) return;
        setLibrary(snapshot);
        if (!normalizedKnowledgeRoot && snapshot.root) setKnowledgeRoot(snapshot.root);
      })
      .catch(() => {
        if (alive && generation === libraryGenerationRef.current) {
          setLibrary(fallbackLibrary);
        }
      })
      .finally(() => {
        if (alive && generation === libraryGenerationRef.current) {
          setLoadingLibrary(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [normalizedKnowledgeRoot, locale]);

  useEffect(() => {
    const root = library.root;
    if (!isTauri || !root) return;
    void updateMessageContext(root, locale).catch((error) => {
      console.error('Could not update the message channel context.', error);
    });
  }, [library.root, locale]);

  useEffect(() => {
    if (!isTauri) return undefined;
    let unlistenStatus = () => {};
    let unlistenSaved = () => {};
    let unlistenConversation = () => {};
    const refreshStatus = () => {
      void getMessageChannelStatus().then(setMessageChannelStatus).catch(() => undefined);
    };
    refreshStatus();
    void listenMessageChannelStatus(refreshStatus).then((stop) => { unlistenStatus = stop; });
    void listenMessageCaptureSaved(() => {
      setTreeRefresh((current) => current + 1);
      const root = libraryRootRef.current || library.root;
      void loadLibrary(root || undefined, locale).then(setLibrary).catch(() => undefined);
    }).then((stop) => { unlistenSaved = stop; });
    void listenMessageConversationUpdated((conversationId) => {
      void listConversations()
        .then(setConversationSummaries)
        .catch(() => undefined);
      if (
        activeConversationIdRef.current === conversationId
        && appViewRef.current === 'ai'
      ) {
        void loadConversation(conversationId)
          .then((record) => {
            const messages = sanitizeConversationMessages(record.uiMessages || []);
            conversationSaveSnapshotRef.current = {
              id: conversationId,
              json: JSON.stringify(messages),
            };
            setChatMessages(messages);
          })
          .catch(() => undefined);
      } else {
        setUnreadConversationIds((current) =>
          current.includes(conversationId) ? current : [...current, conversationId],
        );
      }
    }).then((stop) => { unlistenConversation = stop; });
    return () => {
      unlistenStatus();
      unlistenSaved();
      unlistenConversation();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openPerson = async (person: Person, remember = true) => {
    if (remember) {
      rememberCurrentLocation({ view: 'person', personId: person.id });
    }
    setSelectedPerson(person);
    setSelectedStory(null);
    setView('person');
    setNoteLoading(true);
    try {
      const markdown = person.filePath
        ? await readNote(library.root, person.filePath)
        : `# ${person.name}\n\n${person.summary}`;
      setNoteMarkdown(markdown);
    } catch {
      setNoteMarkdown(
        fallbackMarkdown[person.filePath || ''] || `# ${person.name}\n\n${person.summary}`,
      );
    } finally {
      setNoteLoading(false);
    }
  };

  const openStory = async (story: Story, remember = true) => {
    if (remember) {
      rememberCurrentLocation({ view: 'story', storyId: story.id });
    }
    setSelectedStory(story);
    setSelectedPerson(null);
    setView('story');
    setNoteLoading(true);
    try {
      const markdown = story.filePath
        ? await readNote(library.root, story.filePath)
        : `# ${story.title}\n\n${story.summary}`;
      setNoteMarkdown(markdown);
    } catch {
      setNoteMarkdown(
        fallbackMarkdown[story.filePath || ''] || `# ${story.title}\n\n${story.summary}`,
      );
    } finally {
      setNoteLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'person' && selectedPerson) {
      const localized = library.people.find((item) => item.id === selectedPerson.id);
      if (localized && localized.filePath !== selectedPerson.filePath) {
        void openPerson(localized, false);
      }
    } else if (view === 'story' && selectedStory) {
      const localized = library.stories.find((item) => item.id === selectedStory.id);
      if (localized && localized.filePath !== selectedStory.filePath) {
        void openStory(localized, false);
      }
    }
  }, [library, locale]);

  const navigate = (nextView: View, remember = true) => {
    if (remember) rememberCurrentLocation({ view: nextView });
    setView(nextView);
    if (nextView !== 'person') setSelectedPerson(null);
    if (nextView !== 'story') setSelectedStory(null);
    if (nextView !== 'file') {
      setFileNotePath(null);
      setFileNoteSource('library');
    }
    if (!['person', 'story', 'file'].includes(nextView)) setNoteMarkdown('');
  };

  const restoreLocation = (location: NavigationLocation) => {
    if (location.view === 'person' && location.personId) {
      const person = library.people.find((item) => item.id === location.personId);
      if (person) {
        void openPerson(person, false);
        return;
      }
    }
    if (location.view === 'story' && location.storyId) {
      const story = library.stories.find((item) => item.id === location.storyId);
      if (story) {
        void openStory(story, false);
        return;
      }
    }
    if (location.view === 'file' && location.filePath) {
      openFileNote(location.filePath, false);
      return;
    }
    navigate(location.view, false);
  };

  const goBack = () => {
    const result = stepBack(navigationHistoryRef.current, getCurrentLocation());
    if (!result.target) {
      restoreLocation({ view: 'home' });
      return;
    }
    navigationHistoryRef.current = result.history;
    setNavigationHistoryVersion((version) => version + 1);
    restoreLocation(result.target);
  };

  const goForward = () => {
    const result = stepForward(navigationHistoryRef.current, getCurrentLocation());
    if (!result.target) return;
    navigationHistoryRef.current = result.history;
    setNavigationHistoryVersion((version) => version + 1);
    restoreLocation(result.target);
  };

  const noteRelativePath = useMemo(() => {
    if (view === 'file') return fileNotePath;
    if (view === 'person') return selectedPerson?.filePath || null;
    if (view === 'story') return selectedStory?.filePath || null;
    return null;
  }, [view, fileNotePath, selectedPerson, selectedStory]);
  const noteRoot = useMemo(() => {
    if (view === 'file') {
      return fileNoteSource === 'myInfo' ? library.myInfoRoot : library.root;
    }
    if (view === 'person' || view === 'story') {
      return library.root;
    }
    return '';
  }, [view, fileNoteSource, library.myInfoRoot, library.root]);
  const noteSummaryKey = useMemo(() => {
    if (!['file', 'person', 'story'].includes(view)) return null;
    const identity = noteRelativePath || currentPageTitle || view;
    const body = noteMarkdown.trim();
    if (!identity || !body) return null;
    const modelSignature =
      isTauri && modelConfig.apiKey.trim() && modelConfig.baseUrl.trim() && modelConfig.model.trim()
        ? `${modelConfig.provider}:${modelConfig.baseUrl.trim()}:${modelConfig.model.trim()}`
        : 'local';
    return [
      locale,
      noteRoot || 'root',
      identity,
      hashText(body),
      modelSignature,
    ].join('::');
  }, [
    currentPageTitle,
    locale,
    modelConfig.apiKey,
    modelConfig.baseUrl,
    modelConfig.model,
    modelConfig.provider,
    noteMarkdown,
    noteRelativePath,
    noteRoot,
    view,
  ]);
  const noteSummaryPreview = useMemo(
    () => extractLocalNoteSummary(noteMarkdown),
    [noteMarkdown],
  );
  const noteSummary = useMemo<NoteSummaryRecord | null>(
    () =>
      noteSummaryKey
        ? noteSummaryCacheRef.current[noteSummaryKey] || (
            noteSummaryPreview
              ? {
                  text: noteSummaryPreview,
                  source: 'local',
                  status:
                    isTauri &&
                    !!noteRelativePath &&
                    !!modelConfig.apiKey.trim() &&
                    !!modelConfig.baseUrl.trim() &&
                    !!modelConfig.model.trim()
                      ? 'loading'
                      : 'ready',
                }
              : null
          )
        : null,
    [
      noteRelativePath,
      noteSummaryKey,
      noteSummaryPreview,
      noteSummaryVersion,
      modelConfig.apiKey,
      modelConfig.baseUrl,
      modelConfig.model,
    ],
  );
  useEffect(() => {
    if (!noteSummaryKey || noteLoading) return;
    if (!noteMarkdown.trim()) return;
    if (noteMarkdown.includes('无法打开') || noteMarkdown.includes('Cannot open')) return;

    const localSummary = noteSummaryPreview;
    if (!localSummary) return;

    const cached = noteSummaryCacheRef.current[noteSummaryKey];
    const canUseModel =
      isTauri &&
      !!noteRelativePath &&
      !!modelConfig.apiKey.trim() &&
      !!modelConfig.baseUrl.trim() &&
      !!modelConfig.model.trim();

    if (!canUseModel) {
      if (
        !cached ||
        cached.text !== localSummary ||
        cached.source !== 'local' ||
        cached.status !== 'ready'
      ) {
        noteSummaryCacheRef.current[noteSummaryKey] = {
          text: localSummary,
          source: 'local',
          status: 'ready',
        };
        setNoteSummaryVersion((version) => version + 1);
      }
      return;
    }

    if (cached?.status === 'ready' && cached.source === 'ai') return;
    if (cached?.status === 'loading' && cached.source === 'ai') return;

    noteSummaryCacheRef.current[noteSummaryKey] = {
      text: localSummary,
      source: 'local',
      status: 'loading',
    };
    setNoteSummaryVersion((version) => version + 1);

    const requestId = ++noteSummaryRequestIdRef.current;
    const question =
      locale === 'zh'
        ? `请基于当前打开的笔记写一段可复用的摘要。只输出一段简体中文，不要 Markdown、项目符号、标题或路径引用。重点说明这篇笔记在说什么、它和本地知识库里相关内容的关系，以及最重要的结论或用途。`
        : `Based on the currently open note, write a reusable summary. Output one plain English paragraph only, with no Markdown, bullets, title, or path citations. Focus on what the note is about, how it relates to nearby local knowledge, and the most important conclusion or use.`;

    void (async () => {
      try {
        const response = await chatCompletion({
          apiKey: modelConfig.apiKey,
          baseUrl: modelConfig.baseUrl,
          model: modelConfig.model,
          provider: modelConfig.provider,
          reasoningEffort: modelConfig.reasoningEffort,
          question,
          locale,
          knowledgeRoot: noteRoot || library.root,
          contextPaths: noteRelativePath ? [noteRelativePath] : [],
          history: [],
        });
        if (noteSummaryRequestIdRef.current !== requestId) return;
        const aiSummary = shortenSummaryText(response);
        noteSummaryCacheRef.current[noteSummaryKey] = {
          text: aiSummary || localSummary,
          source: aiSummary ? 'ai' : 'local',
          status: 'ready',
        };
        setNoteSummaryVersion((version) => version + 1);
      } catch {
        if (noteSummaryRequestIdRef.current !== requestId) return;
        noteSummaryCacheRef.current[noteSummaryKey] = {
          text: localSummary,
          source: 'local',
          status: 'ready',
        };
        setNoteSummaryVersion((version) => version + 1);
      }
    })();
  }, [
    library.root,
    locale,
    modelConfig.apiKey,
    modelConfig.baseUrl,
    modelConfig.model,
    noteLoading,
    noteMarkdown,
    noteRelativePath,
    noteRoot,
    noteSummaryKey,
    noteSummaryPreview,
  ]);
  useEffect(() => {
    if (!railEditorTarget) return;
    if (!noteRelativePath || railEditorTarget.relativePath !== noteRelativePath) {
      setRailEditorTarget(null);
    }
  }, [noteRelativePath, railEditorTarget]);

  useEffect(() => {
    if (railEditorTarget) {
      setActiveTextSurface('editor');
      return;
    }
    if (noteRelativePath && ['person', 'story', 'file'].includes(view)) {
      setActiveTextSurface('reader');
      return;
    }
    setActiveTextSurface('none');
  }, [noteRelativePath, railEditorTarget, view]);

  useEffect(() => {
    if (railEditorTarget) {
      railEditorDraftRef.current = railEditorTarget.markdown;
    } else {
      railEditorDraftRef.current = '';
    }
  }, [railEditorTarget]);

  const persistNoteContent = async (
    root: string,
    relativePath: string,
    content: string,
    options: { quiet?: boolean } = {},
  ) => {
    if (!isTauri) {
      setToast({ message: t('desktopOnlyAction'), kind: 'status' });
      return;
    }
    const generation = libraryGenerationRef.current;
    try {
      await writeNote(root, relativePath, content);
      if (generation !== libraryGenerationRef.current) return;
      setNoteMarkdown(content);
      setTreeRefresh((current) => current + 1);
      const snapshot = await loadLibrary(root || undefined, locale);
      if (generation !== libraryGenerationRef.current) return;
      setLibrary(snapshot);
      if (!options.quiet) {
        setToast({ message: t('noteSaved'), kind: 'status' });
      }
    } catch (error) {
      if (generation !== libraryGenerationRef.current) return;
      setToast({
        message: `${t('noteSaveFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
      throw error;
    }
  };

  const handleBeginRailEdit = (target: {
    relativePath: string;
    title: string;
    markdown: string;
  }) => {
    const source = view === 'file' ? fileNoteSourceRef.current : 'library';
    const root =
      source === 'myInfo' ? library.myInfoRoot : libraryRootRef.current || library.root;
    setRailEditorTarget({ root, ...target });
  };

  const handlePreviewRailEdit = (content: string) => {
    if (!railEditorTarget) return;
    railEditorDraftRef.current = content;
    if (railEditorTarget.relativePath === noteRelativePath) {
      setNoteMarkdown(content);
    }
  };

  const handleAutosaveRailEdit = async (content: string) => {
    if (!railEditorTarget) return;
    await persistNoteContent(
      railEditorTarget.root,
      railEditorTarget.relativePath,
      content,
      { quiet: true },
    );
    setRailEditorTarget((current) =>
      current && current.relativePath === railEditorTarget.relativePath
        ? { ...current, markdown: content }
        : current,
    );
    railEditorDraftRef.current = content;
    setNoteSummaryVersion((current) => current + 1);
  };

  const handleToggleRailEdit = async (target: {
    relativePath: string;
    title: string;
    markdown: string;
  }) => {
    if (railEditorTarget?.relativePath === target.relativePath) {
      const latest = railEditorDraftRef.current;
      if (latest !== railEditorTarget.markdown) {
        await persistNoteContent(railEditorTarget.root, railEditorTarget.relativePath, latest, {
          quiet: true,
        });
      }
      setRailEditorTarget(null);
      return;
    }
    handleBeginRailEdit(target);
  };

  const handleDeleteNote = async (relativePath: string) => {
    if (!isTauri) {
      setToast({ message: t('desktopOnlyAction'), kind: 'status' });
      return;
    }
    const confirmed = await confirm(t('deleteNoteConfirm'), {
      title: t('deleteNote'),
      kind: 'warning',
      okLabel: t('deleteNote'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) return;
    const source = view === 'file' ? fileNoteSourceRef.current : 'library';
    const root =
      source === 'myInfo' ? library.myInfoRoot : libraryRootRef.current || library.root;
    const generation = libraryGenerationRef.current;
    try {
      await deleteNote(root, relativePath);
      if (generation !== libraryGenerationRef.current) return;
      setToast({ message: t('noteDeleted'), kind: 'status' });
      goBack();
      const snapshot = await loadLibrary(root || undefined, locale);
      if (generation !== libraryGenerationRef.current) return;
      setLibrary(snapshot);
    } catch (error) {
      if (generation !== libraryGenerationRef.current) return;
      setToast({
        message: `${t('deleteNoteFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
    }
  };

  const handleSetTier = async (relativePath: string, tier: string) => {
    if (!isTauri) {
      setToast({ message: t('desktopOnlyAction'), kind: 'status' });
      return;
    }
    const source = view === 'file' ? fileNoteSourceRef.current : 'library';
    const root =
      source === 'myInfo' ? library.myInfoRoot : libraryRootRef.current || library.root;
    const generation = libraryGenerationRef.current;
    try {
      await setNoteTier(root, relativePath, tier);
      if (generation !== libraryGenerationRef.current) return;
      if (view === 'file' && fileNotePath === relativePath) {
        const markdown = await readNote(root, relativePath);
        if (generation !== libraryGenerationRef.current) return;
        setNoteMarkdown(markdown);
      } else {
        if (selectedPerson?.filePath === relativePath) {
          setSelectedPerson({ ...selectedPerson, tier });
        } else if (selectedStory?.filePath === relativePath) {
          setSelectedStory({ ...selectedStory, tier });
        }
        setLibrary((current) => ({
          ...current,
          people: current.people.map((item) =>
            item.filePath === relativePath ? { ...item, tier } : item,
          ),
          stories: current.stories.map((item) =>
            item.filePath === relativePath ? { ...item, tier } : item,
          ),
        }));
      }
      if (source === 'library') {
        const snapshot = await loadLibrary(root || undefined, locale);
        if (generation !== libraryGenerationRef.current) return;
        setLibrary(snapshot);
      }
      setToast({ message: t('tierUpdated'), kind: 'status' });
    } catch (error) {
      if (generation !== libraryGenerationRef.current) return;
      setToast({
        message: `${t('setTier')}${locale === 'zh' ? '失败：' : ' failed: '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
    }
  };

  const handleLibraryChanged = () => {
    const root = libraryRootRef.current || library.root;
    const generation = libraryGenerationRef.current;
    void loadLibrary(root || undefined, locale)
      .then((snapshot) => {
        if (generation === libraryGenerationRef.current) {
          setLibrary(snapshot);
        }
      })
      .catch(() => {});
    if (view === 'file' && fileNotePath) {
      const source = fileNoteSourceRef.current;
      const noteRoot = source === 'myInfo' ? library.myInfoRoot : root;
      readNote(noteRoot, fileNotePath)
        .then((raw) => {
          if (generation === libraryGenerationRef.current) {
            setNoteMarkdown(raw);
          }
        })
        .catch(() => {
          if (generation !== libraryGenerationRef.current) return;
          navigate('home');
          setToast({ message: t('fileGone'), kind: 'status' });
        });
    }
  };

  const handleSidebarLibraryChanged = () => {
    setMultiSelectActive(false);
    setSelectedContextNotes([]);
    handleLibraryChanged();
  };

  const toggleContextNote = (path: string, title: string) => {
    setSelectedContextNotes((current) => {
      const existing = current.findIndex((note) => note.path === path);
      if (existing >= 0) return current.filter((note) => note.path !== path);
      return [...current, { path, title }];
    });
  };

  const cancelMultiSelect = () => {
    setMultiSelectActive(false);
    setSelectedContextNotes([]);
  };

  const dismissComposerContext = () => {
    setImplicitContextDismissed(true);
    if (selectedContextNotes.length > 0) cancelMultiSelect();
  };

  const handleSwitchRoot = async () => {
    if (!isTauri) return;
    const selected = await chooseKnowledgeFolder();
    if (!selected) return;
    libraryGenerationRef.current += 1;
    libraryRootRef.current = selected;
    setLoadingLibrary(true);
    setKnowledgeRoot(selected);
    cancelMultiSelect();
    navigate('home');
    setToast({
      message: `${t('switchedRoot')}${locale === 'zh' ? '：' : ': '}${selected}`,
      kind: 'status',
    });
  };

  const handleCreateMaterial = async (name: string, icon: string) => {
    const root = libraryRootRef.current || library.root;
    try {
      const created = await createNote(root, '', name, icon);
      setTreeRefresh((current) => current + 1);
      setAddMaterialOpen(false);
      openFileNote(created);
      setToast({
        message: `${t('addMaterialCreate')}${locale === 'zh' ? '：' : ': '}${name}`,
        kind: 'status',
      });
    } catch (error) {
      setToast({
        message: `${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
    }
  };

  const openFileNote = (
    filePath: string,
    remember = true,
    sourceOverride?: 'library' | 'myInfo',
  ) => {
    if (remember) rememberCurrentLocation({ view: 'file', filePath });
    setView('file');
    setFileNotePath(filePath);
    const source: 'library' | 'myInfo' =
      sourceOverride || (filePath.startsWith('plans/') ? 'myInfo' : 'library');
    setFileNoteSource(source);
    setSelectedPerson(null);
    setSelectedStory(null);
    setNoteLoading(true);
    const root = source === 'myInfo' ? library.myInfoRoot : library.root;
    readNote(root, filePath)
      .then((raw) => setNoteMarkdown(raw))
      .catch(() =>
        setNoteMarkdown(
          locale === 'zh'
            ? `# 无法打开\n\n找不到文件 \`${filePath}\`。`
            : `# Cannot open\n\nFile \`${filePath}\` not found.`,
        ),
      )
      .finally(() => setNoteLoading(false));
  };

  const handleTierMove = (itemId: string, targetTier: TierId, targetIndex: number) => {
    setLibrary((current) => ({
      ...current,
      priorities: reorderTierItems(current.priorities, itemId, targetTier, targetIndex),
    }));

    if (!isTauri) return;
    const root = libraryRootRef.current;
    const generation = libraryGenerationRef.current;
    tierMoveQueueRef.current = tierMoveQueueRef.current
      .then(async () => {
        await moveTierItem(root, itemId, targetTier, targetIndex);
        if (generation !== libraryGenerationRef.current) return;
        const snapshot = await loadLibrary(root || undefined, locale);
        if (generation !== libraryGenerationRef.current) return;
        setLibrary(snapshot);
      })
      .catch(async (error) => {
        if (generation !== libraryGenerationRef.current) return;
        try {
          const snapshot = await loadLibrary(root || undefined, locale);
          if (generation === libraryGenerationRef.current) {
            setLibrary(snapshot);
          }
        } catch {
          // Keep the optimistic state if the library cannot be reloaded yet.
        }
        setToast({
          message:
            locale === 'zh'
              ? `榜单调整失败：${String(error).replace(/^Error:\s*/i, '')}`
              : `Could not update the tier list: ${String(error).replace(/^Error:\s*/i, '')}`,
          kind: 'status',
        });
      });
  };

  const openPlanSection = (section: PlanSection) => {
    if (section === 'log') {
      navigate('log');
      return;
    }
    openFileNote(getPlanSectionFile(section, locale), true, 'myInfo');
  };

  const toggleMyInfoRetrieval = (section: MyInfoSectionId) => {
    setMyInfoRetrieval((current) => {
      const next = { ...current, [section]: !current[section] };
      try {
        writeStorageValue(MY_INFO_RETRIEVAL_KEY, JSON.stringify(next));
      } catch {
        // Storage failures must not prevent changing the current session.
      }
      return next;
    });
  };

  const openInternalNote = (target: Omit<InternalNoteTarget, 'label'>) => {
    if (target.kind === 'person') {
      const person = library.people.find((item) => item.id === target.id);
      if (person) {
        void openPerson(person);
        return;
      }
    }
    if (target.kind === 'story') {
      const story = library.stories.find((item) => item.id === target.id);
      if (story) {
        void openStory(story);
        return;
      }
    }
    if (target.kind === 'file') {
      openFileNote(target.id);
      return;
    }
    setToast({
      message: locale === 'zh' ? '没有找到对应的本地文章' : 'The linked local note was not found',
      kind: 'status',
    });
  };

  const startCaptureConversation = async (
    input: string,
    transcriptionMode: TranscriptionMode,
  ) => {
    if (chatBusy) return;
    if (skillCatalog.skills.find((skill) => skill.id === BUILTIN_MEDIA_SKILL_ID)?.enabled === false) {
      throw new Error(t('captureMediaSkillDisabled'));
    }

    if (activeConversationId) {
      await persistConversationMessages(activeConversationId, chatMessages);
    }

    const conversationTitle = locale === 'zh' ? '媒体转文字' : 'Media to text';
    const summary = await createConversation(conversationTitle);
    setConversationSummaries((current) => [
      summary,
      ...current.filter((item) => item.id !== summary.id),
    ]);
    conversationSaveSnapshotRef.current = { id: summary.id, json: '[]' };
    setActiveConversationId(summary.id);
    setChatMessages([]);
    setCaptureGuideOpen(false);

    const initialMessage = locale === 'zh'
      ? `请把下面这段分享文案里的媒体链接转成文字，并整理成笔记。使用${transcriptionMode === 'local' ? '本地' : '语音'}模型。\n\n${input.trim()}`
      : `Please transcribe the media link in the share text below and organize it into a note. Use the ${transcriptionMode === 'local' ? 'local' : 'cloud'} speech model.\n\n${input.trim()}`;
    await startAgentTurn(summary.id, initialMessage, [], BUILTIN_MEDIA_SKILL_ID);
  };

  const ensureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    const summary = await createConversation(locale === 'zh' ? '新对话' : 'New conversation');
    setConversationSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    conversationSaveSnapshotRef.current = { id: summary.id, json: '[]' };
    setActiveConversationId(summary.id);
    return summary.id;
  };

  const titleFromMessages = (messages: readonly ChatMessage[]) => {
    const firstUser = messages.find((message) => message.role === 'user')?.content.trim();
    if (!firstUser) return locale === 'zh' ? '新对话' : 'New conversation';
    const firstLine = firstUser.split('\n')[0] || firstUser;
    return firstLine.length > 32 ? `${firstLine.slice(0, 31)}…` : firstLine;
  };

  const persistConversationMessages = async (id: string, messages: ChatMessage[]) => {
    const snapshot = JSON.stringify(messages);
    if (
      conversationSaveSnapshotRef.current?.id === id &&
      conversationSaveSnapshotRef.current.json === snapshot
    ) {
      return;
    }

    conversationSaveSnapshotRef.current = { id, json: snapshot };
    const save = conversationSaveQueueRef.current.then(() =>
      saveConversationUi(
        id,
        messages,
        titleFromMessages(messages),
        estimateContextBytes(messages),
      ),
    );
    conversationSaveQueueRef.current = save.then(
      () => undefined,
      () => undefined,
    );

    try {
      const summary = await save;
      setConversationSummaries((current) =>
        [summary, ...current.filter((item) => item.id !== summary.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      );
    } catch {
      if (
        conversationSaveSnapshotRef.current?.id === id &&
        conversationSaveSnapshotRef.current.json === snapshot
      ) {
        conversationSaveSnapshotRef.current = null;
      }
      // A later content change can retry without interrupting the conversation.
    }
  };

  useEffect(() => {
    let alive = true;
    setLoadingConversations(true);
    listConversations()
      .then(async (summaries) => {
        if (!alive) return;
        if (summaries.length === 0) {
          const created = await createConversation(locale === 'zh' ? '新对话' : 'New conversation');
          if (!alive) return;
          setConversationSummaries([created]);
          conversationSaveSnapshotRef.current = { id: created.id, json: '[]' };
          setActiveConversationId(created.id);
          setChatMessages([]);
          return;
        }
        setConversationSummaries(summaries);
        const latest = summaries[0];
        setActiveConversationId(latest.id);
        const record = await loadConversation(latest.id);
        if (!alive) return;
        const messages = sanitizeConversationMessages(record.uiMessages || []);
        conversationSaveSnapshotRef.current = {
          id: latest.id,
          json: JSON.stringify(messages),
        };
        setChatMessages(messages);
      })
      .catch(() => {
        if (!alive) return;
        setConversationSummaries([]);
        setChatMessages([]);
      })
      .finally(() => {
        if (alive) setLoadingConversations(false);
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setContextBytes(estimateContextBytes(chatMessages));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [chatMessages]);

  useEffect(() => {
    try {
      writeStorageValue(CONVERSATION_USAGE_KEY, JSON.stringify(usageByConversation));
    } catch {
      // Usage metrics are best-effort and never block chat.
    }
  }, [usageByConversation]);

  useEffect(() => {
    if (!activeConversationId || loadingConversations) return;
    const timer = window.setTimeout(() => {
      void persistConversationMessages(activeConversationId, chatMessages);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, chatMessages, loadingConversations]);

  useEffect(() => {
    if (view !== 'ai' || !activeConversationId) return;
    setUnreadConversationIds((current) =>
      current.includes(activeConversationId)
        ? current.filter((id) => id !== activeConversationId)
        : current,
    );
  }, [view, activeConversationId]);

  const handleSelectConversation = async (id: string) => {
    setUnreadConversationIds((current) =>
      current.includes(id) ? current.filter((conversationId) => conversationId !== id) : current,
    );
    if (chatBusy || id === activeConversationId) return;
    if (activeConversationId) {
      await persistConversationMessages(activeConversationId, chatMessages);
    }
    const record = await loadConversation(id);
    const messages = sanitizeConversationMessages(record.uiMessages || []);
    conversationSaveSnapshotRef.current = { id, json: JSON.stringify(messages) };
    setActiveConversationId(id);
    setChatMessages(messages);
  };

  const handleDeleteConversation = async (id: string) => {
    if (chatBusy) return;
    const summaries = await deleteConversation(id);
    setUnreadConversationIds((current) =>
      current.includes(id) ? current.filter((conversationId) => conversationId !== id) : current,
    );
    setUsageByConversation((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setConversationSummaries(summaries);
    if (id !== activeConversationId) return;
    if (summaries.length > 0) {
      const record = await loadConversation(summaries[0].id);
      const messages = sanitizeConversationMessages(record.uiMessages || []);
      conversationSaveSnapshotRef.current = {
        id: summaries[0].id,
        json: JSON.stringify(messages),
      };
      setActiveConversationId(summaries[0].id);
      setChatMessages(messages);
      return;
    }
    const created = await createConversation(locale === 'zh' ? '新对话' : 'New conversation');
    setConversationSummaries([created]);
    conversationSaveSnapshotRef.current = { id: created.id, json: '[]' };
    setActiveConversationId(created.id);
    setChatMessages([]);
  };

  const handleConfirmMemory = async (messageId: string, suggestion: MemorySuggestion) => {
    const saved = await confirmMemorySuggestion({ ...suggestion, locale });
    if (
      view === 'file'
      && fileNoteSource === 'myInfo'
      && saved.sourcePath
      && fileNotePath === saved.sourcePath
    ) {
      const markdown = await readNote(library.myInfoRoot, saved.sourcePath);
      setNoteMarkdown(markdown);
    }
    setChatMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, memoryStatus: 'saved' } : message,
      ),
    );
  };

  const handleDismissMemory = (messageId: string) => {
    setChatMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, memoryStatus: 'dismissed' } : message,
      ),
    );
  };

  // ── Agent event listener ──
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    const refreshLibraryAfterAgent = async () => {
      const root = libraryRootRef.current;
      const generation = libraryGenerationRef.current;
      try {
        const snapshot = await loadLibrary(root || undefined, locale);
        if (generation !== libraryGenerationRef.current) return;
        setLibrary(snapshot);
      } catch {
        // Best-effort refresh after AI tools modify the library.
      }
      const openPath = fileNotePathRef.current;
      if (openPath && root && generation === libraryGenerationRef.current) {
        try {
          const markdown = await readNote(root, openPath);
          if (generation === libraryGenerationRef.current) {
            setNoteMarkdown(markdown);
          }
        } catch {
          // Keep the current content if the file cannot be read again.
        }
      }
    };
    listenAgentEvents((event: AgentEvent) => {
      if (cancelled) return;
      const eventConversationId = event.conversationId || activeConversationIdRef.current;
      if (
        (event.type === 'done' || event.type === 'error')
        && eventConversationId
        && (
          appViewRef.current !== 'ai'
          || eventConversationId !== activeConversationIdRef.current
        )
      ) {
        setUnreadConversationIds((current) =>
          current.includes(eventConversationId)
            ? current
            : [...current, eventConversationId],
        );
      }
      if (
        event.conversationId
        && activeConversationIdRef.current
        && event.conversationId !== activeConversationIdRef.current
      ) {
        return;
      }
      switch (event.type) {
        case 'text_delta':
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.text }];
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant' as const, content: event.text, createdAt: Date.now() }];
          });
          break;
        case 'state':
          break;
        case 'tool_call_start':
          setChatMessages((prev) => [
            ...prev,
            {
              id: event.id,
              role: 'tool_call' as const,
              content: '',
              createdAt: Date.now(),
              toolName: event.name,
              toolArgs: '',
              toolStatus: 'running' as const,
            },
          ]);
          break;
        case 'tool_call_args':
          setChatMessages((prev) =>
            prev.map((m) =>
              m.role === 'tool_call' && m.id === event.id
                ? { ...m, toolArgs: (m.toolArgs || '') + event.args }
                : m,
            ),
          );
          break;
        case 'tool_result':
          setChatMessages((prev) =>
            prev.map((m) =>
              m.role === 'tool_call' && m.id === event.id
                ? { ...m, toolStatus: event.success ? 'done' as const : 'failed' as const, toolOutput: event.output }
                : m,
            ),
          );
          break;
        case 'memory_suggestion':
          setChatMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'memory_suggestion' as const,
              content: event.suggestion.content,
              createdAt: Date.now(),
              memorySuggestion: event.suggestion,
              memoryStatus: 'pending' as const,
            },
          ]);
          break;
        case 'usage': {
          const conversationId = event.conversationId || activeConversationIdRef.current;
          if (!conversationId) break;
          setUsageByConversation((current) => {
            const previous = current[conversationId] || EMPTY_USAGE;
            return {
              ...current,
              [conversationId]: {
                promptTokens: previous.promptTokens + event.usage.promptTokens,
                completionTokens: previous.completionTokens + event.usage.completionTokens,
                totalTokens: previous.totalTokens + event.usage.totalTokens,
                cacheHitTokens: previous.cacheHitTokens + event.usage.cacheHitTokens,
                cacheMissTokens: previous.cacheMissTokens + event.usage.cacheMissTokens,
                cacheWriteTokens: previous.cacheWriteTokens + event.usage.cacheWriteTokens,
                requestCount: previous.requestCount,
              },
            };
          });
          break;
        }
        case 'request_started': {
          const conversationId = event.conversationId || activeConversationIdRef.current;
          if (!conversationId) break;
          setUsageByConversation((current) => {
            const previous = current[conversationId] || EMPTY_USAGE;
            return {
              ...current,
              [conversationId]: { ...previous, requestCount: previous.requestCount + 1 },
            };
          });
          break;
        }
        case 'done':
          setChatBusy(false);
          void refreshLibraryAfterAgent();
          break;
        case 'error':
          setChatMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: locale === 'zh' ? `错误：${event.message}` : `Error: ${event.message}`,
              createdAt: Date.now(),
            },
          ]);
          setChatBusy(false);
          void refreshLibraryAfterAgent();
          break;
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [locale]);

  const startAgentTurn = async (
    conversationId: string,
    question: string,
    priorMessages: ChatMessage[],
    skillIdOverride?: string | null,
  ) => {
    const clean = question.trim();
    if (!clean) return;

    setUnreadConversationIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : current,
    );
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: clean,
      createdAt: Date.now(),
    };
    setChatMessages((current) => [...current, userMessage]);
    if (view !== 'ai') setView('ai');
    setChatBusy(true);

    if (
      isTauri
      && (
        !modelConfig.apiKey.trim()
        || !modelConfig.baseUrl.trim()
        || !modelConfig.model.trim()
      )
    ) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: t('notConfigured'),
        createdAt: Date.now(),
      };
      setChatMessages((current) => [...current, assistantMessage]);
      setChatBusy(false);
      return;
    }

    try {
      const catalogModel = getCatalogModel(
        modelCatalog,
        modelConfig.providerId,
        modelConfig.model,
      );
      const modelReasoningEfforts = catalogModel?.reasoningOptions.length
        ? catalogModel.reasoningOptions
        : catalogModel?.reasoning
          ? [modelConfig.reasoningEffort]
          : [];
      await sendAgentMessage({
        conversationId,
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
        provider: modelConfig.provider,
        reasoningEffort: modelConfig.reasoningEffort,
        modelContextWindow: catalogModel?.limit?.context,
        modelMaxOutputTokens: catalogModel?.limit?.output,
        modelReasoningEfforts,
        webReader: modelSettings.webReader,
        message: clean,
        locale,
        knowledgeRoot: libraryRootRef.current || library.root,
        skillId: skillIdOverride === undefined
          ? selectedSkillId || undefined
          : skillIdOverride || undefined,
        contextPaths: selectedContextPaths.length > 0
          ? selectedContextPaths
          : implicitContextEnabled ? implicitContextPaths : [],
        noteSummary: selectedContextPaths.length > 0 || !implicitContextEnabled
          ? undefined
          : noteSummary?.text,
        enabledMyInfoSections: enabledMyInfoSections(myInfoRetrieval),
        includePriorities,
        currentPage: selectedContextPaths.length > 0 || !implicitContextEnabled
          ? undefined
          : currentPageTitle,
        history: priorMessages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map(({ role, content: messageContent }) => ({
            role: role as 'user' | 'assistant',
            content: messageContent,
          })),
      });
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            locale === 'zh'
              ? `模型请求失败：${String(error)}`
              : `Model request failed: ${String(error)}`,
          createdAt: Date.now(),
        },
      ]);
      setChatBusy(false);
    }
  };

  const handleSend = async (question: string, skillId: string | null) => {
    const clean = question.trim();
    if (!clean || chatBusy) return;

    const conversationId = await ensureConversation();
    await startAgentTurn(conversationId, clean, chatMessages, skillId);
  };

  const handleNewChat = async () => {
    if (chatBusy) return;
    if (activeConversationId) {
      await persistConversationMessages(activeConversationId, chatMessages);
    }
    const summary = await createConversation(locale === 'zh' ? '新对话' : 'New conversation');
    setConversationSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    conversationSaveSnapshotRef.current = { id: summary.id, json: '[]' };
    setActiveConversationId(summary.id);
    setChatMessages([]);
  };
  const saveModelConfig = (config: ModelSettings) => {
    const normalized = normalizeModelSettings(config);
    setModelSettings(normalized);
    modelConfigSaveQueueRef.current = modelConfigSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistModelConfig(normalized))
      .catch((error) => {
        console.error('Could not save the model config.', error);
      });
  };

  const handleRenameConversation = async (id: string, title: string) => {
    const normalizedTitle = await renameConversation(id, title);
    setConversationSummaries((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, title: normalizedTitle } : conversation,
      ),
    );
  };
  const selectComposerModel = (providerKey: string, model: string) => {
    const provider = modelSettings.providers[providerKey];
    if (!provider || !configuredProviderModels(provider).includes(model)) return;
    saveModelConfig({
      ...modelSettings,
      activeProvider: providerKey,
      providers: {
        ...modelSettings.providers,
        [providerKey]: { ...provider, model },
      },
    });
  };
  const selectReasoningEffort = (reasoningEffort: ReasoningEffort) => {
    saveModelConfig({ ...modelSettings, reasoningEffort });
  };

  const internalNoteTargets = useMemo<InternalNoteTarget[]>(() => {
    const targets: InternalNoteTarget[] = [];
    const add = (kind: InternalNoteKind, id: string, labels: Array<string | undefined>) => {
      for (const label of labels) {
        const clean = label?.trim();
        if (clean) targets.push({ kind, id, label: clean });
      }
    };

    for (const person of library.people) {
      add('person', person.id, [person.name, person.nameZh]);
    }
    for (const story of library.stories) {
      add('story', story.id, [story.title, story.titleEn]);
    }
    return targets;
  }, [library]);

  const rightRailOpen = view === 'ai' || railEditorTarget !== null;
  return (
    <div
      className={`app-shell ${settingsOpen ? 'settings-mode' : ''} ${isMacOSPlatform ? 'platform-macos-shell' : 'platform-custom-shell'} ${resizingPane ? `panel-resizing panel-resizing-${resizingPane}` : ''} ${rightRailOpen ? '' : 'right-rail-collapsed'}`}
      style={
        {
          '--sidebar-width': `${normalizedPaneSizes.left}px`,
          '--right-rail-width': rightRailOpen ? `${normalizedPaneSizes.right}px` : '0px',
        } as React.CSSProperties
      }
    >
      <AppTitlebar
        locale={locale}
        canGoBack={navigationHistoryRef.current.back.length > 0}
        canGoForward={navigationHistoryRef.current.forward.length > 0}
        activeTextSurface={activeTextSurface}
        onBack={goBack}
        onForward={goForward}
        onSwitchRoot={handleSwitchRoot}
        onHelp={() => void openExternalUrl(PRODUCT_WEBSITE)}
        onFeedback={() => void openExternalUrl(FEEDBACK_URL)}
        onSettings={() => {
          setSettingsSection('appearance');
          setSettingsOpen(true);
        }}
        settingsActive={settingsOpen}
        onTextCommand={runTextCommand}
        isTextCommandEnabled={isTextCommandEnabled}
      />
      {settingsOpen ? (
        <SettingsPage
          initialSection={settingsSection}
          locale={locale}
          config={modelSettings}
          catalog={modelCatalog}
          catalogLoading={modelCatalogLoading}
          catalogError={modelCatalogError}
          skillCatalog={skillCatalog}
          skillCatalogLoading={skillCatalogLoading}
          skillCatalogError={skillCatalogError}
          onSkillCatalogChange={setSkillCatalog}
          onRefreshCatalog={() => void refreshModelCatalog(true).catch(() => undefined)}
          onChange={saveModelConfig}
          onLocale={setLocale}
          themeMode={themeMode}
          onThemeMode={setThemeMode}
          surfaceScheme={surfaceScheme}
          onSurfaceScheme={setSurfaceScheme}
          currencyMode={currencyMode}
          onCurrencyMode={setCurrencyMode}
          onClose={() => setSettingsOpen(false)}
          t={t}
        />
      ) : (
        <>
      <Sidebar
        locale={locale}
        view={view}
        libraryRoot={normalizedKnowledgeRoot || library.root}
        activeFilePath={view === 'file' ? fileNotePath : null}
        multiSelectActive={multiSelectActive}
        selectedContextPaths={selectedContextPaths}
        onNavigate={navigate}
        onNewChat={handleNewChat}
        chatBusy={chatBusy}
        onOpenFile={openFileNote}
        onToggleMultiSelect={() => setMultiSelectActive((current) => !current)}
        onCancelMultiSelect={cancelMultiSelect}
        onToggleContextNote={toggleContextNote}
        onLibraryChanged={handleSidebarLibraryChanged}
        onSwitchRoot={handleSwitchRoot}
        onSearchLibrary={() => setLibrarySearchOpen(true)}
        onSettings={() => {
          setSettingsSection('appearance');
          setSettingsOpen(true);
        }}
        onOpenMessages={() => {
          setSettingsSection('messages');
          setSettingsOpen(true);
        }}
        messageChannelStatus={messageChannelStatus}
        refreshToken={treeRefresh}
        notify={(message) => setToast({ message, kind: 'status' })}
        t={t}
      />
      <PaneResizer
        side="left"
        size={normalizedPaneSizes.left}
        locale={locale}
        onResize={(size) => resizePane('left', size)}
        onReset={() =>
          setPaneSizes({ ...normalizedPaneSizes, left: defaultPaneSizes.left })
        }
        onResizing={setResizingPane}
      />

      <main className="main-pane">
        <div ref={contentScrollRef} className="content-scroll auto-hide-scrollbar">
          {loadingLibrary ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={24} />
              <span>{t('loading')}</span>
            </div>
          ) : (
            <>
              {view === 'ai' && (
                <ConversationView
                  conversationId={activeConversationId}
                  locale={locale}
                  messages={chatMessages}
                  busy={chatBusy}
                  onInternalNavigate={openInternalNote}
                  onConfirmMemory={handleConfirmMemory}
                  onDismissMemory={handleDismissMemory}
                />
              )}
              {view === 'home' && (
                <HomeView
                  locale={locale}
                  library={library}
                  onOpenAppearanceSettings={() => {
                    setSettingsSection('appearance');
                    setSettingsOpen(true);
                  }}
                  onCapture={() => setCaptureGuideOpen(true)}
                  onOrganize={() => navigate('ai')}
                  onPlan={() => navigate('plan')}
                  onPriority={(note) => openFileNote(note.filePath, true, 'library')}
                  onMovePriority={handleTierMove}
                  t={t}
                />
              )}
              {view === 'people' && (
                <PeopleView
                  locale={locale}
                  people={library.people}
                  onPerson={openPerson}
                  onBack={goBack}
                  t={t}
                />
              )}
              {view === 'stories' && (
                <StoriesView
                  locale={locale}
                  stories={library.stories}
                  onStory={openStory}
                  onAdd={() => setCaptureGuideOpen(true)}
                  onBack={goBack}
                  t={t}
                />
              )}
              {view === 'person' && selectedPerson && (
                <NoteView
                  title={selectedPerson.name}
                  tier={selectedPerson.tier}
                  markdown={noteMarkdown}
                  loading={noteLoading}
                  locale={locale}
                  currentTarget={{ kind: 'person', id: selectedPerson.id }}
                  internalTargets={internalNoteTargets}
                  onInternalNavigate={openInternalNote}
                  onBack={goBack}
                  summary={noteSummary}
                  notePath={noteRelativePath}
                  isEditing={railEditorTarget?.relativePath === noteRelativePath}
                  onToggleEdit={() =>
                    noteRelativePath &&
                    handleToggleRailEdit({
                      relativePath: noteRelativePath,
                      title: selectedPerson.name,
                      markdown: noteMarkdown,
                    })
                  }
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) =>
                    selectedPerson.filePath && handleSetTier(selectedPerson.filePath, nextTier)
                  }
                  onActivateReaderCommands={() => setActiveTextSurface('reader')}
                  onRegisterReaderCommands={(controller) => {
                    readerTextCommandsRef.current = controller;
                  }}
                />
              )}
              {view === 'story' && selectedStory && (
                <NoteView
                  title={
                    locale === 'zh' ? selectedStory.title : selectedStory.titleEn || selectedStory.title
                  }
                  tier={selectedStory.tier}
                  markdown={noteMarkdown}
                  loading={noteLoading}
                  locale={locale}
                  currentTarget={{ kind: 'story', id: selectedStory.id }}
                  internalTargets={internalNoteTargets}
                  onInternalNavigate={openInternalNote}
                  onBack={goBack}
                  summary={noteSummary}
                  notePath={noteRelativePath}
                  isEditing={railEditorTarget?.relativePath === noteRelativePath}
                  onToggleEdit={() =>
                    noteRelativePath &&
                    handleToggleRailEdit({
                      relativePath: noteRelativePath,
                      title:
                        locale === 'zh'
                          ? selectedStory.title
                          : selectedStory.titleEn || selectedStory.title,
                      markdown: noteMarkdown,
                    })
                  }
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) =>
                    selectedStory.filePath && handleSetTier(selectedStory.filePath, nextTier)
                  }
                  onActivateReaderCommands={() => setActiveTextSurface('reader')}
                  onRegisterReaderCommands={(controller) => {
                    readerTextCommandsRef.current = controller;
                  }}
                />
              )}
              {view === 'plan' && (
                <PlanView
                  locale={locale}
                  retrievalState={myInfoRetrieval}
                  onSection={openPlanSection}
                  onToggleRetrieval={toggleMyInfoRetrieval}
                  onBack={goBack}
                  onHome={() => navigate('home')}
                  includePriorities={includePriorities}
                  onTogglePriorities={() => setIncludePriorities(!includePriorities)}
                  onAdd={() => setAddMaterialOpen(true)}
                  t={t}
                />
              )}
              {view === 'file' && fileNotePath && (
                <NoteView
                  title={fileNoteTitle}
                  tier={fileNoteTier}
                  markdown={noteMarkdown}
                  loading={noteLoading}
                  locale={locale}
                  currentTarget={{ kind: 'file', id: fileNotePath }}
                  internalTargets={internalNoteTargets}
                  onInternalNavigate={openInternalNote}
                  onBack={goBack}
                  summary={noteSummary}
                  notePath={noteRelativePath}
                  isEditing={railEditorTarget?.relativePath === noteRelativePath}
                  onToggleEdit={() =>
                    noteRelativePath &&
                    handleToggleRailEdit({
                      relativePath: noteRelativePath,
                      title: fileNoteTitle,
                      markdown: noteMarkdown,
                    })
                  }
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) => handleSetTier(fileNotePath, nextTier)}
                  onActivateReaderCommands={() => setActiveTextSurface('reader')}
                  onRegisterReaderCommands={(controller) => {
                    readerTextCommandsRef.current = controller;
                  }}
                />
              )}
              {view === 'log' && (
                <div className="page plan-view">
                  <div className="page-kicker-row">
                    <PageBackButton locale={locale} onBack={goBack} />
                  </div>
                  <HealthLogPanel locale={locale} />
                </div>
              )}
            </>
          )}

        </div>

        <ChatComposer
          busy={chatBusy}
          onSend={handleSend}
          onAbort={() => abortAgent(activeConversationId)}
          placeholder={t('askPlaceholder')}
          sendLabel={t('send')}
          stopLabel={t('stopGenerating')}
          inputRef={chatComposerRef}
          currentPage={composerContextLabel}
          onClearCurrentPage={dismissComposerContext}
          contextBytes={contextBytes}
          contextMaxBytes={AGENT_CONTEXT_MAX_BYTES}
          usage={usageByConversation[activeConversationId] || EMPTY_USAGE}
          modelConfig={modelConfig}
          modelSettings={modelSettings}
          modelCatalog={modelCatalog}
          skillCatalog={skillCatalog}
          selectedSkillId={selectedSkillId}
          onSelectedSkillChange={setSelectedSkillId}
          onOpenSkillSettings={() => {
            setSettingsSection('skills');
            setSettingsOpen(true);
          }}
          onModelChange={selectComposerModel}
          onReasoningEffortChange={selectReasoningEffort}
          currencyMode={currencyMode}
          locale={locale}
        />
      </main>

      <PaneResizer
        side="right"
        size={normalizedPaneSizes.right}
        locale={locale}
        onResize={(size) => resizePane('right', size)}
        onReset={() =>
          setPaneSizes({ ...normalizedPaneSizes, right: defaultPaneSizes.right })
        }
        onResizing={setResizingPane}
      />

      <RightRail
        locale={locale}
        aiActive={view === 'ai'}
        editingNote={railEditorTarget}
        conversations={conversationSummaries}
        activeConversationId={activeConversationId}
        unreadConversationIds={unreadConversationIds}
        chatBusy={chatBusy}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onPreviewEditingNote={handlePreviewRailEdit}
        onAutosaveEditingNote={handleAutosaveRailEdit}
        onActivateEditorCommands={() => setActiveTextSurface('editor')}
        onRegisterEditorCommands={(controller) => {
          editorTextCommandsRef.current = controller;
        }}
        onNewChat={handleNewChat}
        t={t}
      />
        </>
      )}

      {captureGuideOpen && (
        <CaptureGuideDialog
          locale={locale}
          config={modelConfig}
          mediaSkillEnabled={skillCatalog.skills.find((skill) => skill.id === BUILTIN_MEDIA_SKILL_ID)?.enabled !== false}
          onOpenSkillSettings={() => {
            setCaptureGuideOpen(false);
            setSettingsSection('skills');
            setSettingsOpen(true);
          }}
          onClose={() => setCaptureGuideOpen(false)}
          onSendToChat={startCaptureConversation}
          t={t}
        />
      )}

      {addMaterialOpen && (
        <AddMaterialDialog
          locale={locale}
          t={t}
          onClose={() => setAddMaterialOpen(false)}
          onCreate={handleCreateMaterial}
        />
      )}

      {librarySearchOpen && (
        <LibrarySearchDialog
          root={normalizedKnowledgeRoot || library.root}
          locale={locale}
          onClose={() => setLibrarySearchOpen(false)}
          onOpenFile={(relativePath) => {
            setLibrarySearchOpen(false);
            openFileNote(relativePath, true, 'library');
          }}
        />
      )}

      <TextInputContextMenu locale={locale} />

      {toast && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
          <Check size={17} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

function PaneResizer({
  side,
  size,
  locale,
  onResize,
  onReset,
  onResizing,
}: {
  side: ResizeSide;
  size: number;
  locale: Locale;
  onResize: (size: number) => void;
  onReset: () => void;
  onResizing: (side: ResizeSide | null) => void;
}) {
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startSize = size;
    onResizing(side);
    document.body.classList.add('resizing-panels');

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      onResize(side === 'left' ? startSize + delta : startSize - delta);
    };
    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      document.body.classList.remove('resizing-panels');
      onResizing(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  return (
    <div
      className={`pane-resizer pane-resizer-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={
        locale === 'zh'
          ? side === 'left'
            ? '调整左侧栏宽度'
            : '调整右侧栏宽度'
          : side === 'left'
            ? 'Resize left panel'
            : 'Resize right panel'
      }
      onPointerDown={startResize}
      onDoubleClick={onReset}
    >
      <span />
    </div>
  );
}

type TitlebarMenu = 'file' | 'edit' | 'help';
type TextCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll';
type TextCommandSurface = 'none' | 'editor' | 'reader';
type TextInputElement = HTMLInputElement | HTMLTextAreaElement;

interface TextCommandController {
  canRun: (command: TextCommand) => boolean;
  run: (command: TextCommand) => void | Promise<void>;
}

const EDITOR_TEXT_COMMANDS: TextCommand[] = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'delete',
  'selectAll',
];

const READER_TEXT_COMMANDS: TextCommand[] = ['copy', 'selectAll'];

const TEXT_COMMAND_DIVIDERS = new Set<TextCommand>(['cut', 'selectAll']);

function textCommandLabel(locale: Locale, command: TextCommand): string {
  const labels: Record<TextCommand, TranslationKey> = {
    undo: 'menuUndo',
    redo: 'menuRedo',
    cut: 'menuCut',
    copy: 'menuCopy',
    paste: 'menuPaste',
    delete: 'menuDelete',
    selectAll: 'menuSelectAll',
  };
  return translate(locale, labels[command]);
}

function textCommandShortcut(command: TextCommand): string {
  const mod = isMacOSPlatform ? '⌘' : 'Ctrl+';
  const shiftMod = isMacOSPlatform ? '⇧⌘' : 'Ctrl+';
  const shortcuts: Partial<Record<TextCommand, string>> = {
    undo: `${mod}Z`,
    redo: isMacOSPlatform ? `${shiftMod}Z` : `${shiftMod}Y`,
    cut: `${mod}X`,
    copy: `${mod}C`,
    paste: `${mod}V`,
    selectAll: `${mod}A`,
  };
  return shortcuts[command] || '';
}

function textCommandIcon(command: TextCommand): ReactNode {
  const icons: Record<TextCommand, ReactNode> = {
    undo: <Undo2 size={13} />,
    redo: <Redo2 size={13} />,
    cut: <Scissors size={13} />,
    copy: <Copy size={13} />,
    paste: <ClipboardPaste size={13} />,
    delete: <Trash2 size={13} />,
    selectAll: <Square size={13} />,
  };
  return icons[command];
}

async function readClipboardText(): Promise<string> {
  if (isTauri) return readText();
  return navigator.clipboard?.readText ? navigator.clipboard.readText() : '';
}

async function writeClipboardText(text: string): Promise<void> {
  if (isTauri) {
    await writeText(text);
    return;
  }
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
}

function selectionIsInside(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return element.contains(range.commonAncestorContainer);
}

function selectElementText(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectedTextInEditor(view: EditorView): string {
  return view.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => view.state.sliceDoc(range.from, range.to))
    .join('\n');
}

async function runEditorTextCommand(view: EditorView, command: TextCommand): Promise<void> {
  view.focus();
  if (command === 'undo') {
    cmUndo(view);
    return;
  }
  if (command === 'redo') {
    cmRedo(view);
    return;
  }
  if (command === 'copy' || command === 'cut') {
    const selectedText = selectedTextInEditor(view);
    if (selectedText) await writeClipboardText(selectedText);
    if (command === 'copy' || !selectedText) return;
  }
  if (command === 'paste') {
    const text = await readClipboardText();
    if (!text) return;
    const transaction = view.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    }));
    view.dispatch(transaction);
    return;
  }
  if (command === 'delete' || command === 'cut') {
    const transaction = view.state.changeByRange((range) => {
      const to = range.empty ? Math.min(range.from + 1, view.state.doc.length) : range.to;
      return {
        changes: { from: range.from, to },
        range: EditorSelection.cursor(range.from),
      };
    });
    view.dispatch(transaction);
    return;
  }
  if (command === 'selectAll') {
    view.dispatch({
      selection: EditorSelection.single(0, view.state.doc.length),
      scrollIntoView: true,
    });
  }
}

function AppTitlebar({
  locale,
  canGoBack,
  canGoForward,
  activeTextSurface,
  onBack,
  onForward,
  onSwitchRoot,
  onHelp,
  onFeedback,
  onSettings,
  settingsActive,
  onTextCommand,
  isTextCommandEnabled,
}: {
  locale: Locale;
  canGoBack: boolean;
  canGoForward: boolean;
  activeTextSurface: TextCommandSurface;
  onBack: () => void;
  onForward: () => void;
  onSwitchRoot: () => void;
  onHelp: () => void;
  onFeedback: () => void;
  onSettings: () => void;
  settingsActive: boolean;
  onTextCommand: (command: TextCommand) => void;
  isTextCommandEnabled: (command: TextCommand) => boolean;
}) {
  const [openMenu, setOpenMenu] = useState<TitlebarMenu | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnPointerDown = (event: globalThis.PointerEvent) => {
      if (!menuBarRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  const toggleMenu = (menu: TitlebarMenu) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const runMenuAction = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  const runWindowCommand = async (command: 'minimize' | 'maximize' | 'close') => {
    if (!isTauri) return;

    const appWindow = getCurrentWindow();
    if (command === 'minimize') {
      await appWindow.minimize();
    } else if (command === 'maximize') {
      await appWindow.toggleMaximize();
    } else {
      await appWindow.close();
    }
  };

  return (
    <header
      className={`app-titlebar ${isMacOSPlatform ? 'platform-macos' : 'platform-custom-controls'}`}
      data-tauri-drag-region
    >
      <div className="titlebar-leading">
        <div className="titlebar-brand" data-tauri-drag-region>
          <strong>Coffee Note</strong>
        </div>

        <div className="titlebar-history" aria-label={locale === 'zh' ? '页面历史' : 'Page history'}>
          <button
            type="button"
            aria-label={locale === 'zh' ? '返回上一页' : 'Go back'}
            disabled={!canGoBack}
            onClick={onBack}
          >
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={locale === 'zh' ? '前往下一页' : 'Go forward'}
            disabled={!canGoForward}
            onClick={onForward}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </button>
        </div>

        <nav
          ref={menuBarRef}
          className="titlebar-menu-bar"
          aria-label={locale === 'zh' ? '应用菜单' : 'Application menu'}
        >
          <div className="titlebar-menu-group">
            <button
              type="button"
              className={openMenu === 'file' ? 'active' : ''}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'file'}
              onClick={() => toggleMenu('file')}
            >
              {locale === 'zh' ? '文件' : 'File'}
            </button>
            {openMenu === 'file' && (
              <div className="titlebar-menu-popover" role="menu">
                <button type="button" role="menuitem" onClick={() => runMenuAction(onSwitchRoot)}>
                  <FolderOpen size={15} />
                  <span>{locale === 'zh' ? '切换资料库...' : 'Switch library...'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="titlebar-menu-group">
            <button
              type="button"
              className={openMenu === 'edit' ? 'active' : ''}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'edit'}
              onClick={() => toggleMenu('edit')}
            >
              {locale === 'zh' ? '编辑' : 'Edit'}
            </button>
            {openMenu === 'edit' && (
              <div className="titlebar-menu-popover" role="menu">
                {EDITOR_TEXT_COMMANDS.map((command) => (
                  <React.Fragment key={command}>
                    {TEXT_COMMAND_DIVIDERS.has(command) && (
                      <div className="titlebar-menu-divider" />
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={
                        !isTextCommandEnabled(command) ||
                        (activeTextSurface === 'reader' && !READER_TEXT_COMMANDS.includes(command))
                      }
                      onClick={() => runMenuAction(() => onTextCommand(command))}
                    >
                      <span>{textCommandLabel(locale, command)}</span>
                      {textCommandShortcut(command) && <kbd>{textCommandShortcut(command)}</kbd>}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="titlebar-menu-group">
            <button
              type="button"
              className={openMenu === 'help' ? 'active' : ''}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'help'}
              onClick={() => toggleMenu('help')}
            >
              {locale === 'zh' ? '帮助' : 'Help'}
            </button>
            {openMenu === 'help' && (
              <div className="titlebar-menu-popover" role="menu">
                <button type="button" role="menuitem" onClick={() => runMenuAction(onHelp)}>
                  <BookOpen size={15} />
                  <span>{locale === 'zh' ? 'Coffee Note 帮助' : 'Coffee Note help'}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => runMenuAction(onFeedback)}>
                  <Github size={15} />
                  <span>{locale === 'zh' ? '反馈问题' : 'Send feedback'}</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`titlebar-settings-entry ${settingsActive ? 'active' : ''}`}
            onClick={onSettings}
            aria-current={settingsActive ? 'page' : undefined}
          >
            {locale === 'zh' ? '设置' : 'Settings'}
          </button>
        </nav>
      </div>

      <div className="titlebar-drag-area" data-tauri-drag-region />

      <div className="window-controls">
        {!isMacOSPlatform && (
          <>
            <button
              type="button"
              aria-label={locale === 'zh' ? '最小化窗口' : 'Minimize window'}
              onClick={() => void runWindowCommand('minimize')}
            >
              <Minus size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={locale === 'zh' ? '最大化或还原窗口' : 'Maximize or restore window'}
              onClick={() => void runWindowCommand('maximize')}
            >
              <Square size={11} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="window-close"
              aria-label={locale === 'zh' ? '关闭窗口' : 'Close window'}
              onClick={() => void runWindowCommand('close')}
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function UpdateButton({ locale }: { locale: Locale }) {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updatePhase, setUpdatePhase] = useState<
    'checking' | 'downloading' | 'launching' | 'error' | null
  >(null);

  useEffect(() => {
    let alive = true;
    if (isTauri) {
      checkForUpdate()
        .then((version) => {
          if (alive) setAvailableVersion(version);
        })
        .catch(() => {
          // Update checks stay silent so an offline launch is never interrupted.
        });
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!availableVersion) return null;

  const handleUpdate = async () => {
    if (installingUpdate) return;
    const isWindows = navigator.userAgent.toLowerCase().includes('windows');
    if (!isTauri || !isWindows) {
      await openExternalUrl(PRODUCT_WEBSITE);
      return;
    }

    setInstallingUpdate(true);
    setUpdateProgress(0);
    setUpdatePhase('checking');
    let stopListening: (() => void) | undefined;
    try {
      stopListening = await onSelfUpdateProgress((progress) => {
        setUpdatePhase(progress.status);
        setUpdateProgress(progress.percent);
      });
      await downloadAndInstallUpdate();
    } catch {
      setUpdatePhase('error');
      try {
        await openExternalUrl(PRODUCT_WEBSITE);
      } finally {
        setInstallingUpdate(false);
        setUpdateProgress(0);
      }
    } finally {
      stopListening?.();
    }
  };

  return (
    <button
      type="button"
      className={`sidebar-update ${installingUpdate ? 'installing' : ''}`}
      onClick={() => void handleUpdate()}
      aria-label={
        locale === 'zh'
          ? `更新至 Coffee Note ${availableVersion}`
          : `Update Coffee Note to ${availableVersion}`
      }
      disabled={installingUpdate}
    >
      {installingUpdate ? (
        <svg
          className={`update-ring ${updatePhase === 'checking' ? 'spin' : ''}`}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="update-ring-track" cx="12" cy="12" r="9" />
          <circle
            className="update-ring-progress"
            cx="12"
            cy="12"
            r="9"
            transform="rotate(-90 12 12)"
            strokeDasharray={
              updatePhase === 'checking'
                ? `${2 * Math.PI * 9 * 0.25} ${2 * Math.PI * 9}`
                : 2 * Math.PI * 9
            }
            strokeDashoffset={
              updatePhase === 'checking'
                ? 0
                : 2 * Math.PI * 9 * (1 - updateProgress / 100)
            }
          />
        </svg>
      ) : (
        <Download size={15} strokeWidth={2} />
      )}
    </button>
  );
}

// ── Library file tree with context menu ────────────────────────────────────

const NOTE_ICONS: Record<string, ReactNode> = {
  filetext: <FileText size={15} />,
  bookopen: <BookOpen size={15} />,
  notebookpen: <NotebookPen size={15} />,
  target: <Target size={15} />,
  lightbulb: <Lightbulb size={15} />,
  archive: <Archive size={15} />,
  star: <Star size={15} />,
  userround: <UserRound size={15} />,
  messagecircle: <MessageCircleMore size={15} />,
  users: <UsersRound size={15} />,
  folder: <FolderOpen size={15} />,
  pill: <Pill size={15} />,
  dumbbell: <Dumbbell size={15} />,
  utensils: <Utensils size={15} />,
  moon: <Moon size={15} />,
  globe: <Globe2 size={15} />,
  activity: <Activity size={15} />,
  house: <House size={15} />,
  wrench: <Wrench size={15} />,
  layers: <Layers3 size={15} />,
  monitor: <Monitor size={15} />,
  bot: <Bot size={15} />,
  sparkles: <Sparkles size={15} />,
};
const NOTE_ICON_KEYS = Object.keys(NOTE_ICONS);

interface CtxMenuState {
  x: number;
  y: number;
  kind: 'file' | 'folder';
  relativePath: string;
  name: string;
}

interface CtxMenuActions {
  onOpen: (menu: CtxMenuState) => void;
  onCopyPath: (menu: CtxMenuState) => void;
  onNewFolder: (menu: CtxMenuState) => void;
  onNewNote: (menu: CtxMenuState) => void;
  onRename: (menu: CtxMenuState) => void;
  onDelete: (menu: CtxMenuState) => void;
  onCut: (menu: CtxMenuState) => void;
  onCopy: (menu: CtxMenuState) => void;
  onPaste: (menu: CtxMenuState) => void;
  onShowInFolder: (menu: CtxMenuState) => void;
  onCleanup?: (menu: CtxMenuState) => void;
}

type TreeOrder = Record<string, string[]>;
type TreeDragEntry = Pick<DirectoryEntry, 'relativePath' | 'isDir'>;
type TreeDropPosition = 'before' | 'inside' | 'after';
type TreeDropTarget = {
  relativePath: string;
  isDir: boolean;
  position: TreeDropPosition;
};
type TreeDropHit = {
  target: TreeDropTarget;
  element: HTMLElement;
};

// Module-level clipboard so cut/copy survives menu close/open cycles.
let fsClipboard: { action: 'copy' | 'cut'; source: string } | null = null;

function joinLibraryPath(root: string, relativePath: string): string {
  return `${root.replace(/[\\/]+$/, '')}/${relativePath}`;
}

function parentDirOf(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index > 0 ? relativePath.slice(0, index) : '';
}

function treeOrderStorageKey(root: string): string {
  return storageKey(`library-tree-order:v1:${root.replace(/\\/g, '/').toLocaleLowerCase()}`);
}

function replacePathPrefix(path: string, previous: string, next: string): string {
  if (path === previous) return next;
  return path.startsWith(`${previous}/`) ? `${next}${path.slice(previous.length)}` : path;
}

function ContextMenu({
  menu,
  onClose,
  actions,
  t,
}: {
  menu: CtxMenuState;
  onClose: () => void;
  actions: CtxMenuActions;
  t: (key: TranslationKey) => string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeWheel = () => onClose();
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', closeKey, true);
    document.addEventListener('wheel', closeWheel, { capture: true, passive: true });
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', closeKey, true);
      document.removeEventListener('wheel', closeWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const isFolder = menu.kind === 'folder';
  const isRoot = isFolder && menu.relativePath === '';
  const canPaste = fsClipboard !== null;
  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - 340),
  };

  const item = (
    icon: ReactNode,
    label: string,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      className={`ctx-menu-item${disabled ? ' disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return createPortal(
    <div className="ctx-menu" ref={menuRef} style={style}>
      {item(
        isFolder ? <FolderSearch size={13} /> : <FileText size={13} />,
        t('menuOpen'),
        () => actions.onOpen(menu),
      )}
      {isFolder && (
        <>
          <div className="ctx-menu-divider" />
          {item(<FolderPlus size={13} />, t('menuNewFolder'), () => actions.onNewFolder(menu))}
          {item(<FileText size={13} />, t('menuNewNote'), () => actions.onNewNote(menu))}
        </>
      )}
      <div className="ctx-menu-divider" />
      {item(<Link2 size={13} />, t('menuCopyPath'), () => actions.onCopyPath(menu))}
      <div className="ctx-menu-divider" />
      {item(<Scissors size={13} />, t('menuCut'), () => actions.onCut(menu))}
      {item(<Copy size={13} />, t('menuCopy'), () => actions.onCopy(menu))}
      {item(
        <ClipboardPaste size={13} />,
        t('menuPaste'),
        () => actions.onPaste(menu),
        !canPaste,
      )}
      {!isRoot && (
        <>
          <div className="ctx-menu-divider" />
          {item(<Pencil size={13} />, t('menuRename'), () => actions.onRename(menu))}
          {item(<Trash2 size={13} />, t('menuDelete'), () => actions.onDelete(menu))}
        </>
      )}
      <div className="ctx-menu-divider" />
      {item(<FolderSearch size={13} />, t('menuShowInFolder'), () => actions.onShowInFolder(menu))}
      {isRoot && actions.onCleanup && (
        <>
          <div className="ctx-menu-divider" />
          {item(<Trash2 size={13} />, t('menuCleanup'), () => actions.onCleanup!(menu))}
        </>
      )}
    </div>,
    document.body,
  );
}

function TextCommandMenu({
  x,
  y,
  locale,
  commands,
  controller,
  onClose,
}: {
  x: number;
  y: number;
  locale: Locale;
  commands: TextCommand[];
  controller: TextCommandController;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeWheel = () => onClose();
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', closeKey, true);
    document.addEventListener('wheel', closeWheel, { capture: true, passive: true });
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', closeKey, true);
      document.removeEventListener('wheel', closeWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 224),
    top: Math.min(y, window.innerHeight - 330),
  };

  return createPortal(
    <div className="ctx-menu text-command-menu" ref={menuRef} style={style}>
      {commands.map((command) => (
        <React.Fragment key={command}>
          {TEXT_COMMAND_DIVIDERS.has(command) && commands.length > 2 && (
            <div className="ctx-menu-divider" />
          )}
          <button
            type="button"
            className={`ctx-menu-item${controller.canRun(command) ? '' : ' disabled'}`}
            disabled={!controller.canRun(command)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClose();
              void controller.run(command);
            }}
          >
            {textCommandIcon(command)}
            <span>{textCommandLabel(locale, command)}</span>
            {textCommandShortcut(command) && <kbd>{textCommandShortcut(command)}</kbd>}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body,
  );
}

interface ConversationContextMenuState {
  conversation: ConversationSummary;
  x: number;
  y: number;
}

function ConversationContextMenu({
  menu,
  locale,
  mutationDisabled,
  onRename,
  onDelete,
  onClose,
}: {
  menu: ConversationContextMenuState;
  locale: Locale;
  mutationDisabled: boolean;
  onRename: (conversation: ConversationSummary) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const closeWheel = () => onClose();
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', closeKey, true);
    document.addEventListener('wheel', closeWheel, { capture: true, passive: true });
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', closeKey, true);
      document.removeEventListener('wheel', closeWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const copy = async (text: string) => {
    onClose();
    await writeClipboardText(text);
  };
  const withConversationPath = async (action: (path: string) => void | Promise<void>) => {
    onClose();
    try {
      const path = await getConversationFilePath(menu.conversation.id);
      if (path) await action(path);
    } catch {
      // The record may have been removed outside Coffee Note; keep the menu action best-effort.
    }
  };
  const style: React.CSSProperties = {
    left: Math.max(4, Math.min(menu.x, window.innerWidth - 230)),
    top: Math.max(4, Math.min(menu.y, window.innerHeight - 258)),
  };

  return createPortal(
    <div className="ctx-menu conversation-context-menu" ref={menuRef} style={style}>
      <button
        type="button"
        className="ctx-menu-item"
        disabled={mutationDisabled}
        onClick={() => {
          onClose();
          onRename(menu.conversation);
        }}
      >
        <Pencil size={13} />
        <span>{locale === 'zh' ? '重命名对话' : 'Rename conversation'}</span>
      </button>
      <div className="ctx-menu-divider" />
      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => void copy(menu.conversation.id)}
      >
        <Hash size={13} />
        <span>{locale === 'zh' ? '复制对话 ID' : 'Copy conversation ID'}</span>
      </button>
      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => void withConversationPath((path) => writeClipboardText(path))}
      >
        <Copy size={13} />
        <span>{locale === 'zh' ? '复制对话路径' : 'Copy conversation path'}</span>
      </button>
      <button
        type="button"
        className="ctx-menu-item"
        onClick={() => void withConversationPath(revealInFolder)}
      >
        <FolderSearch size={13} />
        <span>{locale === 'zh' ? '在文件管理器中显示' : 'Reveal in File Explorer'}</span>
      </button>
      <div className="ctx-menu-divider" />
      <button
        type="button"
        className="ctx-menu-item danger"
        disabled={mutationDisabled}
        onClick={() => {
          onClose();
          onDelete(menu.conversation.id);
        }}
      >
        <Trash2 size={13} />
        <span>{locale === 'zh' ? '删除对话' : 'Delete conversation'}</span>
      </button>
    </div>,
    document.body,
  );
}

interface TreeEditState {
  mode: 'create-folder' | 'create-note';
  path: string;
}

// Internal and transitional folders stay hidden from the tree; newly created
// folders (via the context menu) are always visible.
const TRANSITIONAL_ROOT_FOLDERS = [
  'audits',
  'licenses',
  'methods',
  'papers',
  'products',
  'profile',
  'records',
  'research-log',
  'sources',
  'templates',
  'topics',
  'inbox',
];
const HIDDEN_ROOT_FOLDERS = new Set([
  'audits',
  'licenses',
  'methods',
  'papers',
  'products',
  'profile',
  'records',
  'research-log',
  'sources',
  'templates',
  'topics',
  'inbox',
  'catalog',
  'plans',
]);

function LibraryTree({
  root,
  locale,
  t,
  activeFilePath,
  multiSelectActive,
  selectedContextPaths,
  onOpenFile,
  onToggleMultiSelect,
  onCancelMultiSelect,
  onToggleContextNote,
  onLibraryChanged,
  refreshToken,
  notify,
}: {
  root: string;
  locale: Locale;
  t: (key: TranslationKey) => string;
  activeFilePath: string | null;
  multiSelectActive: boolean;
  selectedContextPaths: string[];
  onOpenFile: (relativePath: string) => void;
  onToggleMultiSelect: () => void;
  onCancelMultiSelect: () => void;
  onToggleContextNote: (relativePath: string, title: string) => void;
  onLibraryChanged: () => void;
  refreshToken: number;
  notify: (message: string) => void;
}) {
  const libraryLabel = directoryDisplayName(root) || root;
  const [entriesByDir, setEntriesByDir] = useState<Record<string, DirectoryEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [edit, setEdit] = useState<TreeEditState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [quickNoteCreating, setQuickNoteCreating] = useState(false);
  const [treeOrder, setTreeOrder] = useState<TreeOrder>({});
  const [dragEntry, setDragEntry] = useState<TreeDragEntry | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const dragEntryRef = useRef<TreeDragEntry | null>(null);
  const pointerDragRef = useRef<{
    entry: TreeDragEntry;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    active: boolean;
    target: TreeDropTarget | null;
    ghost: HTMLElement | null;
  } | null>(null);
  const dropTargetRef = useRef<TreeDropTarget | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const [renameTarget, setRenameTarget] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef(root);
  rootRef.current = root;

  const updateTreeOrder = useCallback((updater: (current: TreeOrder) => TreeOrder) => {
    setTreeOrder((current) => {
      const next = updater(current);
      try {
        window.localStorage.setItem(treeOrderStorageKey(rootRef.current), JSON.stringify(next));
      } catch {
        // Ordering remains available for this session if local storage is unavailable.
      }
      return next;
    });
  }, []);

  const orderedEntries = useCallback((dirPath: string, entries: DirectoryEntry[]) => {
    const saved = treeOrder[dirPath] || [];
    if (saved.length === 0) return entries;
    const positions = new Map(saved.map((path, index) => [path, index]));
    return [...entries].sort((left, right) => {
      const leftIndex = positions.get(left.relativePath);
      const rightIndex = positions.get(right.relativePath);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return 0;
    });
  }, [treeOrder]);

  const refreshDir = useCallback((dirPath: string) => {
    listDirectory(rootRef.current, dirPath)
      .then((entries) => {
        setEntriesByDir((current) => ({ ...current, [dirPath]: entries }));
      })
      .catch(() => {});
  }, []);

  const loadDir = useCallback(
    (dirPath: string) => {
      setEntriesByDir((current) => {
        if (current[dirPath]) return current;
        listDirectory(rootRef.current, dirPath)
          .then((entries) => {
            setEntriesByDir((previous) => ({ ...previous, [dirPath]: entries }));
          })
          .catch(() => {});
        return current;
      });
    },
    [],
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(treeOrderStorageKey(root));
      const parsed: unknown = saved ? JSON.parse(saved) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setTreeOrder({});
        return;
      }
      const valid = Object.entries(parsed).every(
        ([, paths]) => Array.isArray(paths) && paths.every((path) => typeof path === 'string'),
      );
      setTreeOrder(valid ? parsed as TreeOrder : {});
    } catch {
      setTreeOrder({});
    }
  }, [root]);

  useEffect(() => {
    setEntriesByDir({});
    setExpanded({});
    listDirectory(root, '')
      .then((entries) => setEntriesByDir({ '': entries }))
      .catch(() => {});
  }, [root, refreshToken]);

  useEffect(() => {
    if (edit) editRef.current?.select();
  }, [edit]);

  useEffect(() => {
    if (renameTarget) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renameTarget]);

  const toggleDir = (dirPath: string) => {
    const next = !expanded[dirPath];
    setExpanded((current) => ({ ...current, [dirPath]: next }));
    if (next) loadDir(dirPath);
  };

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const openContextMenu = (
    event: React.MouseEvent,
    kind: 'file' | 'folder',
    relativePath: string,
    name: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setCtxMenu({ x: event.clientX, y: event.clientY, kind, relativePath, name });
  };

  const handleOpen = (menu: CtxMenuState) => {
    closeMenu();
    if (menu.kind === 'folder' && menu.relativePath !== '') toggleDir(menu.relativePath);
    else onOpenFile(menu.relativePath);
  };

  const handleCopyPath = async (menu: CtxMenuState) => {
    closeMenu();
    try {
      await writeText(joinLibraryPath(rootRef.current, menu.relativePath));
      notify(t('copiedPath'));
    } catch {
      // Clipboard writes are best-effort.
    }
  };

  const startCreate = (mode: 'create-folder' | 'create-note', dirPath: string) => {
    closeMenu();
    setExpanded((current) => ({ ...current, [dirPath]: true }));
    loadDir(dirPath);
    setEdit({ mode, path: dirPath });
    setEditValue('');
  };

  const createQuickNote = async () => {
    if (quickNoteCreating) return;
    setQuickNoteCreating(true);
    try {
      const rootEntries = entriesByDir[''] ?? await listDirectory(rootRef.current, '');
      const baseName = locale === 'zh' ? '未命名笔记' : 'Untitled note';
      const existingNames = new Set(
        rootEntries.map((entry) => entry.name.toLocaleLowerCase()),
      );
      let name = baseName;
      let suffix = 2;
      while (existingNames.has(`${name}.md`.toLocaleLowerCase())) {
        name = `${baseName} ${suffix}`;
        suffix += 1;
      }

      const created = await createNote(rootRef.current, '', name);
      refreshDir('');
      onLibraryChanged();
      onOpenFile(created);
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    } finally {
      setQuickNoteCreating(false);
    }
  };

  const startRename = (menu: CtxMenuState) => {
    closeMenu();
    setRenameTarget({ path: menu.relativePath, name: menu.name });
    setRenameValue(menu.kind === 'file' ? menu.name.replace(/\.md$/i, '') : menu.name);
  };

  const cancelRename = useCallback(() => setRenameTarget(null), []);

  const commitRename = async () => {
    const target = renameTarget;
    const value = renameValue.trim();
    if (!target || !value) return;
    setRenameTarget(null);
    try {
      const renamed = await renameEntry(rootRef.current, target.path, value);
      updateTreeOrder((current) => {
        const next: TreeOrder = {};
        for (const [dirPath, paths] of Object.entries(current)) {
          next[replacePathPrefix(dirPath, target.path, renamed)] = paths.map((path) =>
            replacePathPrefix(path, target.path, renamed),
          );
        }
        return next;
      });
      refreshDir(parentDirOf(target.path));
      onLibraryChanged();
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    }
  };

  const handleDelete = async (menu: CtxMenuState) => {
    closeMenu();
    const confirmed = await confirm(t('deleteConfirmEntry').replace('{name}', menu.name), {
      title: t('menuDelete'),
      kind: 'warning',
      okLabel: t('menuDelete'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) return;
    try {
      await deleteEntry(rootRef.current, menu.relativePath);
      updateTreeOrder((current) => {
        const next: TreeOrder = {};
        for (const [dirPath, paths] of Object.entries(current)) {
          if (
            dirPath === menu.relativePath ||
            dirPath.startsWith(`${menu.relativePath}/`)
          ) continue;
          next[dirPath] = paths.filter(
            (path) =>
              path !== menu.relativePath &&
              !path.startsWith(`${menu.relativePath}/`),
          );
        }
        return next;
      });
      refreshDir(parentDirOf(menu.relativePath));
      onLibraryChanged();
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    }
  };

  const handleCut = (menu: CtxMenuState) => {
    fsClipboard = { action: 'cut', source: menu.relativePath };
    closeMenu();
  };

  const handleCopy = (menu: CtxMenuState) => {
    fsClipboard = { action: 'copy', source: menu.relativePath };
    closeMenu();
  };

  const handlePaste = async (menu: CtxMenuState) => {
    closeMenu();
    if (!fsClipboard) return;
    const source = fsClipboard.source;
    const action = fsClipboard.action;
    const targetDir = menu.kind === 'folder' ? menu.relativePath : parentDirOf(menu.relativePath);
    try {
      await pasteEntry(rootRef.current, source, targetDir, action);
      refreshDir(targetDir);
      if (action === 'cut') refreshDir(parentDirOf(source));
      fsClipboard = null;
      onLibraryChanged();
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    }
  };

  const handleShowInFolder = async (menu: CtxMenuState) => {
    closeMenu();
    try {
      await revealInFolder(joinLibraryPath(rootRef.current, menu.relativePath));
    } catch {
      // Reveal is best-effort.
    }
  };

  const handleCleanup = async () => {
    closeMenu();
    const confirmed = await confirm(t('cleanupConfirm'), {
      title: t('menuCleanup'),
      kind: 'warning',
      okLabel: t('menuCleanup'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) return;
    for (const folder of TRANSITIONAL_ROOT_FOLDERS) {
      try {
        await deleteEntry(rootRef.current, folder);
      } catch {
        // Folders that are already gone or protected are skipped silently.
      }
    }
    refreshDir('');
    onLibraryChanged();
  };

  const commitEdit = async () => {
    const current = edit;
    if (!current) return;
    const value = editValue.trim();
    setEdit(null);
    if (!value) return;
    try {
      if (current.mode === 'create-folder') {
        await createFolder(rootRef.current, current.path, value);
        refreshDir(current.path);
        onLibraryChanged();
      } else {
        const created = await createNote(rootRef.current, current.path, value);
        refreshDir(current.path);
        onLibraryChanged();
        onOpenFile(created);
      }
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    }
  };

  const updateDropTarget = (target: TreeDropTarget | null) => {
    const current = dropTargetRef.current;
    if (
      current?.relativePath === target?.relativePath &&
      current?.position === target?.position
    ) return;
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const handleTreeDragEnd = () => {
    document.documentElement.classList.remove('tree-drag-active');
    dragEntryRef.current = null;
    setDragEntry(null);
    updateDropTarget(null);
  };

  const getTreeDropPosition = (
    clientY: number,
    rect: DOMRect,
    isDir: boolean,
    rootTarget: boolean,
  ): TreeDropPosition => {
    if (rootTarget) return 'inside';
    const top = Math.round(rect.top);
    const height = Math.max(Math.round(rect.height), 1);
    const y = Math.round(clientY);
    if (!isDir) return y < top + Math.floor(height / 2) ? 'before' : 'after';
    if (y < top + Math.floor(height / 4)) return 'before';
    if (y >= top + Math.ceil(height * 3 / 4)) return 'after';
    return 'inside';
  };

  const performTreeDrop = async (
    source: TreeDragEntry,
    entry: Pick<DirectoryEntry, 'relativePath' | 'isDir'>,
    position: TreeDropPosition,
  ) => {
    if (source.relativePath === entry.relativePath) {
      handleTreeDragEnd();
      return;
    }
    const sourceParent = parentDirOf(source.relativePath);
    const targetDir = position === 'inside'
      ? entry.relativePath
      : parentDirOf(entry.relativePath);
    if (
      source.isDir &&
      (targetDir === source.relativePath || targetDir.startsWith(`${source.relativePath}/`))
    ) {
      handleTreeDragEnd();
      return;
    }

    const targetEntries = orderedEntries(targetDir, entriesByDir[targetDir] || []);
    try {
      const movedPath = sourceParent === targetDir
        ? source.relativePath
        : await pasteEntry(rootRef.current, source.relativePath, targetDir, 'cut');
      const anchorPath = entry.relativePath;
      const orderedTargetPaths = targetEntries
        .map((item) => item.relativePath === source.relativePath ? movedPath : item.relativePath)
        .filter((path) => path !== movedPath);
      let insertAt = orderedTargetPaths.length;
      if (position !== 'inside') {
        const anchorIndex = orderedTargetPaths.indexOf(anchorPath);
        if (anchorIndex >= 0) insertAt = anchorIndex + (position === 'after' ? 1 : 0);
      }
      orderedTargetPaths.splice(insertAt, 0, movedPath);

      updateTreeOrder((current) => {
        const migrated: TreeOrder = {};
        for (const [dirPath, paths] of Object.entries(current)) {
          const nextDir = source.isDir
            ? replacePathPrefix(dirPath, source.relativePath, movedPath)
            : dirPath;
          migrated[nextDir] = paths
            .map((path) => source.isDir
              ? replacePathPrefix(path, source.relativePath, movedPath)
              : path === source.relativePath ? movedPath : path)
            .filter((path) => path !== source.relativePath && path !== movedPath);
        }
        migrated[targetDir] = orderedTargetPaths;
        return migrated;
      });

      if (sourceParent !== targetDir) {
        setExpanded((current) => {
          const next = { ...current, [targetDir]: true };
          for (const path of Object.keys(next)) {
            if (path === source.relativePath || path.startsWith(`${source.relativePath}/`)) {
              delete next[path];
            }
          }
          return next;
        });
        setEntriesByDir((current) => {
          const next = { ...current };
          for (const path of Object.keys(next)) {
            if (path === source.relativePath || path.startsWith(`${source.relativePath}/`)) {
              delete next[path];
            }
          }
          return next;
        });
        refreshDir(sourceParent);
        refreshDir(targetDir);
        const activeEntryMoved = Boolean(
          activeFilePath &&
          (activeFilePath === source.relativePath ||
            activeFilePath.startsWith(`${source.relativePath}/`)),
        );
        if (activeEntryMoved && activeFilePath) {
          onOpenFile(replacePathPrefix(activeFilePath, source.relativePath, movedPath));
        }
        if (!activeEntryMoved) onLibraryChanged();
      }
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    } finally {
      handleTreeDragEnd();
    }
  };

  const findTreeDropTarget = (clientX: number, clientY: number): TreeDropHit | null => {
    const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const item = hit?.closest<HTMLElement>('[data-tree-entry]');
    if (item) {
      const relativePath = item.dataset.treeEntry;
      if (!relativePath) return null;
      const isDir = item.dataset.treeIsDir === 'true';
      return {
        target: {
          relativePath,
          isDir,
          position: getTreeDropPosition(clientY, item.getBoundingClientRect(), isDir, false),
        },
        element: item,
      };
    }
    const root = hit?.closest<HTMLElement>('[data-tree-root]');
    if (root) {
      return {
        target: { relativePath: '', isDir: true, position: 'inside' },
        element: root,
      };
    }
    return null;
  };

  const createTreeDragGhost = (entry: DirectoryEntry): HTMLElement => {
    const ghost = document.createElement('div');
    ghost.className = 'tree-drag-ghost';
    ghost.textContent = entry.name.replace(/\.md$/i, '');
    document.body.appendChild(ghost);
    return ghost;
  };

  const beginTreePointerDrag = (
    event: React.PointerEvent<HTMLElement>,
    entry: DirectoryEntry,
  ) => {
    if (event.button !== 0) return;
    const drag = {
      entry: { relativePath: entry.relativePath, isDir: entry.isDir },
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - event.currentTarget.getBoundingClientRect().left,
      offsetY: event.clientY - event.currentTarget.getBoundingClientRect().top,
      active: false,
      target: null as TreeDropTarget | null,
      ghost: null as HTMLElement | null,
    };
    pointerDragRef.current = drag;

    const onMove = (moveEvent: PointerEvent) => {
      const current = pointerDragRef.current;
      if (!current) return;
      if (!current.active && Math.hypot(moveEvent.clientX - current.startX, moveEvent.clientY - current.startY) < 5) {
        return;
      }
      if (!current.active) {
        current.active = true;
        dragEntryRef.current = current.entry;
        setDragEntry(current.entry);
        document.documentElement.classList.add('tree-drag-active');
        current.ghost = createTreeDragGhost(entry);
      }
      moveEvent.preventDefault();
      if (current.ghost) {
        const offsetX = Math.min(
          Math.max(current.offsetX, 8),
          Math.max(current.ghost.offsetWidth - 8, 8),
        );
        const offsetY = Math.min(
          Math.max(current.offsetY, 8),
          Math.max(current.ghost.offsetHeight - 8, 8),
        );
        current.ghost.style.transform = `translate3d(${moveEvent.clientX - offsetX}px, ${moveEvent.clientY - offsetY}px, 0)`;
      }
      const dropHit = findTreeDropTarget(moveEvent.clientX, moveEvent.clientY);
      if (!dropHit || dropHit.target.relativePath === current.entry.relativePath) {
        current.target = null;
        updateDropTarget(null);
        return;
      }
      const target = dropHit.target;
      const targetDir = target.position === 'inside'
        ? target.relativePath
        : parentDirOf(target.relativePath);
      if (
        current.entry.isDir &&
        (targetDir === current.entry.relativePath || targetDir.startsWith(`${current.entry.relativePath}/`))
      ) {
        current.target = null;
        updateDropTarget(null);
        return;
      }
      current.target = target;
      updateDropTarget(target);
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      const current = pointerDragRef.current;
      pointerDragRef.current = null;
      if (!current?.active) return;
      upEvent.preventDefault();
      current.ghost?.remove();
      const dropHit = findTreeDropTarget(upEvent.clientX, upEvent.clientY);
      const target = dropHit?.target || current.target;
      if (target) {
        void performTreeDrop(current.entry, target, target.position);
      } else {
        handleTreeDragEnd();
      }
    };

    const onCancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      pointerDragRef.current?.ghost?.remove();
      pointerDragRef.current = null;
      handleTreeDragEnd();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const renderEditRow = (dirPath: string, depth: number) =>
    edit && edit.path === dirPath ? (
      <div className="tree-edit-row" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
        <input
          ref={editRef}
          className="tree-rename-input"
          value={editValue}
          placeholder={
            edit.mode === 'create-folder' ? t('newFolderPlaceholder') : t('newNotePlaceholder')
          }
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitEdit();
            if (event.key === 'Escape') setEdit(null);
          }}
          onBlur={() => void commitEdit()}
        />
      </div>
    ) : null;

  const renderFile = (entry: DirectoryEntry, depth: number) => {
    const targetPosition = dropTarget?.relativePath === entry.relativePath
      ? dropTarget.position
      : null;
    const selected = selectedContextPaths.includes(entry.relativePath);
    const title = entry.name.replace(/(?:\.en)?\.md$/i, '');
    return (
      <button
        type="button"
        key={entry.relativePath}
        className={`tree-child ${activeFilePath === entry.relativePath ? 'active' : ''} ${selected ? 'context-selected' : ''} ${dragEntry?.relativePath === entry.relativePath ? 'is-dragging' : ''} ${targetPosition ? `drop-${targetPosition}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        data-tree-entry={entry.relativePath}
        data-tree-is-dir="false"
        aria-pressed={multiSelectActive ? selected : undefined}
        onPointerDown={multiSelectActive ? undefined : (event) => beginTreePointerDrag(event, entry)}
        onClick={() => {
          if (multiSelectActive) {
            onToggleContextNote(entry.relativePath, title);
            return;
          }
          onOpenFile(entry.relativePath);
        }}
        onContextMenu={(event) => openContextMenu(event, 'file', entry.relativePath, entry.name)}
      >
        {NOTE_ICONS[entry.icon || ''] || <FileText size={13} />}
        <span className="tree-child-label">{title}</span>
        {multiSelectActive && selected && (
          <Check className="tree-selection-check" size={15} strokeWidth={2.5} aria-hidden="true" />
        )}
      </button>
    );
  };

  const renderFolder = (entry: DirectoryEntry, depth: number) => {
    const isOpen = Boolean(expanded[entry.relativePath]);
    const childEntries = orderedEntries(entry.relativePath, entriesByDir[entry.relativePath] || []);
    const showChildren = isOpen && (childEntries.length > 0 || edit?.path === entry.relativePath);
    const targetPosition = dropTarget?.relativePath === entry.relativePath
      ? dropTarget.position
      : null;
    return (
      <div key={entry.relativePath}>
        <div
          className={`tree-folder-row ${dragEntry?.relativePath === entry.relativePath ? 'is-dragging' : ''} ${targetPosition ? `drop-${targetPosition}` : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          data-tree-entry={entry.relativePath}
          data-tree-is-dir="true"
          onPointerDown={multiSelectActive ? undefined : (event) => beginTreePointerDrag(event, entry)}
        >
          <button
            type="button"
            className={`tree-folder ${isOpen ? 'open' : ''}`}
            onClick={() => toggleDir(entry.relativePath)}
            onContextMenu={(event) => openContextMenu(event, 'folder', entry.relativePath, entry.name)}
          >
            <ChevronRight size={13} className={`tree-chevron ${isOpen ? 'expanded' : ''}`} />
            <FolderOpen size={15} />
            <span>{entry.name}</span>
          </button>
        </div>
        {showChildren && (
          <div className="tree-children">
            {renderEditRow(entry.relativePath, depth)}
            {childEntries.map((child) =>
              child.isDir ? renderFolder(child, depth + 1) : renderFile(child, depth + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  const ctxActions: CtxMenuActions = {
    onOpen: handleOpen,
    onCopyPath: handleCopyPath,
    onNewFolder: (menu) => startCreate('create-folder', menu.relativePath),
    onNewNote: (menu) => startCreate('create-note', menu.relativePath),
    onRename: startRename,
    onDelete: handleDelete,
    onCut: handleCut,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onShowInFolder: handleShowInFolder,
    onCleanup: handleCleanup,
  };

  return (
    <div
      className="nav-tree-group library-tree"
    >
      <div
        className={`library-root-row ${dropTarget?.relativePath === '' ? 'drop-inside' : ''}`}
        data-tree-root
        onContextMenu={(event) => openContextMenu(event, 'folder', '', libraryLabel)}
      >
        <span className="library-root-label">
          <FolderOpen size={17} />
          <span>{libraryLabel}</span>
        </span>
        <div className="library-root-actions">
          <button
            type="button"
            className="library-switch-btn"
            onClick={() => void createQuickNote()}
            aria-label={locale === 'zh' ? '添加 Markdown 文件' : 'Add Markdown file'}
            disabled={quickNoteCreating}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            type="button"
            className={`library-multi-select-btn${multiSelectActive ? ' active' : ''}`}
            onClick={multiSelectActive ? onCancelMultiSelect : onToggleMultiSelect}
            aria-pressed={multiSelectActive}
            aria-label={
              multiSelectActive
                ? locale === 'zh' ? '取消多选' : 'Cancel multi-select'
                : locale === 'zh' ? '多选文章' : 'Select multiple notes'
            }
          >
            <ListChecks className="library-multi-select-icon" size={17} strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <div className="library-tree-scroll">
        <div className="tree-children">
          {renderEditRow('', 0)}
          {orderedEntries(
            '',
            (entriesByDir[''] || []).filter(
              (entry) => !entry.isDir || !HIDDEN_ROOT_FOLDERS.has(entry.name),
            ),
          )
            .map((entry) =>
              entry.isDir ? renderFolder(entry, 0) : renderFile(entry, 0),
            )}
        </div>
      </div>
      {ctxMenu && (
        <ContextMenu menu={ctxMenu} onClose={closeMenu} actions={ctxActions} t={t} />
      )}
      {renameTarget &&
        createPortal(
          <div className="modal-backdrop" onMouseDown={cancelRename}>
            <section
              className="settings-dialog add-material-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rename-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <DialogHeader
                icon={<Pencil size={21} />}
                title={t('menuRename')}
                titleId="rename-title"
                onClose={cancelRename}
                closeLabel={t('cancel')}
              />
              <div className="add-material-body">
                <input
                  ref={renameInputRef}
                  className="add-material-input"
                  value={renameValue}
                  placeholder={t('renamePlaceholder')}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitRename();
                    if (event.key === 'Escape') cancelRename();
                  }}
                />
                <div className="capture-guide-actions">
                  <button type="button" className="secondary-button" onClick={cancelRename}>
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void commitRename()}
                    disabled={!renameValue.trim()}
                  >
                    确定
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface SidebarProps {
  locale: Locale;
  view: View;
  libraryRoot: string;
  activeFilePath: string | null;
  multiSelectActive: boolean;
  selectedContextPaths: string[];
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  chatBusy: boolean;
  onOpenFile: (relativePath: string) => void;
  onToggleMultiSelect: () => void;
  onCancelMultiSelect: () => void;
  onToggleContextNote: (relativePath: string, title: string) => void;
  onLibraryChanged: () => void;
  onSwitchRoot: () => void;
  onSearchLibrary: () => void;
  onSettings: () => void;
  onOpenMessages: () => void;
  messageChannelStatus: MessageChannelStatus;
  refreshToken: number;
  notify: (message: string) => void;
  t: (key: TranslationKey) => string;
}

function Sidebar({
  locale,
  view,
  libraryRoot,
  activeFilePath,
  multiSelectActive,
  selectedContextPaths,
  onNavigate,
  onNewChat,
  chatBusy,
  onOpenFile,
  onToggleMultiSelect,
  onCancelMultiSelect,
  onToggleContextNote,
  onLibraryChanged,
  onSwitchRoot,
  onSearchLibrary,
  onSettings,
  onOpenMessages,
  messageChannelStatus,
  refreshToken,
  notify,
  t,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <nav className="primary-nav" aria-label="Primary">
          <div className={`nav-home-row ${view === 'home' ? 'active' : ''}`}>
            <SidebarButton
              icon={<House size={17} />}
              label={t('home')}
              active={view === 'home'}
              onClick={() => onNavigate('home')}
            />
            <div className="nav-home-actions">
              <button
                type="button"
                className="nav-search-library"
                onClick={onSearchLibrary}
                aria-label={locale === 'zh' ? '搜索资料库' : 'Search library'}
              >
                <Search size={17} />
              </button>
              <button
                type="button"
                className="nav-switch-root"
                onClick={onSwitchRoot}
                aria-label={t('menuSwitchRoot')}
              >
                <Folder size={17} />
              </button>
            </div>
          </div>
          <div className={`nav-chat-row ${view === 'ai' ? 'active' : ''}`}>
            <SidebarButton
              icon={<MessageCircleMore size={17} />}
              label={t('aiChat')}
              active={view === 'ai'}
              onClick={() => onNavigate('ai')}
            />
            <button
              type="button"
              className="nav-new-chat"
              onClick={onNewChat}
              disabled={chatBusy}
              aria-label={t('newChat')}
            >
              <Plus size={15} />
              <span>{t('newChat')}</span>
            </button>
          </div>
          <SidebarButton
            icon={<Sparkles size={17} />}
            label={t('myPlan')}
            active={view === 'plan'}
            onClick={() => onNavigate('plan')}
          />

          <div className="nav-section-divider" aria-hidden="true" />

          <LibraryTree
            root={libraryRoot}
            locale={locale}
            t={t}
            activeFilePath={activeFilePath}
            multiSelectActive={multiSelectActive}
            selectedContextPaths={selectedContextPaths}
            onOpenFile={onOpenFile}
            onToggleMultiSelect={onToggleMultiSelect}
            onCancelMultiSelect={onCancelMultiSelect}
            onToggleContextNote={onToggleContextNote}
            onLibraryChanged={onLibraryChanged}
            refreshToken={refreshToken}
            notify={notify}
          />
        </nav>
      </div>
      <div className="sidebar-footer">
        <button type="button" className="sidebar-status" onClick={onOpenMessages}>
          {messageChannelStatus.activeJobs > 0
            ? locale === 'zh' ? '正在整理手机资料' : 'Processing mobile capture'
            : messageChannelStatus.weixin === 'connected' && messageChannelStatus.telegram === 'connected'
              ? locale === 'zh' ? '微信 · Telegram 已连接' : 'Weixin · Telegram connected'
              : messageChannelStatus.weixin === 'connected'
                ? locale === 'zh' ? '微信已连接' : 'Weixin connected'
                : messageChannelStatus.telegram === 'connected'
                  ? 'Telegram connected'
                  : locale === 'zh' ? '尚未连接消息渠道' : 'No channel connected'}
        </button>
        <UpdateButton locale={locale} />
        <button
          type="button"
          className="sidebar-settings-entry"
          onClick={onSettings}
          aria-label={t('settings')}
        >
          <Settings size={16} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password']);

function isTextInputElement(target: EventTarget | null): target is TextInputElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return TEXT_INPUT_TYPES.has(target.type);
}

function setTextInputValue(input: TextInputElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceTextInputSelection(input: TextInputElement, text: string, from?: number, to?: number): void {
  input.focus();
  const start = from ?? input.selectionStart ?? 0;
  const end = to ?? input.selectionEnd ?? start;
  input.setSelectionRange(start, end);
  if (document.execCommand('insertText', false, text)) return;

  const nextValue = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  setTextInputValue(input, nextValue);
  const nextCaret = start + text.length;
  window.requestAnimationFrame(() => input.setSelectionRange(nextCaret, nextCaret));
}

function TextInputContextMenu({ locale }: { locale: Locale }) {
  const [menu, setMenu] = useState<{ x: number; y: number; input: TextInputElement } | null>(null);

  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const input = event.target;
      if (!isTextInputElement(input) || input.disabled) return;
      event.preventDefault();
      input.focus();
      setMenu({ x: event.clientX, y: event.clientY, input });
    };
    document.addEventListener('contextmenu', open);
    return () => document.removeEventListener('contextmenu', open);
  }, []);

  if (!menu) return null;
  const { input } = menu;
  const hasSelection = (input.selectionEnd ?? 0) > (input.selectionStart ?? 0);
  const canEdit = !input.readOnly;
  const controller: TextCommandController = {
    canRun: (command) => {
      if (command === 'copy' || command === 'cut') return hasSelection && (command === 'copy' || canEdit);
      if (command === 'paste' || command === 'delete' || command === 'undo' || command === 'redo') return canEdit;
      if (command === 'selectAll') return input.value.length > 0;
      return false;
    },
    run: async (command) => {
      input.focus();
      if (command === 'undo' || command === 'redo') {
        document.execCommand(command);
        return;
      }
      if (command === 'selectAll') {
        input.setSelectionRange(0, input.value.length);
        return;
      }
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      const selectedText = input.value.slice(start, end);
      if (command === 'copy' || command === 'cut') {
        if (!selectedText) return;
        await writeClipboardText(selectedText);
        if (command === 'cut') replaceTextInputSelection(input, '', start, end);
        return;
      }
      if (command === 'paste') {
        const text = await readClipboardText();
        if (text) replaceTextInputSelection(input, text, start, end);
        return;
      }
      if (command === 'delete') {
        replaceTextInputSelection(input, '', start, end > start ? end : Math.min(start + 1, input.value.length));
      }
    },
  };

  return (
    <TextCommandMenu
      x={menu.x}
      y={menu.y}
      locale={locale}
      commands={EDITOR_TEXT_COMMANDS}
      controller={controller}
      onClose={() => setMenu(null)}
    />
  );
}

interface LibrarySearchDocument {
  relativePath: string;
  name: string;
  title: string;
  content: string;
}

function searchDocumentTitle(name: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || name.replace(/\.md$/i, '');
}

function searchResultSnippet(content: string, query: string): string {
  const plain = content
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`\[\]()|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const index = plain.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - 34);
  const excerpt = plain.slice(start, start + 116).trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + 116 < plain.length ? '…' : ''}`;
}

function searchResultDirectory(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : '';
}

async function collectLibraryMarkdownFiles(root: string): Promise<DirectoryEntry[]> {
  const files: DirectoryEntry[] = [];
  const queue = [''];
  const visited = new Set<string>();
  while (queue.length > 0 && files.length < 2000) {
    const directory = queue.shift() || '';
    if (visited.has(directory)) continue;
    visited.add(directory);
    let entries: DirectoryEntry[] = [];
    try {
      entries = await listDirectory(root, directory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDir) {
        if (!directory && HIDDEN_ROOT_FOLDERS.has(entry.name)) continue;
        queue.push(entry.relativePath);
      } else if (entry.isMarkdown) {
        files.push(entry);
      }
    }
  }
  return files;
}

function LibrarySearchDialog({
  root,
  locale,
  onClose,
  onOpenFile,
}: {
  root: string;
  locale: Locale;
  onClose: () => void;
  onOpenFile: (relativePath: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<LibrarySearchDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsScrollRef = useAutoHideScrollbar<HTMLDivElement>();

  useEffect(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setDocuments([]);
    setLoading(true);
    setError('');
    void collectLibraryMarkdownFiles(root)
      .then(async (files) => {
        if (cancelled) return;
        let indexed = files.map((file) => ({
          relativePath: file.relativePath,
          name: file.name,
          title: file.name.replace(/\.md$/i, ''),
          content: '',
        }));
        setDocuments(indexed);
        for (let start = 0; start < files.length; start += 8) {
          const batch = files.slice(start, start + 8);
          const loaded = await Promise.all(batch.map(async (file) => {
            try {
              const content = await readNote(root, file.relativePath);
              return {
                relativePath: file.relativePath,
                name: file.name,
                title: searchDocumentTitle(file.name, content),
                content,
              };
            } catch {
              return null;
            }
          }));
          if (cancelled) return;
          const updates = new Map(
            loaded.filter((item): item is LibrarySearchDocument => item !== null)
              .map((item) => [item.relativePath, item]),
          );
          indexed = indexed.map((item) => updates.get(item.relativePath) || item);
          setDocuments(indexed);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(locale === 'zh' ? '无法读取当前资料库。' : 'Could not read the current library.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, root]);

  const results = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase();
    if (!clean) return documents.slice(0, 80);
    return documents
      .map((document) => {
        const title = document.title.toLocaleLowerCase();
        const path = document.relativePath.toLocaleLowerCase();
        const body = document.content.toLocaleLowerCase();
        const score = title === clean ? 0 : title.includes(clean) ? 1 : path.includes(clean) ? 2 : body.includes(clean) ? 3 : -1;
        return { document, score };
      })
      .filter((item) => item.score >= 0)
      .sort((left, right) => left.score - right.score || left.document.title.localeCompare(right.document.title))
      .slice(0, 80)
      .map((item) => item.document);
  }, [documents, query]);

  return createPortal(
    <div className="modal-backdrop library-search-backdrop" onMouseDown={onClose}>
      <section
        className="library-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-search-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="library-search-input-wrap">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === 'zh' ? '搜索当前资料库' : 'Search current library'}
            aria-label={locale === 'zh' ? '搜索当前资料库' : 'Search current library'}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={locale === 'zh' ? '清空搜索' : 'Clear search'}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <h2 id="library-search-title" className="library-search-heading">
          {query.trim()
            ? locale === 'zh' ? `搜索结果 · ${results.length}` : `Results · ${results.length}`
            : locale === 'zh' ? '资料库笔记' : 'Library notes'}
        </h2>
        <div ref={resultsScrollRef} className="library-search-results auto-hide-scrollbar">
          {results.map((document) => (
            <button
              type="button"
              className={`library-search-result${query.trim() ? ' has-query' : ''}`}
              key={document.relativePath}
              onClick={() => onOpenFile(document.relativePath)}
            >
              <FileText size={16} />
              <span>
                <strong>{document.title}</strong>
                {query.trim() && (
                  <small>{searchResultSnippet(document.content, query.trim()) || document.relativePath}</small>
                )}
              </span>
              {searchResultDirectory(document.relativePath) && (
                <span className="library-search-result-directory">
                  {searchResultDirectory(document.relativePath)}
                </span>
              )}
            </button>
          ))}
          {loading && (
            <div className="library-search-state">
              <LoaderCircle className="spin" size={18} />
              <span>{locale === 'zh' ? '正在读取本地笔记…' : 'Reading local notes…'}</span>
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="library-search-state">
              {locale === 'zh' ? '没有找到匹配的笔记。' : 'No matching notes found.'}
            </div>
          )}
          {error && <div className="library-search-state error">{error}</div>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function directoryDisplayName(root: string): string {
  const normalized = root.trim().replace(/[\\/]+$/, '');
  if (!normalized) return '';
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) || normalized;
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {trailing}
    </button>
  );
}

function getHomeGreetingKey(hour: number): TranslationKey {
  if (hour >= 5 && hour < 12) return 'greetingMorning';
  if (hour >= 12 && hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

const greetingIconByKey: Record<string, typeof Sun> = {
  greetingMorning: Sun,
  greetingAfternoon: Sun,
  greetingEvening: Moon,
};

function HomeView({
  locale,
  library,
  onOpenAppearanceSettings,
  onCapture,
  onOrganize,
  onPlan,
  onPriority,
  onMovePriority,
  t,
}: {
  locale: Locale;
  library: LibrarySnapshot;
  onOpenAppearanceSettings: () => void;
  onCapture: () => void;
  onOrganize: () => void;
  onPlan: () => void;
  onPriority: (note: PriorityNote) => void;
  onMovePriority: (itemId: string, targetTier: TierId, targetIndex: number) => void;
  t: (key: TranslationKey) => string;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const tiered = useMemo(() => {
    return TIER_IDS.map((tier) => ({
      tier,
      notes: library.priorities.filter(
        (note) => note.tier === tier && note.id !== draggedId,
      ),
    }));
  }, [draggedId, library.priorities]);
  const ambientAssignments = useMemo(() => createAmbientAssignments(3), []);
  const [dropTarget, setDropTarget] = useState<{
    tier: TierId;
    index: number;
  } | null>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const tierMapRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLButtonElement | null>(null);
  const flipRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const pointerDragRef = useRef<{
    itemId: string;
    moved: boolean;
    sourceTier: TierId;
    sourceIndex: number;
  } | null>(null);
  const draggedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const suppressTierClickRef = useRef(false);
  const [greetingKey, setGreetingKey] = useState<TranslationKey>(() =>
    getHomeGreetingKey(new Date().getHours()),
  );

  useEffect(() => {
    const syncGreeting = () => setGreetingKey(getHomeGreetingKey(new Date().getHours()));
    const intervalId = window.setInterval(syncGreeting, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(
    () => () => {
      ghostRef.current?.remove();
      document.documentElement.classList.remove('tier-drag-active');
    },
    [],
  );

  useLayoutEffect(() => {
    if (!flipRectsRef.current.size || !tierMapRef.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards = tierMapRef.current.querySelectorAll<HTMLElement>('[data-tier-item]');
    for (const card of cards) {
      card.getAnimations().forEach((animation) => animation.cancel());
      const previous = flipRectsRef.current.get(card.dataset.tierItem || '');
      if (!previous || reduceMotion) continue;
      const next = card.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
      card.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: 240,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        },
      );
    }
    flipRectsRef.current = new Map();
  }, [draggedId, dropTarget]);

  const captureTierRects = () => {
    const positions = new Map<string, DOMRect>();
    const cards = tierMapRef.current?.querySelectorAll<HTMLElement>('[data-tier-item]');
    cards?.forEach((card) => {
      const id = card.dataset.tierItem;
      if (id) positions.set(id, card.getBoundingClientRect());
    });
    flipRectsRef.current = positions;
  };

  const setActiveDropTarget = (target: NonNullable<typeof dropTarget>) => {
    const current = dropTargetRef.current;
    if (current?.tier === target.tier && current.index === target.index) return;
    captureTierRects();
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  const clearDragState = () => {
    setDraggedId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
    draggedSizeRef.current = null;
  };

  const moveDraggedItem = (itemId: string, targetTier: TierId, targetIndex: number) => {
    const moved = library.priorities.find((item) => item.id === itemId);
    if (!moved) {
      clearDragState();
      return;
    }

    onMovePriority(itemId, targetTier, targetIndex);
    clearDragState();
  };

  const pointerDropTarget = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (hit?.closest('[data-tier-placeholder]')) return dropTargetRef.current;
    const item = hit?.closest<HTMLElement>('[data-tier-item]');
    if (item) {
      const tier = item.dataset.tier as TierId;
      const index = Number(item.dataset.tierIndex);
      const bounds = item.getBoundingClientRect();
      return {
        tier,
        index: index + (clientX >= bounds.left + bounds.width / 2 ? 1 : 0),
      };
    }

    const row = hit?.closest<HTMLElement>('[data-tier-row]');
    if (!row) return null;
    return {
      tier: row.dataset.tierRow as TierId,
      index: Number(row.dataset.tierCount),
    };
  };

  const beginPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, itemId: string) => {
    if (event.button !== 0) return;
    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const offsetX = startX - bounds.left;
    const offsetY = startY - bounds.top;
    const source = library.priorities.find((item) => item.id === itemId);
    if (!source) return;
    const sourceIndex = library.priorities
      .filter((item) => item.tier === source.tier)
      .findIndex((item) => item.id === itemId);
    pointerDragRef.current = {
      itemId,
      moved: false,
      sourceTier: source.tier as TierId,
      sourceIndex,
    };

    const positionGhost = (clientX: number, clientY: number) => {
      if (!ghostRef.current) return;
      ghostRef.current.style.left = `${clientX - offsetX}px`;
      ghostRef.current.style.top = `${clientY - offsetY}px`;
    };

    const onMove = (moveEvent: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag) return;
      if (
        !drag.moved &&
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6
      ) {
        return;
      }

      if (!drag.moved) {
        drag.moved = true;
        draggedSizeRef.current = { width: bounds.width, height: bounds.height };
        captureTierRects();
        dropTargetRef.current = { tier: source.tier as TierId, index: sourceIndex };
        setDropTarget(dropTargetRef.current);
        setDraggedId(itemId);
        document.documentElement.classList.add('tier-drag-active');

        const ghost = card.cloneNode(true) as HTMLButtonElement;
        ghost.className = 'tier-item-ghost';
        ghost.removeAttribute('data-tier-item');
        ghost.removeAttribute('data-tier-index');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.height = `${bounds.height}px`;
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
      }

      positionGhost(moveEvent.clientX, moveEvent.clientY);
      const target = pointerDropTarget(moveEvent.clientX, moveEvent.clientY);
      if (target) setActiveDropTarget(target);
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.documentElement.classList.remove('tier-drag-active');

      const drag = pointerDragRef.current;
      pointerDragRef.current = null;
      if (!drag?.moved) return;

      const target = pointerDropTarget(upEvent.clientX, upEvent.clientY) || dropTargetRef.current;
      const ghost = ghostRef.current;
      ghostRef.current = null;
      const placeholder = tierMapRef.current?.querySelector<HTMLElement>('[data-tier-placeholder]');
      if (ghost && placeholder && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const from = ghost.getBoundingClientRect();
        const to = placeholder.getBoundingClientRect();
        const animation = ghost.animate(
          [
            { transform: 'translate3d(0, 0, 0) scale(1.025)', opacity: 0.98 },
            {
              transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0) scale(1)`,
              opacity: 0.18,
            },
          ],
          { duration: 170, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
        animation.finished.finally(() => ghost.remove());
      } else {
        ghost?.remove();
      }

      if (
        target &&
        (target.tier !== drag.sourceTier || target.index !== drag.sourceIndex)
      ) {
        moveDraggedItem(drag.itemId, target.tier, target.index);
      } else {
        clearDragState();
      }
      card.blur();
      suppressTierClickRef.current = true;
      window.setTimeout(() => {
        suppressTierClickRef.current = false;
      }, 0);
    };

    const onCancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.documentElement.classList.remove('tier-drag-active');
      pointerDragRef.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      clearDragState();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // The drop placeholder must expand to the exact footprint of the card being
  // dragged so the row layout during the drag matches the layout after the drop.
  const draggedSize = draggedSizeRef.current;
  const placeholderStyle = draggedSize
    ? { width: `${draggedSize.width}px`, height: `${draggedSize.height}px` }
    : undefined;
  const GreetingIcon = greetingIconByKey[greetingKey] ?? Layers3;

  return (
    <div className="home-view page">
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <GreetingIcon size={15} />
            Your AI Second Brain for Knowledge & Ideas
          </div>
          <h1>{t(greetingKey)}</h1>
        </div>
        <WeatherAmbient locale={locale} onOpenAppearanceSettings={onOpenAppearanceSettings} />
      </section>

      <section className="start-section" aria-label={t('coreModules')}>
        <div className="start-cards">
          <ActionCard
            title={t('collectCard')}
            description={t('collectCardSub')}
            onClick={onCapture}
            ambient={ambientAssignments[0]}
          />
          <ActionCard
            title={t('peopleCard')}
            description={t('peopleCardSub')}
            onClick={onPlan}
            ambient={ambientAssignments[1]}
          />
          <ActionCard
            title={t('aiPlanCard')}
            description={t('aiPlanCardSub')}
            onClick={onOrganize}
            ambient={ambientAssignments[2]}
          />
        </div>
      </section>

      <section className="tier-section" aria-label={t('evidenceMap')}>
        <div className="tier-map" ref={tierMapRef}>
          {tiered.map(({ tier, notes }) => {
            const insertAt =
              dropTarget?.tier === tier
                ? Math.min(Math.max(dropTarget.index, 0), notes.length)
                : -1;
            const cards: ReactNode[] = [];
            notes.forEach((note, index) => {
              if (index === insertAt) {
                cards.push(
                  <div
                    className="tier-drag-placeholder"
                    data-tier-placeholder
                    key="drag-placeholder"
                    style={placeholderStyle}
                  />,
                );
              }
              cards.push(
                <button
                  data-tier={tier}
                  data-tier-index={index}
                  data-tier-item={note.id}
                  key={note.id}
                  onClick={(event) => {
                    if (suppressTierClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    onPriority(note);
                  }}
                  onPointerDown={(pointerEvent) => beginPointerDrag(pointerEvent, note.id)}
                >
                  <span>{note.title}</span>
                </button>,
              );
            });
            if (insertAt === notes.length) {
              cards.push(
                <div
                  className="tier-drag-placeholder"
                  data-tier-placeholder
                  key="drag-placeholder"
                  style={placeholderStyle}
                />,
              );
            }

            return (
              <div
                className="tier-row"
                data-tier-count={notes.length}
                data-tier-row={tier}
                key={tier}
              >
                <div
                  className="tier-label"
                  style={{ '--tier-color': tierMeta[tier]?.color } as React.CSSProperties}
                >
                  <strong>{tier}</strong>
                </div>
                <div
                  className={`tier-items${draggedId ? ' is-dragging' : ''}${
                    dropTarget?.tier === tier ? ' drag-over' : ''
                  }`}
                  data-tier-count={notes.length}
                  data-tier-row={tier}
                >
                  {cards.length ? cards : <span className="tier-empty">{t('tierEmpty')}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="tier-hint">{t('evidenceMapSub')}</p>
      </section>
    </div>
  );
}

function ActionCard({
  title,
  description,
  onClick,
  ambient,
}: {
  title: string;
  description: string;
  onClick: () => void;
  ambient: ReturnType<typeof createAmbientAssignments>[number];
}) {
  return (
    <button
      className="action-card"
      onClick={onClick}
      style={
        {
          '--ambient-delay': ambient.delay,
          '--ambient-duration': ambient.duration,
          '--ambient-direction': ambient.direction,
          '--ambient-secondary-delay': ambient.secondaryDelay,
          '--ambient-secondary-duration': ambient.secondaryDuration,
          '--ambient-secondary-direction': ambient.secondaryDirection,
        } as React.CSSProperties
      }
    >
      <span className="action-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

function PeopleView({
  locale,
  people,
  onPerson,
  onBack,
  t,
}: {
  locale: Locale;
  people: Person[];
  onPerson: (person: Person) => void;
  onBack: () => void;
  t: (key: TranslationKey) => string;
}) {
  const ambientAssignments = useMemo(
    () => createAmbientAssignments(people.length),
    [people.length],
  );

  return (
    <div className="page people-view">
      <section className="page-intro">
        <div className="page-kicker-row">
          <PageBackButton locale={locale} onBack={onBack} />
          <div className="hero-kicker">
            <UsersRound size={15} />
            PROTOCOL ATLAS
          </div>
        </div>
        <h1>{t('peopleTitle')}</h1>
        <p>{t('peopleSub')}</p>
      </section>
      <div className="people-grid">
        {people.map((person, index) => (
          <button
            className="person-card"
            key={person.id}
            onClick={() => onPerson(person)}
            style={
              {
                '--person-accent': person.accent,
                '--ambient-delay': ambientAssignments[index].delay,
                '--ambient-duration': ambientAssignments[index].duration,
                '--ambient-direction': ambientAssignments[index].direction,
                '--ambient-secondary-delay': ambientAssignments[index].secondaryDelay,
                '--ambient-secondary-duration': ambientAssignments[index].secondaryDuration,
                '--ambient-secondary-direction': ambientAssignments[index].secondaryDirection,
              } as React.CSSProperties
            }
          >
            <span className="person-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="person-avatar">
              <UserRound size={26} />
            </span>
            <span className="person-copy">
              <strong>{person.name}</strong>
              {person.nameZh && locale === 'zh' && <small className="person-zh">{person.nameZh}</small>}
              <small>{person.summary}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StoriesView({
  locale,
  stories,
  onStory,
  onAdd,
  onBack,
  t,
}: {
  locale: Locale;
  stories: Story[];
  onStory: (story: Story) => void;
  onAdd: () => void;
  onBack: () => void;
  t: (key: TranslationKey) => string;
}) {
  const ambientAssignments = useMemo(
    () => createAmbientAssignments(stories.length),
    [stories.length],
  );

  return (
    <div className="page stories-view">
      <section className="page-intro">
        <div className="page-kicker-row">
          <PageBackButton locale={locale} onBack={onBack} />
          <div className="hero-kicker">
            <BookOpen size={15} />
            LONGEVITY FIELD NOTES
          </div>
        </div>
        <h1>{t('storiesTitle')}</h1>
        <p>{t('storiesSub')}</p>
      </section>

      <div className="story-grid">
        {stories.map((story, index) => (
          <button
            className="story-card"
            key={story.id}
            onClick={() => onStory(story)}
            style={
              {
                '--story-accent': story.accent,
                '--ambient-delay': ambientAssignments[index].delay,
                '--ambient-duration': ambientAssignments[index].duration,
                '--ambient-direction': ambientAssignments[index].direction,
                '--ambient-secondary-delay': ambientAssignments[index].secondaryDelay,
                '--ambient-secondary-duration': ambientAssignments[index].secondaryDuration,
                '--ambient-secondary-direction': ambientAssignments[index].secondaryDirection,
              } as React.CSSProperties
            }
          >
            <span className="story-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="story-copy">
              <small>FIELD NOTE</small>
              <strong>{locale === 'zh' ? story.title : story.titleEn || story.title}</strong>
              <span>
                {locale === 'zh' ? story.summary : story.summaryEn || story.summary}
              </span>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}

        <button className="story-add-card" onClick={onAdd}>
          <span className="story-add-icon">
            <FilePlus2 size={22} />
          </span>
          <span>
            <strong>{locale === 'zh' ? '添加一则轶事' : 'Add a story'}</strong>
            <small>
              {locale === 'zh'
                ? '把文章或链接交给 AI，整理后加入资料库'
                : 'Give an article or link to AI and organize it into the library'}
            </small>
          </span>
        </button>
      </div>

      <div className="story-folder-note">
        <FolderOpen size={15} />
        <span>
          {locale === 'zh'
            ? '用户添加的 Markdown 放入 stories 目录后会自动成为新条目。'
            : 'Markdown files added to the stories folder are discovered automatically.'}
        </span>
      </div>
    </div>
  );
}

function PageBackButton({ locale, onBack }: { locale: Locale; onBack: () => void }) {
  return (
    <button className="page-back" onClick={onBack} aria-label={locale === 'zh' ? '返回' : 'Back'}>
      <ChevronRight className="back-chevron" size={20} />
    </button>
  );
}

function MarkdownEditor({
  value,
  onChange,
  locale,
  onActivateCommands,
  onRegisterCommands,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  onActivateCommands?: () => void;
  onRegisterCommands?: (controller: TextCommandController | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onActivateCommandsRef = useRef(onActivateCommands);
  const onRegisterCommandsRef = useRef(onRegisterCommands);
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActivateCommandsRef.current = onActivateCommands;
  }, [onActivateCommands]);

  useEffect(() => {
    onRegisterCommandsRef.current = onRegisterCommands;
  }, [onRegisterCommands]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      doc: value,
      extensions: [
        lineNumbers(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        history(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdownLanguage(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
      parent: host,
    });
    const unbindScrollbar = bindAutoHideScrollbar(view.scrollDOM);
    viewRef.current = view;
    onRegisterCommandsRef.current?.({
      canRun: () => true,
      run: (command) => runEditorTextCommand(view, command),
    });
    view.focus();
    onActivateCommandsRef.current?.();
    return () => {
      onRegisterCommandsRef.current?.(null);
      unbindScrollbar();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  const openTextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    if (!view) return;
    event.preventDefault();
    onActivateCommandsRef.current?.();
    view.focus();
    setTextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div
        ref={hostRef}
        className="markdown-editor"
        aria-label={translate(locale, 'markdownEditor')}
        onContextMenu={openTextMenu}
        onFocus={() => onActivateCommandsRef.current?.()}
        onPointerDown={() => onActivateCommandsRef.current?.()}
      />
      {textMenu && viewRef.current && (
        <TextCommandMenu
          x={textMenu.x}
          y={textMenu.y}
          locale={locale}
          commands={EDITOR_TEXT_COMMANDS}
          controller={{
            canRun: () => true,
            run: (command) => runEditorTextCommand(viewRef.current!, command),
          }}
          onClose={() => setTextMenu(null)}
        />
      )}
    </>
  );
}

function NoteView({
  title,
  tier,
  markdown,
  loading,
  summary,
  locale,
  currentTarget,
  internalTargets,
  onInternalNavigate,
  onBack,
  notePath,
  isEditing,
  onToggleEdit,
  onDeleteNote,
  onSetTier,
  onActivateReaderCommands,
  onRegisterReaderCommands,
}: {
  title: string;
  tier?: string;
  markdown: string;
  loading: boolean;
  summary: NoteSummaryRecord | null;
  locale: Locale;
  currentTarget: Omit<InternalNoteTarget, 'label'>;
  internalTargets: InternalNoteTarget[];
  onInternalNavigate: (target: Omit<InternalNoteTarget, 'label'>) => void;
  onBack: () => void;
  notePath: string | null;
  isEditing: boolean;
  onToggleEdit: () => void;
  onDeleteNote: (relativePath: string) => void;
  onSetTier?: (tier: string) => void;
  onActivateReaderCommands?: () => void;
  onRegisterReaderCommands?: (controller: TextCommandController | null) => void;
}) {
  const [tierPickerOpen, setTierPickerOpen] = useState(false);
  const normalizedTier = useMemo(() => normalizeTier(tier), [tier]);
  const renderedMarkdown = useMemo(
    () =>
      linkInternalKeywords(
        normalizeMarkdown(markdown),
        internalTargets,
        currentTarget,
      ),
    [currentTarget.id, currentTarget.kind, internalTargets, markdown],
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const markdownBodyRef = useRef<HTMLDivElement>(null);
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);
  const [noteSummaryExpanded, setNoteSummaryExpanded] = useState(false);

  useEffect(() => {
    setNoteSummaryExpanded(false);
  }, [notePath, summary?.text]);

  const handleCopyFullText = async () => {
    if (!markdown.trim()) return;
    try {
      await writeClipboardText(`${title}\n\n${markdown}`.trim());
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be unavailable outside Tauri; leave the button unchanged.
    }
  };

  const readerController = useMemo<TextCommandController>(
    () => ({
      canRun: (command) => READER_TEXT_COMMANDS.includes(command) && Boolean(markdown.trim()),
      run: async (command) => {
        const body = markdownBodyRef.current;
        if (!body) return;
        if (command === 'selectAll') {
          selectElementText(body);
          return;
        }
        if (command === 'copy') {
          const selection = window.getSelection();
          const selectedText =
            selection && selectionIsInside(body) ? selection.toString().trim() : '';
          if (!selectedText) return;
          await writeClipboardText(selectedText);
        }
      },
    }),
    [markdown, title],
  );

  useEffect(() => {
    onRegisterReaderCommands?.(readerController);
    return () => onRegisterReaderCommands?.(null);
  }, [onRegisterReaderCommands, readerController]);

  const openReaderTextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!markdown.trim()) return;
    event.preventDefault();
    onActivateReaderCommands?.();
    setTextMenu({ x: event.clientX, y: event.clientY });
  };

  const components = useMemo(
    () => ({
      a: (
        props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
          node?: unknown;
        },
      ) => <AppLink {...props} onInternalNavigate={onInternalNavigate} />,
    }),
    [onInternalNavigate],
  );

  return (
    <article className="page note-view">
      <div className="note-header">
        <div className="note-title-row">
          <PageBackButton locale={locale} onBack={onBack} />
          <h1>{title}</h1>
          <div className="tier-picker">
            <button
              type="button"
              className={`large-tier tier-picker-trigger ${tierPickerOpen ? 'open' : ''}`}
              style={
                (normalizedTier && tierMeta[normalizedTier]
                  ? { '--tier-color': tierMeta[normalizedTier].color }
                  : { '--tier-color': tierMeta.pending.color }) as React.CSSProperties
              }
              onClick={() => onSetTier && setTierPickerOpen((open) => !open)}
              disabled={!onSetTier}
              aria-haspopup="menu"
              aria-expanded={tierPickerOpen}
              aria-label={translate(locale, 'setTier')}
            >
              {normalizedTier === 'pending' || !normalizedTier
                ? tierMeta.pending.label[locale]
                : normalizedTier}
            </button>
            {tierPickerOpen && onSetTier && (
              <>
                <div className="tier-picker-backdrop" onClick={() => setTierPickerOpen(false)} />
                <div className="tier-picker-menu" role="menu">
                  <span className="tier-picker-title">{translate(locale, 'setTier')}</span>
                  {TIER_IDS.map((tierId) => (
                    <button
                      key={tierId}
                      type="button"
                      role="menuitem"
                      className={normalizedTier === tierId ? 'active' : ''}
                      onClick={() => {
                        setTierPickerOpen(false);
                        onSetTier(tierId);
                      }}
                    >
                      <span className="tier-swatch" style={{ background: tierMeta[tierId].color }} />
                      <strong>{tierId}</strong>
                      <small>{tierMeta[tierId].label[locale]}</small>
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    className={
                      normalizedTier === 'pending' || !normalizedTier ? 'active' : ''
                    }
                    onClick={() => {
                      setTierPickerOpen(false);
                      onSetTier('pending');
                    }}
                  >
                    <span
                      className="tier-swatch"
                      style={{ background: tierMeta.pending.color }}
                    />
                    <strong>{tierMeta.pending.label[locale]}</strong>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="note-meta-row">
          <div className="note-actions note-actions-primary">
            <button
              type="button"
              className={`note-action copy-full ${copied ? 'copied' : ''}`}
              disabled={loading || !markdown.trim()}
              onClick={() => void handleCopyFullText()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>
                {copied
                  ? translate(locale, 'copiedFullText')
                  : translate(locale, 'copyFullText')}
              </span>
            </button>
            <button
              type="button"
              className="note-action note-action-future"
              disabled
              aria-label={translate(locale, 'mobileLongImage')}
            >
              <Smartphone size={14} />
              <span>{translate(locale, 'mobileLongImage')}</span>
            </button>
            <button
              type="button"
              className="note-action note-action-future"
              disabled
              aria-label={translate(locale, 'generatePpt')}
            >
              <Presentation size={14} />
              <span>{translate(locale, 'generatePpt')}</span>
            </button>
            <button
              type="button"
              className="note-action note-action-future"
              disabled
              aria-label={translate(locale, 'generateVideo')}
            >
              <Video size={14} />
              <span>{translate(locale, 'generateVideo')}</span>
            </button>
          </div>
          <div className="note-actions note-actions-secondary">
            <button
              type="button"
              className="note-action danger"
              aria-label={translate(locale, 'deleteNote')}
              disabled={!notePath}
              onClick={() => notePath && onDeleteNote(notePath)}
            >
              <Trash2 size={14} />
              <span>{translate(locale, 'deleteNote')}</span>
            </button>
            <button
              type="button"
              className={`note-action ${isEditing ? 'active' : ''}`}
              aria-label={translate(locale, isEditing ? 'closeEditor' : 'editNote')}
              disabled={!notePath || loading}
              onClick={onToggleEdit}
            >
              {isEditing ? <X size={14} /> : <Pencil size={14} />}
              <span>{translate(locale, isEditing ? 'closeEditor' : 'editNote')}</span>
            </button>
          </div>
        </div>
        {!loading && summary?.text && (
          <section className={`note-summary${summary.source === 'ai' ? ' is-ai' : ''}`}>
            <button
              type="button"
              className="note-summary-head"
              aria-expanded={noteSummaryExpanded}
              onClick={() => setNoteSummaryExpanded((current) => !current)}
            >
              <span className="note-summary-toggle">
                {noteSummaryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <strong>{translate(locale, 'noteSummary')}</strong>
              </span>
              <small>{translate(locale, 'noteSummaryHint')}</small>
            </button>
            {noteSummaryExpanded && (
              <div className="note-summary-body">
                <p>{summary.text}</p>
                <small>
                  {summary.status === 'loading'
                    ? translate(locale, 'noteSummaryLoading')
                    : summary.source === 'ai'
                      ? translate(locale, 'noteSummaryAi')
                      : translate(locale, 'noteSummaryLocal')}
                </small>
              </div>
            )}
          </section>
        )}
      </div>
      {loading ? (
        <div className="loading-state compact">
          <LoaderCircle className="spin" size={22} />
        </div>
      ) : (
        <div
          ref={markdownBodyRef}
          className="markdown-body"
          onContextMenu={openReaderTextMenu}
          onPointerDown={() => onActivateReaderCommands?.()}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {renderedMarkdown}
          </ReactMarkdown>
        </div>
      )}
      {textMenu && (
        <TextCommandMenu
          x={textMenu.x}
          y={textMenu.y}
          locale={locale}
          commands={READER_TEXT_COMMANDS}
          controller={readerController}
          onClose={() => setTextMenu(null)}
        />
      )}
    </article>
  );
}

function formatAgentRunDuration(elapsedSeconds: number, locale: Locale): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes === 0) return locale === 'zh' ? `${seconds}秒` : `${seconds}s`;
  return locale === 'zh'
    ? `${minutes}分${String(seconds).padStart(2, '0')}秒`
    : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const AGENT_STATUS_VERBS: Record<Locale, string[]> = {
  zh: [
    '思索',
    '琢磨',
    '酝酿',
    '烹调',
    '雕琢',
    '沉吟',
    '推敲',
    '冥想',
    '编织',
    '梳理',
    '揉捏',
    '锻造',
    '调和',
    '织梦',
    '谋划',
    '玩味',
    '端详',
    '神游',
    '钻研',
    '寻思',
    '烧脑',
    '挠头',
    '浸泡',
    '发酵',
    '熬煮',
    '炮制',
    '推演',
    '演算',
    '召唤',
    '拨弦',
    '咕嘟',
    '搅拌',
    '编排',
    '凝聚',
    '飘忽',
  ],
  en: [
    'Brewing',
    'Bootstrapping',
    'Calculating',
    'Cascading',
    'Channelling',
    'Cogitating',
    'Composing',
    'Computing',
    'Concocting',
    'Considering',
    'Cooking',
    'Crafting',
    'Crunching',
    'Cultivating',
    'Deciphering',
    'Deliberating',
    'Doing',
    'Effecting',
    'Envisioning',
    'Forging',
    'Formulating',
    'Generating',
    'Hatching',
    'Honing',
    'Imagining',
    'Incubating',
    'Manifesting',
    'Marinating',
    'Meditating',
    'Mulling',
    'Musing',
    'Optimizing',
    'Orchestrating',
    'Percolating',
    'Plotting',
    'Pondering',
    'Processing',
    'Reasoning',
    'Reticulating',
    'Spelunking',
    'Spinning',
    'Stewing',
    'Synthesizing',
    'Thinking',
    'Tinkering',
    'Transmuting',
    'Unfurling',
    'Vibing',
    'Working',
    'Wrangling',
  ],
};

const AGENT_STATUS_GLYPHS = ['·', '✢', '*', '✶', '✻', '✽'];
const AGENT_STATUS_FRAMES = [...AGENT_STATUS_GLYPHS, ...[...AGENT_STATUS_GLYPHS].reverse()];

function formatAgentStatusPhrase(verb: string, locale: Locale): string {
  return locale === 'zh' ? `正在${verb}中…` : `${verb}…`;
}

function AgentTurnStatus({ locale }: { locale: Locale }) {
  const [startedAt] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [frame, setFrame] = useState(0);
  const pickPhrase = () => {
    const verbs = AGENT_STATUS_VERBS[locale];
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    return formatAgentStatusPhrase(verb, locale);
  };
  const [target, setTarget] = useState(() => pickPhrase());
  const [shown, setShown] = useState(target);
  const [phase, setPhase] = useState<'show' | 'erase' | 'type'>('show');

  useEffect(() => {
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setFrame((value) => (value + 1) % AGENT_STATUS_FRAMES.length),
      100,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const next = pickPhrase();
    setTarget(next);
    setShown(next);
    setPhase('show');
    // Locale changes should restart the phrase in the new language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (phase === 'show') {
      const timer = window.setTimeout(() => setPhase('erase'), 2800);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'erase') {
      if (shown.length === 0) {
        setTarget(pickPhrase());
        setPhase('type');
        return;
      }
      const timer = window.setTimeout(() => setShown((value) => value.slice(0, -1)), 45);
      return () => window.clearTimeout(timer);
    }
    if (shown.length >= target.length) {
      setPhase('show');
      return;
    }
    const timer = window.setTimeout(() => setShown(target.slice(0, shown.length + 1)), 70);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, shown, target]);

  return (
    <div className="agent-turn-status" role="status" aria-live="polite">
      <span className="agent-turn-status-glyph" aria-hidden="true">
        {AGENT_STATUS_FRAMES[frame]}
      </span>
      <span className="agent-turn-status-text">
        <span className="agent-turn-status-shimmer">{shown}</span>
        {phase !== 'show' && <span className="agent-turn-status-caret" aria-hidden="true" />}
      </span>
      {elapsedSeconds >= 15 && (
        <span className="agent-turn-status-clock" aria-hidden="true">
          {formatAgentRunDuration(elapsedSeconds, locale)}
        </span>
      )}
    </div>
  );
}

function ConversationView({
  conversationId,
  locale,
  messages,
  busy,
  onInternalNavigate,
  onConfirmMemory,
  onDismissMemory,
}: {
  conversationId: string;
  locale: Locale;
  messages: ChatMessage[];
  busy: boolean;
  onInternalNavigate: (target: Omit<InternalNoteTarget, 'label'>) => void;
  onConfirmMemory: (messageId: string, suggestion: MemorySuggestion) => void;
  onDismissMemory: (messageId: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const jumpBarRef = useRef<HTMLElement>(null);
  const jumpScrollRef = useRef<HTMLDivElement>(null);
  const lastJumpPointerYRef = useRef<number | null>(null);
  const [textMenu, setTextMenu] = useState<{ x: number; y: number; copyText: string } | null>(null);
  const [hoveredJumpMessageId, setHoveredJumpMessageId] = useState<string | null>(null);
  const [jumpPreviewTop, setJumpPreviewTop] = useState(0);
  const renderedConversationRef = useRef('');
  const previousScrollHeightRef = useRef(0);
  const jumpMessages = useMemo(
    () => messages.filter((message) => message.role === 'user'),
    [messages],
  );
  const components = useMemo(
    () => ({
      a: (
        props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
          node?: unknown;
        },
      ) => <AppLink {...props} onInternalNavigate={onInternalNavigate} />,
    }),
    [onInternalNavigate],
  );
  useLayoutEffect(() => {
    const scrollContainer = endRef.current?.closest<HTMLElement>('.content-scroll');
    if (!scrollContainer) return;

    const switchedConversation = renderedConversationRef.current !== conversationId;
    const previousScrollHeight = previousScrollHeightRef.current;
    const distanceFromPreviousBottom =
      previousScrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
    const wasNearBottom = distanceFromPreviousBottom <= 56;

    if (switchedConversation || previousScrollHeight === 0 || wasNearBottom) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    renderedConversationRef.current = conversationId;
    previousScrollHeightRef.current = scrollContainer.scrollHeight;
  }, [conversationId, messages, busy]);

  const jumpToMessage = (messageId: string) => {
    const list = messageListRef.current;
    const scrollContainer = list?.closest<HTMLElement>('.content-scroll');
    const target = list?.querySelector<HTMLElement>(`[data-jump-message-id="${CSS.escape(messageId)}"]`);
    if (!scrollContainer || !target) return;
    const top = target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
    scrollContainer.scrollTo({
      top: Math.max(0, scrollContainer.scrollTop + top - 24),
      behavior: 'smooth',
    });
  };

  const closestJumpMessageFromY = (clientY: number) => {
    const bar = jumpBarRef.current;
    const items = jumpScrollRef.current?.querySelectorAll<HTMLElement>('.conversation-jump-item');
    if (!bar || !items || items.length === 0) return null;

    let closestItem: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < closestDistance) {
        closestItem = item;
        closestDistance = distance;
      }
    });
    if (!closestItem) return null;
    const rect = (closestItem as HTMLElement).getBoundingClientRect();
    return {
      id: (closestItem as HTMLElement).dataset.jumpTargetId || '',
      top: rect.top + rect.height / 2 - bar.getBoundingClientRect().top,
    };
  };

  const updateJumpHover = (clientY: number) => {
    const closest = closestJumpMessageFromY(clientY);
    if (!closest?.id) return;
    setHoveredJumpMessageId(closest.id);
    setJumpPreviewTop(closest.top);
  };

  const handleJumpPointerMove = (event: React.MouseEvent<HTMLElement>) => {
    lastJumpPointerYRef.current = event.clientY;
    updateJumpHover(event.clientY);
  };

  const handleJumpRailClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('.conversation-jump-item')) return;
    const closest = closestJumpMessageFromY(event.clientY);
    if (closest?.id) jumpToMessage(closest.id);
  };

  const hoveredJumpIndex = jumpMessages.findIndex(
    (message) => message.id === hoveredJumpMessageId,
  );
  const hoveredJumpMessage = hoveredJumpIndex >= 0 ? jumpMessages[hoveredJumpIndex] : null;

  const conversationTextController = useMemo<TextCommandController>(
    () => ({
      canRun: (command) =>
        command === 'selectAll'
          ? messages.length > 0
          : command === 'copy' && Boolean(textMenu?.copyText),
      run: async (command) => {
        const list = messageListRef.current;
        if (!list) return;
        if (command === 'selectAll') {
          selectElementText(list);
          return;
        }
        if (command === 'copy' && textMenu?.copyText) {
          await writeClipboardText(textMenu.copyText);
        }
      },
    }),
    [messages.length, textMenu?.copyText],
  );

  const openConversationTextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const list = messageListRef.current;
    if (!list || messages.length === 0) return;
    event.preventDefault();

    const selection = window.getSelection();
    const selectedText =
      selection && selectionIsInside(list) ? selection.toString() : '';
    const record = (event.target as Element).closest<HTMLElement>('[data-conversation-copy]');
    const recordText = record?.innerText.trim() || '';
    setTextMenu({
      x: event.clientX,
      y: event.clientY,
      copyText: selectedText || recordText,
    });
  };

  return (
    <div className="page conversation-view" onContextMenu={openConversationTextMenu}>
      {jumpMessages.length > 1 && (
        <nav
          ref={jumpBarRef}
          className="conversation-jump-bar"
          aria-label={locale === 'zh' ? '对话快速定位' : 'Conversation navigation'}
          onMouseMove={handleJumpPointerMove}
          onMouseLeave={() => {
            lastJumpPointerYRef.current = null;
            setHoveredJumpMessageId(null);
          }}
        >
          <div
            ref={jumpScrollRef}
            className="conversation-jump-scroll"
            onClick={handleJumpRailClick}
            onScroll={() => {
              if (lastJumpPointerYRef.current !== null) {
                updateJumpHover(lastJumpPointerYRef.current);
              }
            }}
          >
            {jumpMessages.map((message, index) => {
              const hoverDistance = hoveredJumpIndex < 0
                ? undefined
                : Math.abs(index - hoveredJumpIndex);
              return (
                <button
                  type="button"
                  key={message.id}
                  data-jump-target-id={message.id}
                  data-hover-distance={
                    hoverDistance !== undefined && hoverDistance <= 2
                      ? hoverDistance
                      : undefined
                  }
                  className="conversation-jump-item"
                  aria-label={
                    locale === 'zh'
                      ? `跳转到第 ${index + 1} 轮提问`
                      : `Jump to question ${index + 1}`
                  }
                  aria-describedby={hoveredJumpMessageId === message.id ? 'conversation-jump-preview' : undefined}
                  onFocus={() => {
                    const item = jumpScrollRef.current?.querySelector<HTMLElement>(
                      `[data-jump-target-id="${CSS.escape(message.id)}"]`,
                    );
                    const bar = jumpBarRef.current;
                    if (!item || !bar) return;
                    const rect = item.getBoundingClientRect();
                    setHoveredJumpMessageId(message.id);
                    setJumpPreviewTop(rect.top + rect.height / 2 - bar.getBoundingClientRect().top);
                  }}
                  onBlur={() => setHoveredJumpMessageId(null)}
                  onClick={() => jumpToMessage(message.id)}
                >
                  <span aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {hoveredJumpMessage && (
            <div
              id="conversation-jump-preview"
              className="conversation-jump-preview"
              role="tooltip"
              style={{ top: jumpPreviewTop }}
            >
              {hoveredJumpMessage.content.replace(/\s+/g, ' ').trim()}
            </div>
          )}
        </nav>
      )}
      {messages.length === 0 && (
        <div className="chat-empty-state">
          <div className="chat-empty-heading">
            <strong className="chat-empty-wordmark">Coffee Note</strong>
          </div>
          <p className="chat-empty-features">
            {locale === 'zh'
              ? 'DeepSeek 高效缓存引擎 · 双向记忆路由 · Library Graph · 自动压缩'
              : 'DeepSeek cache optimization · bidirectional memory routing · Library Graph · automatic compaction'}
          </p>
        </div>
      )}
      <div ref={messageListRef} className="message-list">
        {messages.map((message) => {
          if (message.role === 'tool_call') {
            const toolLabels: Record<string, Record<NonNullable<ChatMessage['toolStatus']>, string>> = {
              save_note: {
                running: locale === 'zh' ? '正在保存笔记' : 'Saving note',
                done: locale === 'zh' ? '已保存笔记' : 'Saved note',
                failed: locale === 'zh' ? '保存笔记失败' : 'Could not save note',
              },
              update_note: {
                running: locale === 'zh' ? '正在更新笔记' : 'Updating note',
                done: locale === 'zh' ? '已更新笔记' : 'Updated note',
                failed: locale === 'zh' ? '更新笔记失败' : 'Could not update note',
              },
              update_plan: {
                running: locale === 'zh' ? '正在更新计划' : 'Updating plan',
                done: locale === 'zh' ? '已更新计划' : 'Updated plan',
                failed: locale === 'zh' ? '更新计划失败' : 'Could not update plan',
              },
              update_tier: {
                running: locale === 'zh' ? '正在调整层级' : 'Updating tier',
                done: locale === 'zh' ? '已调整层级' : 'Updated tier',
                failed: locale === 'zh' ? '调整层级失败' : 'Could not update tier',
              },
              search_library: {
                running: locale === 'zh' ? '正在搜索知识库' : 'Searching library',
                done: locale === 'zh' ? '已搜索知识库' : 'Searched library',
                failed: locale === 'zh' ? '搜索知识库失败' : 'Could not search library',
              },
              read_note: {
                running: locale === 'zh' ? '正在读取笔记' : 'Reading note',
                done: locale === 'zh' ? '已读取笔记' : 'Read note',
                failed: locale === 'zh' ? '读取笔记失败' : 'Could not read note',
              },
              web_fetch: {
                running: locale === 'zh' ? '正在读取网页' : 'Fetching webpage',
                done: locale === 'zh' ? '已读取网页' : 'Fetched webpage',
                failed: locale === 'zh' ? '读取网页失败' : 'Could not fetch webpage',
              },
            };
            const status = message.toolStatus || 'running';
            const fallbackName = (message.toolName || (locale === 'zh' ? '工具' : 'tool'))
              .replaceAll('_', ' ');
            const label = toolLabels[message.toolName || '']?.[status]
              || (locale === 'zh'
                ? status === 'running'
                  ? `正在执行${fallbackName}`
                  : status === 'failed'
                    ? `执行${fallbackName}失败`
                    : `已执行${fallbackName}`
                : status === 'running'
                  ? `Running ${fallbackName}`
                  : status === 'failed'
                    ? `Could not run ${fallbackName}`
                    : `Ran ${fallbackName}`);
            const statusIcon =
              status === 'failed' ? (
                <X size={13} />
              ) : status === 'done' ? (
                <Check size={13} />
              ) : (
                <Wrench size={13} />
              );
            return (
              <details
                className={`tool-activity is-${status}`}
                key={message.id}
                data-conversation-copy
              >
                <summary className="tool-activity-summary">
                  <span className="tool-activity-status" aria-hidden="true">{statusIcon}</span>
                  <span className="tool-activity-label">{label}</span>
                  <ChevronRight className="tool-activity-chevron" size={14} aria-hidden="true" />
                </summary>
                <div className="tool-activity-body">
                  {message.toolArgs && (
                    <div className="tool-activity-section">
                      <span className="tool-activity-section-label">
                        {locale === 'zh' ? '输入' : 'Input'}
                      </span>
                      <pre className="tool-activity-data">{message.toolArgs}</pre>
                    </div>
                  )}
                  {message.toolOutput && (
                    <div className="tool-activity-section">
                      <span className="tool-activity-section-label">
                        {status === 'failed'
                          ? locale === 'zh' ? '错误' : 'Error'
                          : locale === 'zh' ? '结果' : 'Result'}
                      </span>
                      <pre className={`tool-activity-data ${status === 'failed' ? 'failed' : ''}`}>
                        {message.toolOutput.length > 2000
                          ? message.toolOutput.slice(0, 2000) + '\n…'
                          : message.toolOutput}
                      </pre>
                    </div>
                  )}
                  {!message.toolArgs && !message.toolOutput && (
                    <span className="tool-activity-empty">
                      {status === 'running'
                        ? locale === 'zh' ? '正在准备详情…' : 'Preparing details…'
                        : locale === 'zh' ? '没有更多详情' : 'No additional details'}
                    </span>
                  )}
                </div>
              </details>
            );
          }
          if (message.role === 'memory_suggestion' && message.memorySuggestion) {
            const saved = message.memoryStatus === 'saved';
            const dismissed = message.memoryStatus === 'dismissed';
            return (
              <div
                className={`memory-suggestion-card ${saved ? 'saved' : ''} ${dismissed ? 'dismissed' : ''}`}
                key={message.id}
                data-conversation-copy
              >
                <div className="memory-suggestion-copy">
                  <span className="memory-suggestion-kicker">
                    <Sparkles size={13} />
                    {locale === 'zh' ? 'AI 建议记住' : 'AI suggests remembering'}
                  </span>
                  <strong>{message.memorySuggestion.content}</strong>
                  <small>{message.memorySuggestion.kind.replace('_', ' ')}</small>
                </div>
                <div className="memory-suggestion-actions">
                  {saved || dismissed ? (
                    <span>
                      {saved
                        ? locale === 'zh'
                          ? '已保存'
                          : 'Saved'
                        : locale === 'zh'
                          ? '已忽略'
                          : 'Dismissed'}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onConfirmMemory(message.id, message.memorySuggestion!)}
                      >
                        {locale === 'zh' ? '保存到我的设定' : 'Save to My Contexts'}
                      </button>
                      <button type="button" onClick={() => onDismissMemory(message.id)}>
                        {locale === 'zh' ? '忽略' : 'Dismiss'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div
              className={`message ${message.role}`}
              key={message.id}
              data-conversation-copy
              data-jump-message-id={message.role === 'user' ? message.id : undefined}
            >
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
        {busy && <AgentTurnStatus locale={locale} />}
        <div ref={endRef} />
      </div>
      {textMenu && (
        <TextCommandMenu
          x={textMenu.x}
          y={textMenu.y}
          locale={locale}
          commands={READER_TEXT_COMMANDS}
          controller={conversationTextController}
          onClose={() => setTextMenu(null)}
        />
      )}
    </div>
  );
}

function HealthLogPanel({ locale }: { locale: Locale }) {
  const [log, setLog] = useStoredState<HealthLog>(HEALTH_LOG_KEY, {});
  const [date, setDate] = useState<string>(() => todayKey());
  const entry = log[date] || {};
  const isToday = date === todayKey();

  const setField = (field: HealthLogField, value: string) => {
    setLog({ ...log, [date]: { ...entry, [field]: value } });
  };

  const clearDay = () => {
    const next = { ...log };
    delete next[date];
    setLog(next);
  };

  const recordedCount = Object.keys(log).filter((key) => entryHasContent(log[key])).length;
  const weekKeys = Array.from({ length: 7 }, (_, index) => shiftKey(todayKey(), index - 6));
  const weekdays =
    locale === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const fields: Array<{ id: HealthLogField; label: string; placeholder: string; icon: ReactNode }> = [
    {
      id: 'exercise',
      label: locale === 'zh' ? '有氧&力量' : 'Cardio & Strength',
      placeholder:
        locale === 'zh' ? '例如：快走 30 分钟、力量训练、拉伸' : 'e.g. 30 min walk, strength training, stretching',
      icon: <Dumbbell size={16} />,
    },
    {
      id: 'diet',
      label: locale === 'zh' ? '饮食&补剂' : 'Food & Supplements',
      placeholder:
        locale === 'zh' ? '例如：三餐内容、蛋白质、补剂、进食时间' : 'e.g. meals, protein, supplements, meal timing',
      icon: <Utensils size={16} />,
    },
    {
      id: 'body',
      label: locale === 'zh' ? '数据&记录' : 'Data & Notes',
      placeholder:
        locale === 'zh' ? '例如：体重、睡眠时长、血压、当日感受' : 'e.g. weight, sleep hours, blood pressure, how you feel',
      icon: <Activity size={16} />,
    },
  ];

  const recordedText =
    locale === 'zh'
      ? '已记录 ' + recordedCount + ' 天'
      : recordedCount + ' day' + (recordedCount === 1 ? '' : 's') + ' logged';

  return (
    <div className="health-log">
      <div className="health-log-head">
        <div>
          <span className="health-log-kicker">
            <NotebookPen size={15} />
            {locale === 'zh' ? '每日记录' : 'DAILY LOG'}
          </span>
          <strong>{locale === 'zh' ? '健康记录' : 'Health log'}</strong>
          <small>{recordedText}</small>
        </div>
      </div>

      <div className="health-week" role="group" aria-label={locale === 'zh' ? '最近七天' : 'Last seven days'}>
        {weekKeys.map((key) => {
          const d = new Date(key + 'T00:00:00');
          const has = entryHasContent(log[key]);
          const active = key === date;
          const today = key === todayKey();
          return (
            <button
              type="button"
              key={key}
              className={
                'health-week-day' +
                (active ? ' active' : '') +
                (has ? ' has' : '') +
                (today ? ' today' : '')
              }
              onClick={() => setDate(key)}
            >
              <span className="health-week-wd">{weekdays[d.getDay()]}</span>
              <span className="health-week-num">{d.getDate()}</span>
              <span className="health-week-dot" />
            </button>
          );
        })}
      </div>

      <div className="health-datebar">
        <button
          type="button"
          className="health-date-nav"
          onClick={() => setDate(shiftKey(date, -1))}
          aria-label={locale === 'zh' ? '前一天' : 'Previous day'}
        >
          <ChevronLeft size={18} />
        </button>
        <input
          type="date"
          className="health-date-input"
          value={date}
          onChange={(event) => setDate(event.target.value || date)}
          aria-label={locale === 'zh' ? '选择日期' : 'Pick a date'}
        />
        <button
          type="button"
          className="health-date-nav"
          onClick={() => setDate(shiftKey(date, 1))}
          aria-label={locale === 'zh' ? '后一天' : 'Next day'}
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className={'health-today' + (isToday ? ' active' : '')}
          onClick={() => setDate(todayKey())}
        >
          {locale === 'zh' ? '今天' : 'Today'}
        </button>
      </div>

      <div className="health-fields">
        {fields.map((field) => (
          <label className="health-field" key={field.id}>
            <span className="health-field-label">
              <span className="health-field-icon">{field.icon}</span>
              {field.label}
            </span>
            <textarea
              rows={3}
              value={entry[field.id] || ''}
              placeholder={field.placeholder}
              onChange={(event) => setField(field.id, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="health-log-foot">
        <span className="health-saved">
          <Check size={15} />
          {locale === 'zh' ? '自动保存到本机' : 'Saved locally as you type'}
        </span>
        {entryHasContent(entry) ? (
          <button type="button" className="health-clear" onClick={clearDay}>
            <Trash2 size={15} />
            {locale === 'zh' ? '清空当天' : 'Clear day'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PlanView({
  locale,
  retrievalState,
  onSection,
  onToggleRetrieval,
  onBack,
  onHome,
  includePriorities,
  onTogglePriorities,
  onAdd,
  t,
}: {
  locale: Locale;
  retrievalState: MyInfoRetrievalState;
  onSection: (section: PlanSection) => void;
  onToggleRetrieval: (section: MyInfoSectionId) => void;
  onBack: () => void;
  onHome: () => void;
  includePriorities: boolean;
  onTogglePriorities: () => void;
  onAdd: () => void;
  t: (key: TranslationKey) => string;
}) {
  const sections = getPlanSections(locale);

  return (
    <div className="page plan-view">
      <section className="page-intro">
        <div className="note-title-row">
          <PageBackButton locale={locale} onBack={onBack} />
          <h1>{t('planTitle')}</h1>
          <span className="plan-title-hint">{t('planHint')}</span>
        </div>
      </section>

      <div className="plan-section-grid">
        <div className="plan-section-card">
          <button type="button" className="plan-section-open" onClick={onHome}>
            <span className="plan-section-icon" style={{ background: 'var(--tertiary-surface)' }}>
              <Layers3 size={17} />
            </span>
            <span className="plan-section-copy">
              <strong>{t('myPriorities')}</strong>
              <small>{t('myPrioritiesSub')}</small>
            </span>
          </button>
          <button
            type="button"
            className="plan-retrieval-switch"
            role="switch"
            aria-checked={includePriorities}
            aria-label={locale === 'zh' ? 'AI 检索我的优先级' : 'AI retrieval for My Priorities'}
            onClick={onTogglePriorities}
          >
            <span />
          </button>
        </div>
        <button type="button" className="plan-section-card plan-section-add" onClick={onAdd}>
          <span className="plan-section-icon" style={{ background: 'var(--tertiary-surface)' }}>
            <FilePlus2 size={17} />
          </span>
          <span>
            <strong>{t('addMaterial')}</strong>
            <small>{t('addMaterialCreateSub')}</small>
          </span>
        </button>
        {sections.map((section) => (
          <div
            className="plan-section-card"
            key={section.id}
          >
            <button
              type="button"
              className="plan-section-open"
              onClick={() => onSection(section.id)}
            >
              <span className="plan-section-icon" style={{ background: section.accent }}>
                {section.icon}
              </span>
              <span className="plan-section-copy">
                <strong>{section.title}</strong>
                <small>{section.description}</small>
              </span>
            </button>
            <button
              type="button"
              className="plan-retrieval-switch"
              role="switch"
              aria-checked={retrievalState[section.id]}
              aria-label={
                locale === 'zh'
                  ? `AI 检索：${section.title}`
                  : `AI retrieval for ${section.title}`
              }
              onClick={() => onToggleRetrieval(section.id)}
            >
              <span />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatComposer({
  busy,
  onSend,
  onAbort,
  placeholder,
  sendLabel,
  stopLabel,
  inputRef,
  currentPage,
  onClearCurrentPage,
  contextBytes,
  contextMaxBytes,
  usage,
  modelConfig,
  modelSettings,
  modelCatalog,
  skillCatalog,
  selectedSkillId,
  onSelectedSkillChange,
  onOpenSkillSettings,
  onModelChange,
  onReasoningEffortChange,
  currencyMode,
  locale,
}: {
  busy: boolean;
  onSend: (message: string, skillId: string | null) => void;
  onAbort?: () => void;
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  currentPage?: string;
  onClearCurrentPage: () => void;
  contextBytes: number;
  contextMaxBytes: number;
  usage: ConversationUsage;
  modelConfig: ModelConfig;
  modelSettings: ModelSettings;
  modelCatalog: ModelCatalog;
  skillCatalog: SkillCatalog;
  selectedSkillId: string | null;
  onSelectedSkillChange: (skillId: string | null) => void;
  onOpenSkillSettings: () => void;
  onModelChange: (providerKey: string, model: string) => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  currencyMode: CurrencyMode;
  locale: Locale;
}) {
  const [value, setValue] = useState('');
  const [textMenu, setTextMenu] = useState<{ x: number; y: number } | null>(null);
  const configuredModel = modelConfig.model.trim();
  const modelChoices = useMemo(() => configuredModelChoices(modelSettings), [modelSettings]);
  const reasoningLevels = configuredModel ? COMPOSER_REASONING_LEVELS : [];
  const configuredReasoningIndex = Math.max(
    0,
    reasoningLevels.findIndex((level) => level.value === modelConfig.reasoningEffort),
  );
  const [previewReasoningPosition, setPreviewReasoningPosition] = useState(configuredReasoningIndex);
  const [reasoningDragging, setReasoningDragging] = useState(false);
  const [reasoningDragPhase, setReasoningDragPhase] = useState<'idle' | 'slow' | 'catchup' | 'tracking'>('idle');
  const reasoningMotionTimersRef = useRef<number[]>([]);
  const [openComposerMenu, setOpenComposerMenu] = useState<'model' | 'reasoning' | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [activeSkillGroupId, setActiveSkillGroupId] = useState<string | null>(null);
  const composerControlsRef = useRef<HTMLDivElement>(null);
  const composerSkillRef = useRef<HTMLDivElement>(null);
  const composerSkillItemsRef = useRef<HTMLDivElement>(null);
  const selectedSkill = skillCatalog.skills.find((skill) => skill.id === selectedSkillId) ?? null;
  const activeSkillGroup = activeSkillGroupId
    ? skillCatalog.categories.find((group) => group.id === activeSkillGroupId) ?? null
    : null;
  const activeSkillGroupIndex = activeSkillGroup
    ? Math.max(
        0,
        skillCatalog.categories.findIndex((group) => group.id === activeSkillGroup.id),
      )
    : 0;
  const activeSkills = skillCatalog.skills.filter(
    (skill) => skill.categoryId === activeSkillGroup?.id && skill.enabled,
  );
  const cacheTokens = usage.cacheHitTokens + usage.cacheMissTokens + usage.cacheWriteTokens;
  const cacheHitRate = cacheTokens > 0
    ? `${Math.round((usage.cacheHitTokens / cacheTokens) * 100)}%`
    : usage.requestCount === 0 ? '0%' : '—';
  const contextPercent = `${Math.min(100, Math.round((contextBytes / contextMaxBytes) * 100))}%`;
  const currency = resolveCurrency(currencyMode, locale);
  const currencySymbol = currency === 'CNY' ? '¥' : '$';
  const cost = estimateModelCost(usage, modelConfig, currency, modelCatalog);
  const formattedCost = cost == null
    ? null
    : cost < 0.01
      ? cost.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
      : cost.toFixed(2);
  const costLabel = usage.requestCount === 0
    ? `${currencySymbol}0.00`
    : cost == null
      ? '—'
      : `${currencySymbol}${formattedCost}`;
  const numberFormat = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');
  const reasoningPosition = Math.min(
    Math.max(0, reasoningLevels.length - 1),
    Math.max(0, previewReasoningPosition),
  );
  const selectedReasoningIndex = Math.round(reasoningPosition);
  const selectedReasoning = reasoningLevels[selectedReasoningIndex];
  const selectedReasoningLabel = selectedReasoning?.label[locale]
    ?? (locale === 'zh' ? '标准' : 'Standard');
  const reasoningAtMax = selectedReasoning?.value === 'max';
  const reasoningStepPercent = reasoningLevels.length > 1
    ? 100 / (reasoningLevels.length - 1)
    : 0;
  const snapReasoningPosition = (position: number) => {
    const nextIndex = Math.min(
      Math.max(0, reasoningLevels.length - 1),
      Math.max(0, Math.round(position)),
    );
    setPreviewReasoningPosition(nextIndex);
    const effort = reasoningLevels[nextIndex]?.value;
    if (effort) onReasoningEffortChange(effort);
  };
  const clearReasoningMotionTimers = () => {
    reasoningMotionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    reasoningMotionTimersRef.current = [];
  };
  const startReasoningDragMotion = () => {
    clearReasoningMotionTimers();
    setReasoningDragPhase('slow');
    const catchupTimer = window.setTimeout(() => {
      setReasoningDragPhase('catchup');
      const trackingTimer = window.setTimeout(() => {
        setReasoningDragPhase('tracking');
      }, 45);
      reasoningMotionTimersRef.current.push(trackingTimer);
    }, 45);
    reasoningMotionTimersRef.current.push(catchupTimer);
  };
  const stopReasoningDragMotion = () => {
    clearReasoningMotionTimers();
    setReasoningDragPhase('idle');
  };

  useEffect(() => {
    setPreviewReasoningPosition(configuredReasoningIndex);
  }, [configuredReasoningIndex, configuredModel]);

  useEffect(() => () => {
    reasoningMotionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!openComposerMenu) return;

    const closeOnOutsidePress = (event: globalThis.PointerEvent) => {
      if (!composerControlsRef.current?.contains(event.target as Node)) {
        setOpenComposerMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenComposerMenu(null);
    };

    window.addEventListener('pointerdown', closeOnOutsidePress);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openComposerMenu]);

  useEffect(() => {
    if (!skillMenuOpen) return;

    const closeOnOutsidePress = (event: globalThis.PointerEvent) => {
      if (!composerSkillRef.current?.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSkillMenuOpen(false);
    };

    window.addEventListener('pointerdown', closeOnOutsidePress);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [skillMenuOpen]);

  useEffect(() => {
    const element = composerSkillItemsRef.current;
    if (!activeSkillGroup || !element) return;
    return bindAutoHideScrollbar(element, 450, true, 8);
  }, [activeSkillGroup]);

  // Must match the `.composer textarea` CSS max-height (6 lines at 1.45).
  const autosize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 122);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 122 ? 'auto' : 'hidden';
  }, [inputRef]);

  useLayoutEffect(() => {
    autosize();
  }, [value, autosize]);

  // Re-measure when the pane is resized and wrapping changes.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        autosize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autosize, inputRef]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !value.trim()) return;
    onSend(value, selectedSkillId);
    onSelectedSkillChange(null);
    setValue('');
  };

  const replaceComposerSelection = (text: string, from?: number, to?: number) => {
    const input = inputRef.current;
    if (!input) return;
    const start = from ?? input.selectionStart;
    const end = to ?? input.selectionEnd;
    input.focus();
    input.setSelectionRange(start, end);

    if (document.execCommand('insertText', false, text)) {
      setValue(input.value);
      return;
    }

    const nextValue = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    const nextCaret = start + text.length;
    setValue(nextValue);
    window.requestAnimationFrame(() => input.setSelectionRange(nextCaret, nextCaret));
  };

  const composerTextController: TextCommandController = {
    canRun: (command) => {
      const input = inputRef.current;
      if (!input) return false;
      const hasSelection = input.selectionEnd > input.selectionStart;
      if (command === 'copy' || command === 'cut') return hasSelection;
      if (command === 'delete') return hasSelection || input.selectionStart < input.value.length;
      if (command === 'selectAll') return input.value.length > 0;
      return true;
    },
    run: async (command) => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();

      if (command === 'undo' || command === 'redo') {
        document.execCommand(command);
        setValue(input.value);
        return;
      }
      if (command === 'selectAll') {
        input.setSelectionRange(0, input.value.length);
        return;
      }

      const start = input.selectionStart;
      const end = input.selectionEnd;
      const selectedText = input.value.slice(start, end);
      if (command === 'copy' || command === 'cut') {
        if (!selectedText) return;
        await writeClipboardText(selectedText);
        if (command === 'cut') replaceComposerSelection('', start, end);
        return;
      }
      if (command === 'paste') {
        const clipboardText = await readClipboardText();
        if (clipboardText) replaceComposerSelection(clipboardText, start, end);
        return;
      }
      if (command === 'delete') {
        replaceComposerSelection('', start, end > start ? end : Math.min(start + 1, input.value.length));
      }
    },
  };

  const openComposerTextMenu = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    setTextMenu({ x: event.clientX, y: event.clientY });
  };

  const chooseSkill = (skill: SkillDefinition) => {
    onSelectedSkillChange(skill.id);
    setSkillMenuOpen(false);
  };

  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onContextMenu={openComposerTextMenu}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label={placeholder}
        />
        <div className="composer-tools">
          <div className="composer-skill-control" ref={composerSkillRef}>
            {selectedSkill ? (
              <button
                type="button"
                className="composer-skill-pill"
                onClick={() => onSelectedSkillChange(null)}
                aria-label={locale === 'zh' ? `关闭技能 ${selectedSkill.title}` : `Close skill ${selectedSkill.title}`}
              >
                <X size={13} strokeWidth={2.4} />
                <span>{selectedSkill.title}</span>
              </button>
            ) : (
              <button
                type="button"
                className={`composer-skill-trigger${skillMenuOpen ? ' open' : ''}`}
                onClick={() => {
                  setActiveSkillGroupId(null);
                  setSkillMenuOpen((current) => !current);
                }}
                aria-label={locale === 'zh' ? '选择技能' : 'Choose a skill'}
                aria-expanded={skillMenuOpen}
                aria-haspopup="menu"
              >
                <Plus className="composer-skill-icon" size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            {skillMenuOpen && !selectedSkill && (
              <div className="composer-skill-popover" role="menu">
                <div className="composer-skill-groups">
                  {skillCatalog.categories.map((group) => (
                    <button
                      type="button"
                      className={`composer-skill-group${activeSkillGroup?.id === group.id ? ' active' : ''}`}
                      key={group.id}
                      role="menuitem"
                      onMouseEnter={() => {
                        setActiveSkillGroupId(group.id);
                      }}
                      onFocus={() => {
                        setActiveSkillGroupId(group.id);
                      }}
                    >
                      <span>{locale === 'en' && group.id === 'copywriting' ? 'Copywriting' : locale === 'en' && group.id === 'ppt' ? 'Presentations' : locale === 'en' && group.id === 'video' ? 'Video' : locale === 'en' && group.id === 'media' ? 'Media to text' : group.label}</span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="composer-skill-management"
                    role="menuitem"
                    onClick={() => {
                      setSkillMenuOpen(false);
                      onOpenSkillSettings();
                    }}
                  >
                    <span>{locale === 'zh' ? '技能管理' : 'Manage skills'}</span>
                    <Settings size={15} strokeWidth={1.8} />
                  </button>
                </div>
                {activeSkillGroup && (
                  <div
                    ref={composerSkillItemsRef}
                    className="composer-skill-items"
                    role="menu"
                    aria-label={activeSkillGroup.label}
                    style={{ bottom: `calc(100% - ${42 + activeSkillGroupIndex * 36}px)` }}
                  >
                    {activeSkills.map((skill) => (
                      <button
                        type="button"
                        className="composer-skill-item"
                        role="menuitem"
                        key={skill.id}
                        onClick={() => chooseSkill(skill)}
                      >
                        <strong>{skillTitle(skill, locale)}</strong>
                        <small>{skillDescription(skill, locale)}</small>
                      </button>
                    ))}
                    {activeSkills.length === 0 && (
                      <p className="composer-skill-empty">
                        {locale === 'zh' ? '这个分类还没有技能。' : 'No skills in this category.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {currentPage && (
            <button
              type="button"
              className="composer-context-pill"
              onClick={onClearCurrentPage}
              aria-label={locale === 'zh' ? `移除文章上下文 ${currentPage}` : `Remove note context ${currentPage}`}
            >
              <X size={13} strokeWidth={2.4} />
              <span>{currentPage}</span>
            </button>
          )}
          <div className="composer-preview-controls" ref={composerControlsRef}>
            <div className="composer-preview-control">
              <button
                type="button"
                className="composer-preview-trigger composer-model-id"
                aria-expanded={openComposerMenu === 'model'}
                aria-haspopup="listbox"
                onClick={() => setOpenComposerMenu((current) => current === 'model' ? null : 'model')}
              >
                {configuredModel || (locale === 'zh' ? '选择模型' : 'Choose model')}
              </button>
              {openComposerMenu === 'model' && (
                <div
                  className="composer-preview-popover composer-model-popover"
                  role="listbox"
                  aria-label={locale === 'zh' ? '选择模型' : 'Choose model'}
                >
                  {modelChoices.map(({ providerKey, provider, model }) => (
                    <button
                      type="button"
                      className={modelConfig.providerKey === providerKey && configuredModel === model ? 'selected' : ''}
                      role="option"
                      aria-selected={modelConfig.providerKey === providerKey && configuredModel === model}
                      onClick={() => {
                        onModelChange(providerKey, model);
                        setOpenComposerMenu(null);
                      }}
                      key={`${providerKey}:${model}`}
                    >
                      <ProviderMark providerId={provider.providerId} />
                      <span>
                        <strong>{model}</strong>
                        <small>{modelCatalog[provider.providerId]?.name || provider.name}</small>
                      </span>
                      {modelConfig.providerKey === providerKey && configuredModel === model
                        && <Check size={15} strokeWidth={2.2} />}
                    </button>
                  ))}
                  {modelChoices.length === 0 && (
                    <p className="composer-model-empty">
                      {locale === 'zh' ? '请先在设置中添加模型。' : 'Add a model in Settings first.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="composer-preview-control">
              {reasoningLevels.length > 0 ? (
                <button
                  type="button"
                  className={`composer-preview-trigger composer-reasoning-level${reasoningAtMax ? ' is-max' : ''}`}
                  aria-expanded={openComposerMenu === 'reasoning'}
                  aria-haspopup="dialog"
                  onClick={() => setOpenComposerMenu((current) => current === 'reasoning' ? null : 'reasoning')}
                >
                  {selectedReasoningLabel}
                </button>
              ) : (
                <span className="composer-reasoning-unavailable">
                  {locale === 'zh' ? '标准' : 'Standard'}
                </span>
              )}
              {openComposerMenu === 'reasoning' && (
                <div
                  className="composer-preview-popover composer-reasoning-popover"
                  role="dialog"
                  aria-label={locale === 'zh' ? '推理强度预览' : 'Reasoning effort preview'}
                >
                  <div className="composer-reasoning-header">
                    <span>{locale === 'zh' ? '推理强度' : 'Reasoning effort'}</span>
                    <strong className={reasoningAtMax ? 'is-max' : ''}>
                      {selectedReasoningLabel}
                    </strong>
                  </div>
                  <div
                    className={`composer-reasoning-slider${reasoningDragging ? ` is-dragging is-${reasoningDragPhase}` : ''}${reasoningAtMax ? ' is-max' : ''}`}
                  >
                    <div className="composer-reasoning-track" aria-hidden="true">
                      <span
                        className="composer-reasoning-fill"
                        style={{
                          width: `calc(8px + ${reasoningPosition * reasoningStepPercent}% - ${reasoningPosition * 4}px)`,
                        }}
                      />
                      <div className="composer-reasoning-points">
                        {reasoningLevels.map((level, index) => (
                          <span
                            className={`${index === reasoningLevels.length - 1 ? 'last ' : ''}${index === selectedReasoningIndex ? 'selected' : ''}`}
                            style={{ left: `${index * reasoningStepPercent}%` }}
                            key={level.value}
                          />
                        ))}
                      </div>
                    </div>
                    <span
                      className="composer-reasoning-thumb"
                      aria-hidden="true"
                      style={{
                        left: `calc(8px + ${reasoningPosition * reasoningStepPercent}% - ${reasoningPosition * 4}px)`,
                      }}
                    />
                    <input
                      type="range"
                      min="0"
                      max={reasoningLevels.length - 1}
                      step="any"
                      value={reasoningPosition}
                      aria-label={locale === 'zh' ? '推理强度' : 'Reasoning effort'}
                      aria-valuetext={selectedReasoningLabel}
                      onChange={(event) => {
                        setPreviewReasoningPosition(Number(event.currentTarget.value));
                      }}
                      onPointerDown={(event) => {
                        setReasoningDragging(true);
                        startReasoningDragMotion();
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerUp={(event) => {
                        setReasoningDragging(false);
                        stopReasoningDragMotion();
                        snapReasoningPosition(Number(event.currentTarget.value));
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                      }}
                      onPointerCancel={(event) => {
                        setReasoningDragging(false);
                        stopReasoningDragMotion();
                        snapReasoningPosition(Number(event.currentTarget.value));
                      }}
                      onKeyUp={(event) => {
                        snapReasoningPosition(Number(event.currentTarget.value));
                      }}
                      onBlur={(event) => {
                        setReasoningDragging(false);
                        stopReasoningDragMotion();
                        snapReasoningPosition(Number(event.currentTarget.value));
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            className="composer-send-button"
            type={busy ? 'button' : 'submit'}
            onClick={busy ? onAbort : undefined}
            disabled={busy ? !onAbort : !value.trim()}
            aria-label={busy ? stopLabel : sendLabel}
          >
            {busy ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </form>
      {textMenu && (
        <TextCommandMenu
          x={textMenu.x}
          y={textMenu.y}
          locale={locale}
          commands={EDITOR_TEXT_COMMANDS}
          controller={composerTextController}
          onClose={() => setTextMenu(null)}
        />
      )}
      <div className="composer-metrics" aria-label={locale === 'zh' ? 'AI 用量统计' : 'AI usage'}>
        <span className="composer-metric-group">
          {numberFormat.format(usage.requestCount)} {locale === 'zh' ? '次请求' : usage.requestCount === 1 ? 'request' : 'requests'}
        </span>
        <span className="composer-metric-group">
          <b>{locale === 'zh' ? '缓存命中' : 'Cache hit'}</b>{cacheHitRate}
        </span>
        <span className="composer-metric-group composer-metric-token-group">
          <span><b>{locale === 'zh' ? '输入' : 'Input'}</b>{formatCompactTokens(usage.promptTokens)}</span>
          <i aria-hidden="true">·</i>
          <span><b>{locale === 'zh' ? '输出' : 'Output'}</b>{formatCompactTokens(usage.completionTokens)}</span>
        </span>
        <span className="composer-metric-group">
          <b>{locale === 'zh' ? '上下文' : 'Context'}</b>{contextPercent}
        </span>
        <span className="composer-metric-group">
          <b>{locale === 'zh' ? '费用' : 'Cost'}</b>{costLabel}
        </span>
      </div>
    </div>
  );
}

function DialogHeader({
  icon,
  title,
  titleId,
  subtitle,
  onClose,
  closeLabel = 'Close',
  tone = 'teal',
}: {
  icon: ReactNode;
  title: string;
  titleId?: string;
  subtitle?: string;
  onClose?: () => void;
  closeLabel?: string;
  tone?: 'teal' | 'blue';
}) {
  return (
    <header className={`dialog-titlebar dialog-titlebar-${tone}`}>
      <div className="dialog-titlebar-main">
        <span className="dialog-titlebar-icon">{icon}</span>
        <div className="dialog-titlebar-copy">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button type="button" className="dialog-titlebar-close" onClick={onClose} aria-label={closeLabel}>
          <X size={19} />
        </button>
      )}
    </header>
  );
}

function RightRail({
  locale,
  aiActive,
  editingNote,
  conversations,
  activeConversationId,
  unreadConversationIds,
  chatBusy,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onPreviewEditingNote,
  onAutosaveEditingNote,
  onActivateEditorCommands,
  onRegisterEditorCommands,
  t,
}: {
  locale: Locale;
  aiActive: boolean;
  editingNote: RailEditorTarget | null;
  conversations: ConversationSummary[];
  activeConversationId: string;
  unreadConversationIds: string[];
  chatBusy: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => Promise<void>;
  onDeleteConversation: (id: string) => void;
  onPreviewEditingNote: (content: string) => void;
  onAutosaveEditingNote: (content: string) => Promise<void>;
  onActivateEditorCommands: () => void;
  onRegisterEditorCommands: (controller: TextCommandController | null) => void;
  t: (key: TranslationKey) => string;
}) {
  const [editorDraft, setEditorDraft] = useState(editingNote?.markdown || '');
  const [editorSavedMarkdown, setEditorSavedMarkdown] = useState(editingNote?.markdown || '');
  const [conversationMenu, setConversationMenu] = useState<ConversationContextMenuState | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [conversationRenameValue, setConversationRenameValue] = useState('');
  const cancelConversationRenameRef = useRef(false);
  const conversationRenameTitleRef = useRef<HTMLElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const railScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditorDraft(editingNote?.markdown || '');
    setEditorSavedMarkdown(editingNote?.markdown || '');
  }, [editingNote?.markdown, editingNote?.relativePath]);

  // Re-render once a minute while the conversation list is visible so the
  // relative timestamps ("x 分钟前") stay fresh without a full app tick.
  const [, setConversationClock] = useState(0);
  useEffect(() => {
    if (!aiActive || editingNote) return;
    const timer = window.setInterval(() => setConversationClock((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [aiActive, editingNote]);

  useEffect(() => {
    if (!renamingConversationId) return;
    const frame = window.requestAnimationFrame(() => {
      const title = conversationRenameTitleRef.current;
      if (!title) return;
      title.focus();
      selectElementText(title);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renamingConversationId]);

  useEffect(() => {
    if (!editingNote) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (editorDraft === editorSavedMarkdown) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void onAutosaveEditingNote(editorDraft)
        .then(() => {
          setEditorSavedMarkdown(editorDraft);
        });
    }, 700);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [editingNote, editorDraft, editorSavedMarkdown, onAutosaveEditingNote]);

  useEffect(() => {
    const element = railScrollRef.current;
    if (!element || !aiActive || editingNote) return;
    return bindAutoHideScrollbar(element, 450, false, 5);
  }, [aiActive, editingNote]);

  const changeEditorDraft = (content: string) => {
    setEditorDraft(content);
    onPreviewEditingNote(content);
  };
  const startConversationRename = (conversation: ConversationSummary) => {
    setConversationMenu(null);
    cancelConversationRenameRef.current = false;
    setConversationRenameValue(conversation.title || (locale === 'zh' ? '新对话' : 'New conversation'));
    setRenamingConversationId(conversation.id);
  };
  const finishConversationRename = async (conversation: ConversationSummary, value = conversationRenameValue) => {
    const nextTitle = value.replace(/\s+/g, ' ').trim();
    setRenamingConversationId(null);
    if (!nextTitle || nextTitle === conversation.title) return;
    try {
      await onRenameConversation(conversation.id, nextTitle);
    } catch {
      // A later reload restores the persisted title if the record changed externally.
    }
  };
  return (
    <aside className={`right-rail${editingNote ? ' right-rail-editing' : ''}`}>
      {aiActive && !editingNote && (
        <div className="rail-header">
          <button
            type="button"
            className="rail-resume-chat"
            onClick={onNewChat}
            disabled={chatBusy}
          >
            <Plus size={15} />
            {t('newChat')}
          </button>
        </div>
      )}

      <div
        ref={railScrollRef}
        className={`rail-scroll${editingNote ? ' rail-scroll-editor' : ''}`}
      >
        {aiActive ? (
          <>
            <div className="conversation-history-list">
              {conversations.length ? (
                conversations.map((conversation) => {
                  const isWorking = chatBusy && conversation.id === activeConversationId;
                  const isUnread = unreadConversationIds.includes(conversation.id);
                  const isRenaming = renamingConversationId === conversation.id;
                  const conversationTitle = conversation.title || (locale === 'zh' ? '新对话' : 'New conversation');
                  const conversationMeta = (
                    <small className="conversation-history-meta">
                      <span>
                        {conversation.messageCount}{locale === 'zh' ? ' 条消息' : ' messages'} · {formatRelativeTime(conversation.updatedAt, locale)}
                      </span>
                    </small>
                  );
                  return (
                    <div
                      className={`conversation-history-item${conversation.id === activeConversationId ? ' active' : ''}${isWorking ? ' working' : ''}${isUnread ? ' unread' : ''}`}
                      key={conversation.id}
                      aria-busy={isWorking || undefined}
                      onContextMenu={(event) => {
                        if (isRenaming) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setConversationMenu({
                          conversation,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    >
                      {isRenaming ? (
                        <div className="conversation-history-rename">
                          <strong
                            ref={conversationRenameTitleRef}
                            className="conversation-history-rename-title"
                            contentEditable
                            suppressContentEditableWarning
                            role="textbox"
                            spellCheck={false}
                            aria-label={locale === 'zh' ? '对话名称' : 'Conversation name'}
                            onInput={(event) => setConversationRenameValue(event.currentTarget.textContent || '')}
                            onClick={(event) => event.stopPropagation()}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                cancelConversationRenameRef.current = false;
                                event.currentTarget.blur();
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelConversationRenameRef.current = true;
                                setRenamingConversationId(null);
                              }
                            }}
                            onBlur={(event) => {
                              if (cancelConversationRenameRef.current) {
                                cancelConversationRenameRef.current = false;
                                return;
                              }
                              void finishConversationRename(conversation, event.currentTarget.textContent || '');
                            }}
                          >
                            {conversationRenameValue}
                          </strong>
                          {conversationMeta}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectConversation(conversation.id)}
                          disabled={chatBusy || conversation.id === activeConversationId}
                          aria-label={isUnread
                            ? locale === 'zh'
                              ? `${conversationTitle}，有未查看的回复`
                              : `${conversationTitle}, has an unread response`
                            : undefined}
                        >
                          <strong>{conversationTitle}</strong>
                          {conversationMeta}
                        </button>
                      )}
                      {!isRenaming && (isWorking ? (
                        <span
                          className="conversation-history-working"
                          role="status"
                          aria-label={locale === 'zh' ? 'AI 正在处理这个对话' : 'AI is working on this conversation'}
                        >
                          <span className="conversation-history-working-dot" aria-hidden="true" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="conversation-history-delete"
                          onClick={() => onDeleteConversation(conversation.id)}
                          disabled={chatBusy}
                          aria-label={locale === 'zh' ? '删除对话' : 'Delete conversation'}
                        >
                          <Trash2 size={16} />
                        </button>
                      ))}
                    </div>
                  );
                })
              ) : (
                <p className="rail-empty-state">{locale === 'zh' ? '暂无历史对话' : 'No saved conversations yet'}</p>
              )}
            </div>
          </>
        ) : editingNote ? (
          <section className="rail-editor-shell">
            <MarkdownEditor
              value={editorDraft}
              onChange={changeEditorDraft}
              locale={locale}
              onActivateCommands={onActivateEditorCommands}
              onRegisterCommands={onRegisterEditorCommands}
            />
          </section>
        ) : null}
      </div>

      {conversationMenu && (
        <ConversationContextMenu
          menu={conversationMenu}
          locale={locale}
          mutationDisabled={chatBusy}
          onRename={startConversationRename}
          onDelete={onDeleteConversation}
          onClose={() => setConversationMenu(null)}
        />
      )}

    </aside>
  );
}

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

const CUSTOM_PROVIDER_PREFIX = 'custom-';

function isCustomProviderId(providerId: string): boolean {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

function ProviderMark({ providerId }: { providerId: string }) {
  const [failed, setFailed] = useState(false);
  if (isCustomProviderId(providerId) || failed) {
    return <Box className="provider-mark provider-custom-mark" aria-hidden="true" />;
  }
  return (
    <img
      className="provider-mark"
      src={providerLogoUrl(providerId)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

function ModelSettingsSection({
  locale,
  config,
  catalog,
  catalogLoading,
  catalogError,
  currencyMode,
  onChange,
  onCurrencyMode,
  onRefreshCatalog,
  t,
}: {
  locale: Locale;
  config: ModelSettings;
  catalog: ModelCatalog;
  catalogLoading: boolean;
  catalogError: string;
  currencyMode: CurrencyMode;
  onChange: (config: ModelSettings) => void;
  onCurrencyMode: (currencyMode: CurrencyMode) => void;
  onRefreshCatalog: () => void;
  t: (key: TranslationKey) => string;
}) {
  const resolvedCurrency = resolveCurrency(currencyMode, locale);
  const configuredProviders = Object.values(config.providers);
  const catalogProviders = useMemo(() => {
    const supported = supportedCatalogProviders(catalog);
    const known = new Set(supported.map((provider) => provider.id));
    const missing = configuredProviders
      .filter((provider) => !known.has(provider.providerId))
      .map((provider) => ({
        id: provider.providerId,
        name: provider.name,
        npm: '',
        api: provider.baseUrl,
        doc: undefined,
        models: {},
      }));
    return [...supported, ...missing];
  }, [catalog, configuredProviders]);
  const initialProviderId = config.providers[config.activeProvider]?.providerId;
  const [selectedProviderId, setSelectedProviderId] = useState(initialProviderId || 'openai');
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [addingCustomProvider, setAddingCustomProvider] = useState(false);
  const [customProviderName, setCustomProviderName] = useState('');
  const providerListScrollRef = useAutoHideScrollbar<HTMLDivElement>();
  const selectedCatalogProvider = catalogProviders.find(
    (provider) => provider.id === selectedProviderId,
  );
  const configuredEntry = Object.entries(config.providers).find(
    ([, provider]) => provider.providerId === selectedProviderId,
  );
  const configuredKey = configuredEntry?.[0] || selectedProviderId;
  const selectedConfig = configuredEntry?.[1];
  const isActiveProvider = config.activeProvider === configuredKey;
  const filteredProviders = useMemo(() => {
    const query = providerSearch.trim().toLowerCase();
    const defaultProviderId = config.providers[config.activeProvider]?.providerId;
    const configuredByProviderId = new Map(
      Object.values(config.providers).map((provider) => [provider.providerId, provider]),
    );
    const priority = (providerId: string) => {
      if (isCustomProviderId(providerId)) return 0;
      if (providerId === defaultProviderId) return 1;
      const configured = configuredByProviderId.get(providerId);
      if (configured && configuredProviderModels(configured).length > 0) return 2;
      return 3;
    };
    return catalogProviders
      .filter((provider) =>
        !query || `${provider.name} ${provider.id}`.toLowerCase().includes(query),
      )
      .sort((left, right) => priority(left.id) - priority(right.id));
  }, [catalogProviders, config.activeProvider, config.providers, providerSearch]);
  const filteredModels = useMemo(() => {
    if (!selectedCatalogProvider) return [];
    const query = modelSearch.trim().toLowerCase();
    const enabled = new Set(selectedConfig?.models || []);
    const registeredCustomModels = new Set(selectedConfig?.customModels || []);
    const catalogModels = Object.values(selectedCatalogProvider.models)
      .filter((model) => !registeredCustomModels.has(model.id));
    const catalogModelIds = new Set(catalogModels.map((model) => model.id));
    const localModelIds = Array.from(new Set([
      ...(selectedConfig?.customModels || []),
      ...configuredProviderModels(selectedConfig || { models: [] })
        .filter((modelId) => !catalogModelIds.has(modelId)),
    ]));
    const manualModels = localModelIds
      .map((modelId): ModelCatalogModel => ({
        id: modelId,
        name: modelId,
        reasoning: false,
        reasoningOptions: [],
        toolCall: false,
        attachment: false,
      }));
    return [...catalogModels, ...manualModels]
      .filter((model) =>
        (model.status !== 'deprecated' || enabled.has(model.id))
        && (!query || `${model.name} ${model.id} ${model.family || ''}`.toLowerCase().includes(query)),
      )
      .sort((left, right) => {
        const selectedDelta = Number(enabled.has(right.id)) - Number(enabled.has(left.id));
        if (selectedDelta) return selectedDelta;
        return (right.releaseDate || '').localeCompare(left.releaseDate || '')
          || left.name.localeCompare(right.name);
      });
  }, [modelSearch, selectedCatalogProvider, selectedConfig?.customModels, selectedConfig?.models]);

  useEffect(() => {
    if (!selectedCatalogProvider && catalogProviders[0]) {
      setSelectedProviderId(catalogProviders[0].id);
    }
  }, [catalogProviders, selectedCatalogProvider]);

  const createProviderConfig = (): ProviderConfig => ({
    providerId: selectedProviderId,
    name: selectedCatalogProvider?.name || selectedProviderId,
    protocol: defaultProtocolForProvider(selectedProviderId),
    baseUrl: selectedCatalogProvider ? defaultEndpointForProvider(selectedCatalogProvider) : '',
    apiKey: '',
    customModels: [],
    models: [],
    model: '',
  });
  const updateSelectedProvider = (patch: Partial<ProviderConfig>) => {
    const provider = {
      ...(selectedConfig || createProviderConfig()),
      ...patch,
      protocol: defaultProtocolForProvider(selectedProviderId),
    };
    onChange({
      ...config,
      activeProvider: config.activeProvider || configuredKey,
      providers: { ...config.providers, [configuredKey]: provider },
    });
  };
  const toggleModel = (modelId: string) => {
    const current = selectedConfig || createProviderConfig();
    const configuredModels = configuredProviderModels(current);
    const enabled = configuredModels.includes(modelId);
    const models = enabled
      ? configuredModels.filter((id) => id !== modelId)
      : [...configuredModels, modelId];
    const model = enabled && current.model === modelId
      ? models[0] || ''
      : current.model || modelId;
    onChange({
      ...config,
      activeProvider: config.activeProvider || configuredKey,
      providers: {
        ...config.providers,
        [configuredKey]: { ...current, models, model },
      },
    });
  };
  const activateSelectedProvider = () => {
    if (!selectedConfig) return;
    const configuredModels = configuredProviderModels(selectedConfig);
    if (!configuredModels.length) return;
    const model = configuredModels.includes(selectedConfig.model)
      ? selectedConfig.model
      : configuredModels[0];
    onChange({
      ...config,
      activeProvider: configuredKey,
      providers: {
        ...config.providers,
        [configuredKey]: { ...selectedConfig, models: configuredModels, model },
      },
    });
  };
  const addManualModel = () => {
    const modelId = manualModel.trim();
    if (!modelId) return;
    const current = selectedConfig || createProviderConfig();
    const customModels = Array.from(new Set([...current.customModels, modelId]));
    const models = Array.from(new Set([...configuredProviderModels(current), modelId]));
    onChange({
      ...config,
      activeProvider: config.activeProvider || configuredKey,
      providers: {
        ...config.providers,
        [configuredKey]: {
          ...current,
          customModels,
          models,
          model: current.model || modelId,
        },
      },
    });
    setManualModel('');
  };
  const deleteManualModel = (modelId: string) => {
    if (!selectedConfig) return;
    const customModels = selectedConfig.customModels.filter((id) => id !== modelId);
    const models = configuredProviderModels(selectedConfig).filter((id) => id !== modelId);
    const model = selectedConfig.model === modelId
      ? models[0] || ''
      : selectedConfig.model;
    onChange({
      ...config,
      providers: {
        ...config.providers,
        [configuredKey]: { ...selectedConfig, customModels, models, model },
      },
    });
  };
  const addCustomProvider = () => {
    const name = customProviderName.trim();
    if (!name) return;
    const providerId = `${CUSTOM_PROVIDER_PREFIX}${crypto.randomUUID()}`;
    const provider: ProviderConfig = {
      providerId,
      name,
      protocol: 'openai',
      baseUrl: '',
      apiKey: '',
      customModels: [],
      models: [],
      model: '',
    };
    onChange({
      ...config,
      activeProvider: config.activeProvider || providerId,
      providers: { ...config.providers, [providerId]: provider },
    });
    setSelectedProviderId(providerId);
    setProviderSearch('');
    setModelSearch('');
    setCustomProviderName('');
    setAddingCustomProvider(false);
  };
  const deleteCustomProvider = () => {
    if (!selectedConfig || !isCustomProviderId(selectedProviderId)) return;
    const providers = { ...config.providers };
    delete providers[configuredKey];
    const nextActiveProvider = config.activeProvider === configuredKey
      ? Object.entries(providers).find(([, provider]) => configuredProviderModels(provider).length)?.[0]
        || Object.keys(providers)[0]
        || ''
      : config.activeProvider;
    onChange({ ...config, activeProvider: nextActiveProvider, providers });
    setSelectedProviderId(
      providers[nextActiveProvider]?.providerId
        || supportedCatalogProviders(catalog)[0]?.id
        || 'openai',
    );
    setModelSearch('');
  };

  return (
    <section className="settings-section settings-model-section">
      <div className="settings-section-heading settings-model-section-heading">
          <h2>{locale === 'zh' ? '模型' : 'Models'}</h2>
        <button
          type="button"
          className="settings-refresh-catalog"
          onClick={onRefreshCatalog}
          disabled={catalogLoading}
        >
          <RefreshCw size={15} className={catalogLoading ? 'is-spinning' : ''} />
          {locale === 'zh' ? '刷新目录' : 'Refresh catalog'}
        </button>
        <p>{locale === 'zh' ? '模型的规划决定输出结果和运行上下文，以及不同的价格。' : 'Model configuration determines output results, runtime context, and pricing.'}</p>
        <div className="settings-currency-control">
          <span>{t('currencyUnit')}</span>
          <div className="settings-currency-symbols">
            {(['CNY', 'USD'] as const).map((currency) => (
              <button
                type="button"
                className={resolvedCurrency === currency ? 'active' : ''}
                onClick={() => onCurrencyMode(currency)}
                aria-pressed={resolvedCurrency === currency}
                aria-label={currency === 'CNY'
                  ? (locale === 'zh' ? '货币单位：人民币' : 'Currency: Chinese yuan')
                  : (locale === 'zh' ? '货币单位：美元' : 'Currency: US dollar')}
                key={currency}
              >
                {currency === 'CNY' ? '¥' : '$'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {catalogError && (
        <p className="settings-catalog-error">
          {locale === 'zh' ? '目录暂时不可用：' : 'Catalog unavailable: '}{catalogError}
        </p>
      )}
      <div className="settings-model-browser">
        <div className="settings-provider-directory">
          <div className="settings-search-field">
            <Search size={15} />
            <input
              value={providerSearch}
              onChange={(event) => setProviderSearch(event.target.value)}
              placeholder={locale === 'zh' ? '搜索供应商' : 'Search providers'}
              aria-label={locale === 'zh' ? '搜索供应商' : 'Search providers'}
            />
            {providerSearch && (
              <button
                type="button"
                className="settings-search-clear"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setProviderSearch('')}
                aria-label={locale === 'zh' ? '清空供应商搜索' : 'Clear provider search'}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {addingCustomProvider ? (
            <form
              className="settings-custom-provider-form"
              onSubmit={(event) => {
                event.preventDefault();
                addCustomProvider();
              }}
            >
              <input
                value={customProviderName}
                onChange={(event) => setCustomProviderName(event.target.value)}
                placeholder={locale === 'zh' ? '自定义名称' : 'Custom name'}
                aria-label={locale === 'zh' ? '自定义名称' : 'Custom name'}
                autoFocus
              />
              <button
                type="submit"
                disabled={!customProviderName.trim()}
                aria-label={locale === 'zh' ? '添加自定义供应商' : 'Add custom provider'}
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCustomProvider(false);
                  setCustomProviderName('');
                }}
                aria-label={locale === 'zh' ? '取消添加' : 'Cancel adding provider'}
              >
                <X size={14} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="settings-add-provider"
              onClick={() => setAddingCustomProvider(true)}
            >
              <Plus size={15} />
              {locale === 'zh' ? '添加自定义' : 'Add custom'}
            </button>
          )}
          <div ref={providerListScrollRef} className="settings-provider-list auto-hide-scrollbar">
            {filteredProviders.map((provider) => {
              const entry = Object.entries(config.providers).find(
                ([, item]) => item.providerId === provider.id,
              );
              const selectedModelCount = entry
                ? configuredProviderModels(entry[1]).length
                : 0;
              return (
                <button
                  type="button"
                  className={selectedProviderId === provider.id ? 'active' : ''}
                  onClick={() => {
                    setSelectedProviderId(provider.id);
                    setModelSearch('');
                  }}
                  key={provider.id}
                >
                  <ProviderMark providerId={provider.id} />
                  <span>{provider.name}</span>
                  {entry?.[0] === config.activeProvider ? (
                    <small>{locale === 'zh' ? '默认' : 'Default'}</small>
                  ) : selectedModelCount > 0 ? (
                    <small>{selectedModelCount}</small>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-provider-detail">
          {selectedCatalogProvider ? (
            <>
              <div className="settings-provider-header">
                <ProviderMark providerId={selectedCatalogProvider.id} />
                <h3>{selectedCatalogProvider.name}</h3>
                {isCustomProviderId(selectedProviderId) ? (
                  <button
                    type="button"
                    className="settings-provider-docs settings-delete-provider"
                    onClick={deleteCustomProvider}
                    aria-label={locale === 'zh' ? '删除自定义供应商' : 'Delete custom provider'}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : selectedCatalogProvider.doc ? (
                  <button
                    type="button"
                    className="settings-provider-docs"
                    onClick={() => void openExternalUrl(selectedCatalogProvider.doc!)}
                    aria-label={locale === 'zh' ? '打开供应商文档' : 'Open provider documentation'}
                  >
                    <ExternalLink size={16} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`settings-use-provider${isActiveProvider ? ' active' : ''}`}
                  onClick={activateSelectedProvider}
                  disabled={!selectedConfig || configuredProviderModels(selectedConfig).length === 0 || isActiveProvider}
                >
                  {isActiveProvider
                    ? (locale === 'zh' ? '默认' : 'Default')
                    : (locale === 'zh' ? '设为默认' : 'Set as default')}
                </button>
              </div>

              <div className="settings-provider-fields">
                <label>
                  <span>{t('baseUrl')}</span>
                  <input
                    value={selectedConfig?.baseUrl ?? defaultEndpointForProvider(selectedCatalogProvider)}
                    onChange={(event) => updateSelectedProvider({ baseUrl: event.target.value })}
                    spellCheck={false}
                  />
                </label>
                <label>
                  <span>{t('apiKey')}</span>
                  <input
                    type="password"
                    value={selectedConfig?.apiKey || ''}
                    onChange={(event) => updateSelectedProvider({ apiKey: event.target.value })}
                    placeholder={selectedProviderId === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                    autoComplete="off"
                  />
                </label>
              </div>

              {selectedProviderId === 'anthropic' && (
                <p className="settings-protocol-note">
                  {locale === 'zh'
                    ? 'Anthropic 固定使用原生 Messages API 协议。'
                    : 'Anthropic always uses its native Messages API protocol.'}
                </p>
              )}

              <div className="settings-model-picker-header">
                <div>
                  <h4>{locale === 'zh' ? '输入框中可选的模型' : 'Models available in the composer'}</h4>
                  <p>{locale === 'zh' ? '勾选后即可在 AI 输入框直接切换。' : 'Selected models become available directly in the AI composer.'}</p>
                </div>
                <div className="settings-search-field settings-model-search">
                  <Search size={15} />
                  <input
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder={locale === 'zh' ? '搜索模型' : 'Search models'}
                    aria-label={locale === 'zh' ? '搜索模型' : 'Search models'}
                  />
                  {modelSearch && (
                    <button
                      type="button"
                      className="settings-search-clear"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setModelSearch('')}
                      aria-label={locale === 'zh' ? '清空模型搜索' : 'Clear model search'}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="settings-model-list">
                {filteredModels.map((model) => {
                  const enabled = selectedConfig?.models.includes(model.id) || false;
                  const isManualModel = !Object.prototype.hasOwnProperty.call(
                    selectedCatalogProvider.models,
                    model.id,
                  ) || selectedConfig?.customModels.includes(model.id);
                  if (isManualModel) {
                    return (
                      <div
                        className={`settings-model-row settings-custom-model-row${enabled ? ' selected' : ''}`}
                        key={model.id}
                      >
                        <button
                          type="button"
                          className="settings-custom-model-toggle"
                          aria-pressed={enabled}
                          onClick={() => toggleModel(model.id)}
                        >
                          <span className="settings-model-check">{enabled && <Check size={14} />}</span>
                          <span className="settings-model-copy">
                            <strong>{model.id}</strong>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="settings-custom-model-delete"
                          onClick={() => deleteManualModel(model.id)}
                          aria-label={locale === 'zh'
                            ? `删除自定义模型 ${model.id}`
                            : `Delete custom model ${model.id}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      type="button"
                      className={`settings-model-row${enabled ? ' selected' : ''}`}
                      aria-pressed={enabled}
                      onClick={() => toggleModel(model.id)}
                      key={model.id}
                    >
                      <span className="settings-model-check">{enabled && <Check size={14} />}</span>
                      <span className="settings-model-copy">
                        <strong>{model.name}</strong>
                        <small>{model.id}</small>
                      </span>
                      <span className="settings-model-meta">
                        {model.reasoning && <small>{locale === 'zh' ? '推理' : 'Reasoning'}</small>}
                        {model.limit?.context && <small>{formatCompactTokens(model.limit.context)}</small>}
                        {model.cost?.input != null && model.cost.output != null
                          && <small>${model.cost.input} → ${model.cost.output}/M</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="settings-manual-model">
                <input
                  value={manualModel}
                  onChange={(event) => setManualModel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addManualModel();
                  }}
                  placeholder={locale === 'zh' ? '目录中没有？输入模型 ID' : 'Not listed? Enter a model ID'}
                  aria-label={locale === 'zh' ? '自定义模型 ID' : 'Custom model ID'}
                  spellCheck={false}
                />
                <button type="button" onClick={addManualModel} disabled={!manualModel.trim()}>
                  {locale === 'zh' ? '添加' : 'Add'}
                </button>
              </div>
            </>
          ) : (
            <div className="settings-catalog-loading">
              <LoaderCircle size={18} className={catalogLoading ? 'is-spinning' : ''} />
              {locale === 'zh' ? '正在读取模型目录…' : 'Loading model catalog…'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPage({
  initialSection,
  locale,
  config,
  catalog,
  catalogLoading,
  catalogError,
  skillCatalog,
  skillCatalogLoading,
  skillCatalogError,
  onSkillCatalogChange,
  onRefreshCatalog,
  themeMode,
  surfaceScheme,
  currencyMode,
  onChange,
  onLocale,
  onThemeMode,
  onSurfaceScheme,
  onCurrencyMode,
  onClose,
  t,
}: {
  initialSection: SettingsSectionId;
  locale: Locale;
  config: ModelSettings;
  catalog: ModelCatalog;
  catalogLoading: boolean;
  catalogError: string;
  skillCatalog: SkillCatalog;
  skillCatalogLoading: boolean;
  skillCatalogError: string;
  onSkillCatalogChange: (catalog: SkillCatalog) => void;
  onRefreshCatalog: () => void;
  themeMode: ThemeMode;
  surfaceScheme: SurfaceSchemeId;
  currencyMode: CurrencyMode;
  onChange: (config: ModelSettings) => void;
  onLocale: (locale: Locale) => void;
  onThemeMode: (themeMode: ThemeMode) => void;
  onSurfaceScheme: (surfaceScheme: SurfaceSchemeId) => void;
  onCurrencyMode: (currencyMode: CurrencyMode) => void;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [draft, setDraft] = useState(config);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const settingsScrollRef = useAutoHideScrollbar<HTMLDivElement>();
  useEffect(() => setDraft(config), [config]);
  const settingsSections: Array<{
    id: SettingsSectionId;
    label: string;
    icon: ReactNode;
  }> = [
    { id: 'appearance', label: t('settingsAppearance'), icon: <Settings2 size={18} strokeWidth={1.8} /> },
    { id: 'model', label: t('settingsModel'), icon: <Box size={18} strokeWidth={1.8} /> },
    { id: 'skills', label: locale === 'zh' ? '技能' : 'Skills', icon: <Sparkles size={18} strokeWidth={1.8} /> },
    { id: 'transcription', label: t('settingsTranscription'), icon: <AudioLines size={18} strokeWidth={1.8} /> },
    { id: 'messages', label: locale === 'zh' ? '消息' : 'Message', icon: <MessageCircleMore size={18} strokeWidth={1.8} /> },
  ];
  const currentSection = settingsSections.find((section) => section.id === activeSection)
    ?? settingsSections[0];
  const visibleSection = currentSection.id;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <section className="settings-page" aria-label={currentSection.label}>
      <aside className="settings-sidebar">
        <button type="button" className="settings-back" onClick={onClose}>
          <ChevronLeft size={18} strokeWidth={1.8} />
          <span>{locale === 'zh' ? '返回应用' : 'Back to app'}</span>
        </button>

        <nav className="settings-nav" aria-label={locale === 'zh' ? '设置分类' : 'Settings sections'}>
            {settingsSections.map((section) => (
              <button
                type="button"
                className={visibleSection === section.id ? 'active' : ''}
                onClick={() => setActiveSection(section.id)}
                aria-current={visibleSection === section.id ? 'page' : undefined}
                key={section.id}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
        </nav>

        <div className="settings-sidebar-footer">
          <button type="button" onClick={() => void openExternalUrl(FEEDBACK_URL)}>
            <Github size={15} strokeWidth={1.8} />
            {t('feedback')}
          </button>
          <button type="button" onClick={() => void openExternalUrl(PRODUCT_WEBSITE)}>
            Coffee Note · v{APP_VERSION}
          </button>
        </div>
      </aside>

      <main className="settings-workspace">
        <div ref={settingsScrollRef} className="settings-workspace-scroll auto-hide-scrollbar">
          <div className={`settings-panel settings-panel-${visibleSection}`}>
            {visibleSection === 'model' && (
              <>
                <ModelSettingsSection
                  locale={locale}
                  config={draft}
                  catalog={catalog}
                  catalogLoading={catalogLoading}
                  catalogError={catalogError}
                  currencyMode={currencyMode}
                  onChange={(next) => {
                    setDraft(next);
                    onChange(next);
                  }}
                  onCurrencyMode={onCurrencyMode}
                  onRefreshCatalog={onRefreshCatalog}
                  t={t}
                />
              </>
            )}

            {visibleSection === 'skills' && (
              <SkillsSettings
                locale={locale}
                catalog={skillCatalog}
                loading={skillCatalogLoading}
                error={skillCatalogError}
                onCatalogChange={onSkillCatalogChange}
              />
            )}

            {visibleSection === 'appearance' && (
              <div className="settings-appearance-group">
                <section className="settings-appearance-block settings-appearance-inline">
                  <div className="settings-section-heading">
                    <h2>{t('appearance')}</h2>
                    <p>{locale === 'zh' ? '选择浅色、深色，或跟随当前系统。' : 'Use light mode, dark mode, or follow your system.'}</p>
                  </div>
                  <div className="theme-switch">
                    <button type="button" className={themeMode === 'system' ? 'active' : ''} onClick={() => onThemeMode('system')}>
                      <Monitor size={15} />{t('themeSystem')}
                    </button>
                    <button type="button" className={themeMode === 'light' ? 'active' : ''} onClick={() => onThemeMode('light')}>
                      <Sun size={15} />{t('themeLight')}
                    </button>
                    <button type="button" className={themeMode === 'dark' ? 'active' : ''} onClick={() => onThemeMode('dark')}>
                      <Moon size={15} />{t('themeDark')}
                    </button>
                  </div>
                </section>
                <section className="settings-appearance-block settings-appearance-inline">
                  <div className="settings-section-heading">
                    <h2>{t('surfaceScheme')}</h2>
                    <p>{t('surfaceSchemeSub')}</p>
                  </div>
                  <div className="surface-scheme-picker">
                    {SURFACE_SCHEMES.map((scheme) => (
                      <button
                        type="button"
                        className={`surface-scheme-card${surfaceScheme === scheme.id ? ' active' : ''}`}
                        key={scheme.id}
                        onClick={() => onSurfaceScheme(scheme.id)}
                        aria-pressed={surfaceScheme === scheme.id}
                      >
                        <span
                          className="surface-scheme-preview"
                          style={{
                            background: `linear-gradient(90deg, ${scheme.light.canvas} 0 50%, ${scheme.dark.canvas} 50% 100%)`,
                          }}
                        />
                        <span className="surface-scheme-option-label">
                          {locale === 'zh' ? scheme.labelZh : scheme.labelEn}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="settings-appearance-block settings-appearance-inline">
                  <div className="settings-section-heading">
                    <h2>{t('language')}</h2>
                    <p>{locale === 'zh' ? '切换语言仅影响界面。' : 'Language changes affect the interface only.'}</p>
                  </div>
                  <div className="language-switch">
                    <button type="button" className={locale === 'zh' ? 'active' : ''} onClick={() => onLocale('zh')}>中文</button>
                    <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => onLocale('en')}>English</button>
                  </div>
                </section>
                <WeatherLocationSettings locale={locale} />
              </div>
            )}

            {visibleSection === 'transcription' && (
              <TranscriptionSettings locale={locale} />
            )}

            {visibleSection === 'messages' && (
              <MessageSettings locale={locale} />
            )}
          </div>
        </div>
      </main>
    </section>
  );
}

function AddMaterialDialog({
  locale,
  t,
  onClose,
  onCreate,
}: {
  locale: Locale;
  t: (key: TranslationKey) => string;
  onClose: () => void;
  onCreate: (name: string, icon: string) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('filetext');
  const [busy, setBusy] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPos, setIconPos] = useState<{ left: number; top: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!iconPickerOpen) return;
    const close = (event: MouseEvent) => {
      const inside =
        (pickerRef.current?.contains(event.target as Node) ?? false) ||
        (popRef.current?.contains(event.target as Node) ?? false);
      if (!inside) {
        setIconPickerOpen(false);
      }
    };
    const closeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIconPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeKey);
    };
  }, [iconPickerOpen]);

  const openIconPicker = () => {
    const rect = pickerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const POPOVER_W = 320;
    const POPOVER_H = 132;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_W - 8));
    let top = rect.bottom + 6;
    if (top + POPOVER_H > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 6 - POPOVER_H);
    }
    setIconPos({ left, top });
    setIconPickerOpen(true);
  };

  const submit = () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    onCreate(clean, icon);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="settings-dialog add-material-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-material-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogHeader
          icon={<FilePlus2 size={21} />}
          title={t('addMaterial')}
          titleId="add-material-title"
          onClose={onClose}
          closeLabel={locale === 'zh' ? '关闭' : 'Close'}
        />
        <div className="add-material-body">
          <div className="add-material-row">
            <div className="add-material-icon-picker" ref={pickerRef}>
              <button
                type="button"
                className="add-material-icon-trigger"
                onClick={() => {
                  if (iconPickerOpen) setIconPickerOpen(false);
                  else openIconPicker();
                }}
                aria-label={t('chooseIcon')}
                aria-haspopup="grid"
                aria-expanded={iconPickerOpen}
              >
                {NOTE_ICONS[icon]}
              </button>
              {iconPickerOpen && iconPos && createPortal(
                <div
                  className="add-material-icon-popover"
                  ref={popRef}
                  style={{ left: iconPos.left, top: iconPos.top }}
                >
                  {NOTE_ICON_KEYS.map((key) => (
                    <button
                      type="button"
                      key={key}
                      className={icon === key ? 'active' : ''}
                      onClick={() => {
                        setIcon(key);
                        setIconPickerOpen(false);
                      }}
                      aria-pressed={icon === key}
                    >
                      {NOTE_ICONS[key]}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
            </div>
            <input
              autoFocus
              className="add-material-input"
              value={name}
              placeholder={locale === 'zh' ? '输入资料名称…' : 'Name…'}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
                if (event.key === 'Escape') onClose();
              }}
            />
          </div>
          <div className="capture-guide-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={submit}
              disabled={!name.trim() || busy}
            >
              {t('addMaterialCreate')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CaptureGuideDialog({
  locale,
  config,
  onClose,
  onSendToChat,
  mediaSkillEnabled,
  onOpenSkillSettings,
  t,
}: {
  locale: Locale;
  config: ModelConfig;
  onClose: () => void;
  onSendToChat: (input: string, transcriptionMode: TranscriptionMode) => Promise<void>;
  mediaSkillEnabled: boolean;
  onOpenSkillSettings: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [source, setSource] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [transcriptionMode, setTranscriptionMode] = useStoredState<TranscriptionMode>(
    CAPTURE_TRANSCRIPTION_MODE_KEY,
    'api',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const clean = (selectedFile ?? source).trim();
    if (!clean) {
      setError(t('captureInputRequired'));
      return;
    }
    if (
      isTauri
      && (
        !config.apiKey.trim()
        || !config.baseUrl.trim()
        || !config.model.trim()
      )
    ) {
      setError(t('captureNeedsModel'));
      return;
    }
    if (!mediaSkillEnabled) {
      setError(t('captureMediaSkillDisabled'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSendToChat(clean, transcriptionMode);
    } catch (requestError) {
      setError(
        `${t('capturePrepareFailed')}: ${String(requestError).replace(/^Error:\s*/i, '')}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop capture-backdrop" onMouseDown={onClose}>
      <section
        className="capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogHeader
          icon={<Bot size={21} />}
          title={t('captureTitle')}
          titleId="capture-title"
          onClose={onClose}
          closeLabel={locale === 'zh' ? '关闭' : 'Close'}
          tone="blue"
        />

        <div className="capture-guide">
          <label className="capture-field">
            <span>{t('captureInputLabel')}</span>
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={t('captureInputPlaceholder')}
              maxLength={180000}
              autoFocus
            />
          </label>
          <fieldset className="capture-transcription-choice">
            <span className="capture-transcription-hint">{t('captureTranscriptionHint')}</span>
            <span className="capture-transcription-options">
              <span className="capture-transcription-prefix">{t('captureTranscriptionPrefix')}</span>
              <label className={transcriptionMode === 'api' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="capture-transcription-mode"
                  value="api"
                  checked={transcriptionMode === 'api'}
                  onChange={() => setTranscriptionMode('api')}
                />
                <span>{t('captureTranscriptionApi')}</span>
              </label>
              <label className={transcriptionMode === 'local' ? 'selected' : ''}>
                <input
                  type="radio"
                  name="capture-transcription-mode"
                  value="local"
                  checked={transcriptionMode === 'local'}
                  onChange={() => setTranscriptionMode('local')}
                />
                <span>{t('captureTranscriptionLocal')}</span>
              </label>
            </span>
          </fieldset>

          {error && (
            <div className="capture-error" role="alert">
              <p>{error}</p>
              {!mediaSkillEnabled && (
                <button type="button" className="capture-error-action" onClick={onOpenSkillSettings}>
                  {t('captureOpenSkillSettings')}
                </button>
              )}
            </div>
          )}

          <div className="capture-guide-actions">
            {!selectedFile && (
              <button
                type="button"
                className="capture-file-button"
                onClick={async () => {
                  const picked = await chooseImportFile();
                  if (!picked) return;
                  setSelectedFile(picked);
                  setError('');
                }}
                disabled={busy}
              >
                <FileUp size={16} />
                {t('captureChooseFile')}
              </button>
            )}
            {selectedFile && (
              <span className="capture-file-pill">
                <span className="capture-file-pill-name">
                  {selectedFile.split(/[\\/]/).pop()}
                </span>
                <button
                  type="button"
                  className="capture-file-pill-clear"
                  onClick={() => setSelectedFile(null)}
                  disabled={busy}
                  aria-label="Remove file"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <button
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              {t('notNow')}
            </button>
            <button
              className="primary-button"
              onClick={send}
              disabled={busy || (!source.trim() && !selectedFile)}
            >
              {busy ? (
                <LoaderCircle className="spinning" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {busy ? t('capturePreparing') : t('capturePrepare')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;

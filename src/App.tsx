import {
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Activity,
  Dumbbell,
  FolderOpen,
  Github,
  Globe2,
  History,
  House,
  Layers3,
  Library,
  LoaderCircle,
  MessageCircleMore,
  Minus,
  Monitor,
  Moon,
  NotebookPen,
  Pill,
  Plus,
  Download,
  ArrowUp,
  Pencil,
  FileText,
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
  Square,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Utensils,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
  X,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import {
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
import packageMetadata from '../package.json';
import {
  checkForUpdate,
  chooseKnowledgeFolder,
  downloadAndInstallUpdate,
  isTauri,
  loadModelConfig,
  loadLibrary,
  moveTierItem,
  onSelfUpdateProgress,
  openExternalUrl,
  prepareCapture,
  persistModelConfig,
  readNote,
  saveCapture,
  sendAgentMessage,
  listenAgentEvents,
  resetAgent,
  abortAgent,
  listConversations,
  loadConversation,
  saveConversationUi,
  createConversation,
  deleteConversation,
  confirmMemorySuggestion,
  deleteNote,
  openNote,
  setNoteTier,
  listDirectory,
  createFolder,
  createNote,
  renameEntry,
  deleteEntry,
  pasteEntry,
  revealInFolder,
  type DirectoryEntry,
} from './api';
import {
  AGENT_CONTEXT_MAX_BYTES,
  estimateContextBytes,
} from './chat/contextUsage';
import { fallbackLibrary, fallbackMarkdown } from './data';
import { translate, type TranslationKey } from './i18n';
import type {
  AgentEvent,
  ChatMessage,
  CaptureDraft,
  ConversationSummary,
  LibrarySnapshot,
  Locale,
  LlmUsage,
  MemorySuggestion,
  ModelConfig,
  ModelProvider,
  ModelSettings,
  Person,
  ProviderConfig,
  Story,
  Supplement,
  View,
} from './types';
import {
  createEmptyModelSettings,
  getActiveModelConfig,
  normalizeModelSettings,
} from './modelSettings';

const APP_VERSION = packageMetadata.version;
const PRODUCT_WEBSITE = 'https://tiernote.life/';
const FEEDBACK_URL = 'https://github.com/edison7009/TierNote/issues';
const CONVERSATION_USAGE_KEY = 'tiernote:conversation-usage:v1';

type ConversationUsage = LlmUsage & { requestCount: number };

const EMPTY_USAGE: ConversationUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  requestCount: 0,
};

function loadConversationUsage(): Record<string, ConversationUsage> {
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CONVERSATION_USAGE_KEY) || '{}');
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

function estimateDeepSeekCost(
  usage: LlmUsage,
  config: ModelConfig,
  currency: 'CNY' | 'USD',
): number | null {
  const identity = `${config.baseUrl} ${config.model}`.toLowerCase();
  if (!identity.includes('deepseek')) return null;

  // Official regional prices per million tokens (snapshot: 2026-08-05).
  // Unknown providers deliberately show no estimate.
  const pro = /v4[-_. ]?pro/.test(identity);
  const prices = currency === 'CNY'
    ? pro
      ? { cacheHit: 0.025, cacheMiss: 3, output: 6 }
      : { cacheHit: 0.02, cacheMiss: 1, output: 2 }
    : pro
      ? { cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 }
      : { cacheHit: 0.0028, cacheMiss: 0.14, output: 0.28 };
  return (
    usage.cacheHitTokens * prices.cacheHit
    + usage.cacheMissTokens * prices.cacheMiss
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

const providerOptions: Record<
  ModelProvider,
  {
    label: Record<Locale, string>;
    baseUrlPlaceholder: string;
    modelPlaceholder: string;
    apiKeyPlaceholder: string;
  }
> = {
  openai: {
    label: { zh: 'OpenAI 协议', en: 'OpenAI Protocol' },
    baseUrlPlaceholder: 'https://api.deepseek.com',
    modelPlaceholder: 'deepseek-v4-flash',
    apiKeyPlaceholder: 'sk-…',
  },
  anthropic: {
    label: { zh: 'Anthropic 协议', en: 'Anthropic Protocol' },
    baseUrlPlaceholder: 'https://api.deepseek.com/anthropic',
    modelPlaceholder: 'deepseek-v4-flash',
    apiKeyPlaceholder: 'sk-ant-…',
  },
};

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
  items: Supplement[],
  itemId: string,
  targetTier: TierId,
  targetIndex: number,
): Supplement[] {
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
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const update = (value: T) => {
    setState(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private browsing and full storage should not stop the app.
    }
  };
  return [state, update];
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

function getLinks(markdown: string): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    if (!links.some((link) => link.url === match[2])) {
      links.push({ label: match[1], url: match[2] });
    }
  }
  return links.slice(0, 8);
}

type InternalNoteKind = 'supplement' | 'person' | 'story' | 'file';
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
type SettingsSectionId = 'model' | 'appearance';
type ResizeSide = 'left' | 'right';

interface PaneSizes {
  left: number;
  right: number;
}

const defaultPaneSizes: PaneSizes = { left: 248, right: 326 };

interface InternalNoteTarget {
  kind: InternalNoteKind;
  id: string;
  label: string;
}

interface FavoriteReference {
  kind: InternalNoteKind;
  id: string;
  addedAt: number;
}

interface FavoriteListItem {
  target: Omit<InternalNoteTarget, 'label'>;
  title: string;
  detail: string;
}

interface NavigationLocation {
  view: View;
  supplementId?: string;
  personId?: string;
  storyId?: string;
  filePath?: string;
}

const FAVORITES_SEED_FLAG = 'tiernote:favorites-seeded:v2';
const DEFAULT_FAVORITES: FavoriteReference[] = [];

type HealthLogField = 'exercise' | 'diet' | 'body';

interface HealthDayEntry {
  exercise?: string;
  diet?: string;
  body?: string;
}

type HealthLog = Record<string, HealthDayEntry>;

const HEALTH_LOG_KEY = 'tiernote:health-log:v1';

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

function formatConversationTime(timestamp: number, locale: Locale): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function entryHasContent(entry: HealthDayEntry | undefined): boolean {
  return Boolean(entry && (entry.exercise || entry.diet || entry.body));
}

function getPlanSections(locale: Locale): Array<{
  id: PlanSection;
  title: string;
  description: string;
  icon: ReactNode;
  accent: string;
}> {
  return [
    {
      id: 'supplements',
      title: locale === 'zh' ? '我的简历' : 'My resume',
      description:
        locale === 'zh'
          ? '个人简介、经历与当前状态'
          : 'Your background, experience, and current context',
      icon: <UserRound size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'exercise',
      title: locale === 'zh' ? '我的目标' : 'My goals',
      description:
        locale === 'zh'
          ? '正在推进的事，以及想得到的结果'
          : 'What you are working toward and why',
      icon: <Target size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'experience',
      title: locale === 'zh' ? '我的经验' : 'My experience',
      description:
        locale === 'zh'
          ? '试过什么、结果如何，以及什么真的有效'
          : 'What you have tried, what worked, and what actually helps',
      icon: <Lightbulb size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'lessons',
      title: locale === 'zh' ? '我的教训' : 'My lessons',
      description:
        locale === 'zh'
          ? '避开什么、什么不行，以及现实边界'
          : 'What to avoid and the constraints you have',
      icon: <ShieldAlert size={17} />,
      accent: '#e5e5e7',
    },
    {
      id: 'sleep',
      title: locale === 'zh' ? '重要记录' : 'Key records',
      description:
        locale === 'zh'
          ? '简历、项目、经历与值得回看的资料'
          : 'Resumes, projects, experiences, and useful reference',
      icon: <Archive size={17} />,
      accent: '#e5e5e7',
    },
  ];
}

function parseInternalNoteLink(href?: string): Omit<InternalNoteTarget, 'label'> | null {
  if (!href) return null;
  // Existing #/kind/id navigation links.
  const nav = href.match(/^#\/(supplement|person|story)\/([^/?#]+)$/);
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
    left.supplementId === right.supplementId &&
    left.personId === right.personId &&
    left.storyId === right.storyId
  );
}

type ToastState = {
  message: string;
  kind: 'status' | 'favorite-added' | 'favorite-removed';
};

function App() {
  const [locale, setLocale] = useStoredState<Locale>('tiernote:locale', 'zh');
  const [themeMode, setThemeMode] = useStoredState<ThemeMode>(
    'tiernote:theme',
    'system',
  );
  const [currencyMode, setCurrencyMode] = useStoredState<CurrencyMode>(
    'tiernote:currency',
    'auto',
  );
  const [paneSizes, setPaneSizes] = useStoredState<PaneSizes>(
    'tiernote:pane-sizes',
    defaultPaneSizes,
  );
  const [favorites, setFavorites] = useStoredState<FavoriteReference[]>(
    'tiernote:favorites',
    [],
  );
  const [knowledgeRoot, setKnowledgeRoot] = useStoredState(
    'tiernote:knowledge-root:v2',
    '',
  );
  const isLegacyDefaultRoot = (root: string) =>
    root.replace(/\\/g, '/').toLowerCase().endsWith('tiernote/library');
  const normalizedKnowledgeRoot =
    knowledgeRoot && !isLegacyDefaultRoot(knowledgeRoot) ? knowledgeRoot : '';
  const [modelSettings, setModelSettings] = useState<ModelSettings>(createEmptyModelSettings);
  const modelConfigSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    loadModelConfig()
      .then((storedConfig) => {
        if (!alive) return;
        if (storedConfig) {
          setModelSettings(storedConfig);
          return;
        }

        const legacyConfig = window.localStorage.getItem('tiernote:model');
        if (!legacyConfig) return;
        const migrated = normalizeModelSettings(JSON.parse(legacyConfig));
        setModelSettings(migrated);
        void persistModelConfig(migrated);
      })
      .catch((error) => {
        console.error('Could not load the saved model config.', error);
      });
    return () => {
      alive = false;
    };
  }, []);

  const [library, setLibrary] = useState<LibrarySnapshot>(fallbackLibrary);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [view, setView] = useState<View>('home');
  const [selectedSupplement, setSelectedSupplement] = useState<Supplement | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [activePlanSection, setActivePlanSection] = useState<PlanSection>('supplements');
  const [fileNotePath, setFileNotePath] = useState<string | null>(null);
  const [fileNoteSource, setFileNoteSource] = useState<'library' | 'myInfo'>('library');
  const libraryRootRef = useRef(library.root || normalizedKnowledgeRoot || '');
  const tierMoveQueueRef = useRef<Promise<void>>(Promise.resolve());
  libraryRootRef.current = library.root || normalizedKnowledgeRoot || '';
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
    if (view === 'supplement' && selectedSupplement) {
      return locale === 'zh' ? selectedSupplement.nameZh : selectedSupplement.nameEn;
    }
    if (view === 'person' && selectedPerson) return selectedPerson.name;
    if (view === 'story' && selectedStory) {
      return locale === 'zh' ? selectedStory.title : selectedStory.titleEn || selectedStory.title;
    }
    return undefined;
  }, [view, fileNoteTitle, selectedSupplement, selectedPerson, selectedStory, locale]);
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const fileNoteTier = useMemo(
    () => (view === 'file' ? extractFrontmatterTier(noteMarkdown) : undefined),
    [view, noteMarkdown],
  );
  const [noteLoading, setNoteLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureGuideOpen, setCaptureGuideOpen] = useState(false);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const conversationSaveSnapshotRef = useRef<{ id: string; json: string } | null>(null);
  const conversationSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [contextBytes, setContextBytes] = useState(0);
  const [usageByConversation, setUsageByConversation] = useState<Record<string, ConversationUsage>>(
    loadConversationUsage,
  );
  const [chatBusy, setChatBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [resizingPane, setResizingPane] = useState<ResizeSide | null>(null);
  const chatComposerRef = useRef<HTMLTextAreaElement>(null);
  const navigationHistoryRef = useRef<NavigationLocation[]>([]);

  useEffect(() => {
    let seeded = false;
    try {
      seeded = window.localStorage.getItem(FAVORITES_SEED_FLAG) === '1';
    } catch {
      seeded = false;
    }
    if (!seeded) {
      if (favorites.length === 0) {
        setFavorites(DEFAULT_FAVORITES);
      }
      try {
        window.localStorage.setItem(FAVORITES_SEED_FLAG, '1');
      } catch {
        // ignore unavailable storage
      }
    }
    // Seed the default favorite once on first launch; never overwrite later edits.
  }, []);

  const t = (key: TranslationKey) => translate(locale, key);
  const modelConfig = getActiveModelConfig(modelSettings);
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
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const resizePane = (side: ResizeSide, requestedSize: number) => {
    const viewportWidth = window.innerWidth;
    const visibleRightWidth = viewportWidth <= 1120 ? 0 : paneSizes.right;
    const maximum =
      side === 'left'
        ? Math.max(210, Math.min(380, viewportWidth - visibleRightWidth - 560))
        : Math.max(270, Math.min(460, viewportWidth - paneSizes.left - 560));
    const minimum = side === 'left' ? 210 : 270;
    const nextSize = Math.round(Math.min(maximum, Math.max(minimum, requestedSize)));
    setPaneSizes({ ...paneSizes, [side]: nextSize });
  };

  const getCurrentLocation = (): NavigationLocation => ({
    view,
    supplementId: selectedSupplement?.id,
    personId: selectedPerson?.id,
    storyId: selectedStory?.id,
  });

  const rememberCurrentLocation = (nextLocation: NavigationLocation) => {
    const currentLocation = getCurrentLocation();
    if (!locationsMatch(currentLocation, nextLocation)) {
      navigationHistoryRef.current.push(currentLocation);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoadingLibrary(true);
    loadLibrary(normalizedKnowledgeRoot || undefined, locale)
      .then((snapshot) => {
        if (!alive) return;
        setLibrary(snapshot);
        if (!normalizedKnowledgeRoot && snapshot.root) setKnowledgeRoot(snapshot.root);
      })
      .catch(() => {
        if (alive) setLibrary(fallbackLibrary);
      })
      .finally(() => {
        if (alive) setLoadingLibrary(false);
      });
    return () => {
      alive = false;
    };
  }, [normalizedKnowledgeRoot, locale]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openSupplement = async (supplement: Supplement, remember = true) => {
    if (remember) {
      rememberCurrentLocation({ view: 'supplement', supplementId: supplement.id });
    }
    setSelectedSupplement(supplement);
    setSelectedPerson(null);
    setSelectedStory(null);
    setView('supplement');
    setNoteLoading(true);
    try {
      const markdown = supplement.filePath
        ? await readNote(library.root, supplement.filePath)
        : `# ${supplement.nameZh}\n\n${supplement.summary}`;
      setNoteMarkdown(markdown);
    } catch {
      setNoteMarkdown(
        fallbackMarkdown[supplement.filePath || ''] ||
          `# ${supplement.nameZh}\n\n${supplement.summary}`,
      );
    } finally {
      setNoteLoading(false);
    }
  };

  const openPerson = async (person: Person, remember = true) => {
    if (remember) {
      rememberCurrentLocation({ view: 'person', personId: person.id });
    }
    setSelectedPerson(person);
    setSelectedSupplement(null);
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
    setSelectedSupplement(null);
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
    if (view === 'supplement' && selectedSupplement) {
      const localized = library.supplements.find((item) => item.id === selectedSupplement.id);
      if (localized && localized.filePath !== selectedSupplement.filePath) {
        void openSupplement(localized, false);
      }
    } else if (view === 'person' && selectedPerson) {
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
    if (nextView !== 'supplement') setSelectedSupplement(null);
    if (nextView !== 'person') setSelectedPerson(null);
    if (nextView !== 'story') setSelectedStory(null);
    if (nextView !== 'file') {
      setFileNotePath(null);
      setFileNoteSource('library');
    }
    if (!['supplement', 'person', 'story', 'file'].includes(nextView)) setNoteMarkdown('');
  };

  const restoreLocation = (location: NavigationLocation) => {
    if (location.view === 'supplement' && location.supplementId) {
      const supplement = library.supplements.find((item) => item.id === location.supplementId);
      if (supplement) {
        void openSupplement(supplement, false);
        return;
      }
    }
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
    const previous = navigationHistoryRef.current.pop();
    restoreLocation(previous || { view: 'home' });
  };

  const noteRelativePath = useMemo(() => {
    if (view === 'file') return fileNotePath;
    if (view === 'supplement') return selectedSupplement?.filePath || null;
    if (view === 'person') return selectedPerson?.filePath || null;
    if (view === 'story') return selectedStory?.filePath || null;
    return null;
  }, [view, fileNotePath, selectedSupplement, selectedPerson, selectedStory]);

  const currentNoteTarget = useMemo<Omit<InternalNoteTarget, 'label'> | null>(() => {
    if (view === 'supplement' && selectedSupplement) {
      return { kind: 'supplement', id: selectedSupplement.id };
    }
    if (view === 'person' && selectedPerson) {
      return { kind: 'person', id: selectedPerson.id };
    }
    if (view === 'story' && selectedStory) {
      return { kind: 'story', id: selectedStory.id };
    }
    if (view === 'file' && fileNotePath) {
      return { kind: 'file', id: fileNotePath };
    }
    return null;
  }, [view, selectedSupplement, selectedPerson, selectedStory, fileNotePath]);

  const handleEditNote = async (relativePath: string) => {
    if (!isTauri) {
      setToast({ message: t('desktopOnlyAction'), kind: 'status' });
      return;
    }
    const source = view === 'file' ? fileNoteSourceRef.current : 'library';
    const root =
      source === 'myInfo' ? library.myInfoRoot : libraryRootRef.current || library.root;
    try {
      await openNote(root, relativePath);
    } catch (error) {
      setToast({
        message: `${t('openNoteFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
    }
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
    const target = currentNoteTarget;
    try {
      await deleteNote(root, relativePath);
      if (target) {
        setFavorites(
          favorites.filter(
            (favorite) => favorite.kind !== target.kind || favorite.id !== target.id,
          ),
        );
      }
      setToast({ message: t('noteDeleted'), kind: 'status' });
      goBack();
      setLibrary(await loadLibrary(root || undefined, locale));
    } catch (error) {
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
    try {
      await setNoteTier(root, relativePath, tier);
      if (view === 'file' && fileNotePath === relativePath) {
        setNoteMarkdown(await readNote(root, relativePath));
      } else {
        if (selectedSupplement?.filePath === relativePath) {
          setSelectedSupplement({ ...selectedSupplement, tier });
        } else if (selectedPerson?.filePath === relativePath) {
          setSelectedPerson({ ...selectedPerson, tier });
        } else if (selectedStory?.filePath === relativePath) {
          setSelectedStory({ ...selectedStory, tier });
        }
        setLibrary((current) => ({
          ...current,
          supplements: current.supplements.map((item) =>
            item.filePath === relativePath ? { ...item, tier } : item,
          ),
          people: current.people.map((item) =>
            item.filePath === relativePath ? { ...item, tier } : item,
          ),
          stories: current.stories.map((item) =>
            item.filePath === relativePath ? { ...item, tier } : item,
          ),
        }));
      }
      setToast({ message: t('tierUpdated'), kind: 'status' });
    } catch (error) {
      setToast({
        message: `${t('setTier')}${locale === 'zh' ? '失败：' : ' failed: '}${String(error).replace(/^Error:\s*/i, '')}`,
        kind: 'status',
      });
    }
  };

  const handleLibraryChanged = () => {
    const root = libraryRootRef.current || library.root;
    void loadLibrary(root || undefined, locale)
      .then((snapshot) => setLibrary(snapshot))
      .catch(() => {});
    if (view === 'file' && fileNotePath) {
      const source = fileNoteSourceRef.current;
      const noteRoot = source === 'myInfo' ? library.myInfoRoot : root;
      readNote(noteRoot, fileNotePath)
        .then((raw) => setNoteMarkdown(raw))
        .catch(() => {
          navigate('home');
          setToast({ message: t('fileGone'), kind: 'status' });
        });
    }
  };

  const handleSwitchRoot = async () => {
    if (!isTauri) return;
    const selected = await chooseKnowledgeFolder();
    if (!selected) return;
    setKnowledgeRoot(selected);
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

  const openFileNote = (filePath: string, remember = true) => {
    if (remember) rememberCurrentLocation({ view: 'file', filePath });
    setView('file');
    setFileNotePath(filePath);
    const source: 'library' | 'myInfo' = filePath.startsWith('plans/')
      ? 'myInfo'
      : 'library';
    setFileNoteSource(source);
    setSelectedSupplement(null);
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
      supplements: reorderTierItems(current.supplements, itemId, targetTier, targetIndex),
    }));

    if (!isTauri) return;
    const root = libraryRootRef.current;
    tierMoveQueueRef.current = tierMoveQueueRef.current
      .then(async () => {
        await moveTierItem(root, itemId, targetTier, targetIndex);
        const moved = library.supplements.find((item) => item.id === itemId);
        if (moved?.filePath) {
          await setNoteTier(root, moved.filePath, targetTier);
        }
        const snapshot = await loadLibrary(root || undefined, locale);
        setLibrary(snapshot);
      })
      .catch(async (error) => {
        try {
          setLibrary(await loadLibrary(root || undefined, locale));
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
    setActivePlanSection(section);
    if (section === 'log') {
      navigate('log');
      return;
    }
    openFileNote(getPlanSectionFile(section, locale));
  };

  const openInternalNote = (target: Omit<InternalNoteTarget, 'label'>) => {
    if (target.kind === 'supplement') {
      const supplement = library.supplements.find((item) => item.id === target.id);
      if (supplement) {
        void openSupplement(supplement);
        return;
      }
    }
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
      const filePath = target.id;
      setView('supplement');
      setSelectedSupplement(null);
      setSelectedPerson(null);
      setSelectedStory(null);
      setNoteLoading(true);
      readNote(library.root, filePath)
        .then((raw) => setNoteMarkdown(raw))
        .catch(() =>
          setNoteMarkdown(
            locale === 'zh'
              ? `# 无法打开\n\n找不到文件 \`${filePath}\`。`
              : `# Cannot open\n\nFile \`${filePath}\` not found.`,
          ),
        )
        .finally(() => setNoteLoading(false));
      return;
    }
    setToast({
      message: locale === 'zh' ? '没有找到对应的本地文章' : 'The linked local note was not found',
      kind: 'status',
    });
  };

  const isFavorite = (target: Omit<InternalNoteTarget, 'label'>) =>
    favorites.some((favorite) => favorite.kind === target.kind && favorite.id === target.id);

  const toggleFavorite = (target: Omit<InternalNoteTarget, 'label'>) => {
    if (isFavorite(target)) {
      setFavorites(
        favorites.filter(
          (favorite) => favorite.kind !== target.kind || favorite.id !== target.id,
        ),
      );
      setToast({ message: t('favoriteRemoved'), kind: 'favorite-removed' });
      return;
    }

    setFavorites([{ ...target, addedAt: Date.now() }, ...favorites]);
    setToast({ message: t('favoriteAdded'), kind: 'favorite-added' });
  };

  const finishCapture = async (path: string) => {
    setCaptureGuideOpen(false);
    try {
      const snapshot = await loadLibrary(
        library.root || normalizedKnowledgeRoot || undefined,
        locale,
      );
      setLibrary(snapshot);
    } catch {
      // The note is already saved; a later library refresh can recover the updated count.
    }
    setToast({
      message:
        locale === 'zh'
          ? `已保存到本地收件箱：${path}`
          : `Saved to the local inbox: ${path}`,
      kind: 'status',
    });
  };

  const ensureConversation = async () => {
    if (activeConversationId) return activeConversationId;
    const summary = await createConversation(locale === 'zh' ? '新对话' : 'New conversation');
    setConversationSummaries((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
    conversationSaveSnapshotRef.current = { id: summary.id, json: '[]' };
    setActiveConversationId(summary.id);
    return summary.id;
  };

  const refreshConversationSummaries = async () => {
    try {
      setConversationSummaries(await listConversations());
    } catch {
      // Conversation history can recover on the next successful save/load.
    }
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
      window.localStorage.setItem(CONVERSATION_USAGE_KEY, JSON.stringify(usageByConversation));
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

  const handleSelectConversation = async (id: string) => {
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
      try {
        const snapshot = await loadLibrary(root || undefined, locale);
        setLibrary(snapshot);
      } catch {
        // Best-effort refresh after AI tools modify the library.
      }
      const openPath = fileNotePathRef.current;
      if (openPath && root) {
        try {
          setNoteMarkdown(await readNote(root, openPath));
        } catch {
          // Keep the current content if the file cannot be read again.
        }
      }
    };
    listenAgentEvents((event: AgentEvent) => {
      if (cancelled) return;
      if (event.conversationId && activeConversationId && event.conversationId !== activeConversationId) {
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
          const conversationId = event.conversationId || activeConversationId;
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
                requestCount: previous.requestCount,
              },
            };
          });
          break;
        }
        case 'request_started': {
          const conversationId = event.conversationId || activeConversationId;
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
  }, [activeConversationId, locale]);

  const handleSend = async (question: string) => {
    const clean = question.trim();
    if (!clean || chatBusy) return;

    const conversationId = await ensureConversation();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: clean,
      createdAt: Date.now(),
    };
    const priorMessages = chatMessages;
    setChatMessages((current) => [...current, userMessage]);
    if (view !== 'ai') setView('ai');
    setChatBusy(true);

    if (isTauri && !modelConfig.apiKey) {
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
      await sendAgentMessage({
        conversationId,
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
        provider: modelConfig.provider,
        economyMode: modelSettings.economyMode,
        message: clean,
        locale,
        knowledgeRoot: library.root,
        contextPaths: [
          selectedSupplement?.filePath,
          selectedPerson?.filePath,
          selectedStory?.filePath,
          view === 'file' ? fileNotePath : undefined,
        ].filter(Boolean) as string[],
        currentPage: currentPageTitle,
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
    setModelSettings(config);
    modelConfigSaveQueueRef.current = modelConfigSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistModelConfig(config))
      .catch((error) => {
        console.error('Could not save the model config.', error);
      });
  };

  const references = useMemo(() => getLinks(noteMarkdown), [noteMarkdown]);
  const internalNoteTargets = useMemo<InternalNoteTarget[]>(() => {
    const targets: InternalNoteTarget[] = [];
    const add = (kind: InternalNoteKind, id: string, labels: Array<string | undefined>) => {
      for (const label of labels) {
        const clean = label?.trim();
        if (clean) targets.push({ kind, id, label: clean });
      }
    };

    for (const supplement of library.supplements) {
      add('supplement', supplement.id, [supplement.nameZh, supplement.nameEn]);
    }
    for (const person of library.people) {
      add('person', person.id, [person.name, person.nameZh]);
    }
    for (const story of library.stories) {
      add('story', story.id, [story.title, story.titleEn]);
    }
    return targets;
  }, [library]);

  return (
    <div
      className={`app-shell ${isMacOSPlatform ? 'platform-macos-shell' : 'platform-custom-shell'} ${resizingPane ? `panel-resizing panel-resizing-${resizingPane}` : ''}`}
      style={
        {
          '--sidebar-width': `${paneSizes.left}px`,
          '--right-rail-width': `${paneSizes.right}px`,
        } as React.CSSProperties
      }
    >
      <AppTitlebar locale={locale} onSettings={() => setSettingsOpen(true)} />
      <Sidebar
        locale={locale}
        library={library}
        view={view}
        libraryRoot={library.root || normalizedKnowledgeRoot}
        activeFilePath={view === 'file' ? fileNotePath : null}
        onNavigate={navigate}
        onNewChat={handleNewChat}
        chatBusy={chatBusy}
        onOpenFile={openFileNote}
        onLibraryChanged={handleLibraryChanged}
        onSwitchRoot={handleSwitchRoot}
        refreshToken={treeRefresh}
        notify={(message) => setToast({ message, kind: 'status' })}
        t={t}
      />
      <PaneResizer
        side="left"
        size={paneSizes.left}
        locale={locale}
        onResize={(size) => resizePane('left', size)}
        onReset={() => setPaneSizes({ ...paneSizes, left: defaultPaneSizes.left })}
        onResizing={setResizingPane}
      />

      <main className="main-pane">
        <div className="content-scroll">
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
                  onCapture={() => setCaptureGuideOpen(true)}
                  onOrganize={() => navigate('ai')}
                  onPlan={() => navigate('plan')}
                  onSupplement={openSupplement}
                  onMoveSupplement={handleTierMove}
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
              {view === 'supplement' && selectedSupplement && (
                <NoteView
                  title={locale === 'zh' ? selectedSupplement.nameZh : selectedSupplement.nameEn}
                  tier={selectedSupplement.tier}
                  markdown={noteMarkdown}
                  loading={noteLoading}
                  locale={locale}
                  currentTarget={{ kind: 'supplement', id: selectedSupplement.id }}
                  internalTargets={internalNoteTargets}
                  onInternalNavigate={openInternalNote}
                  favorite={isFavorite({ kind: 'supplement', id: selectedSupplement.id })}
                  onToggleFavorite={() =>
                    toggleFavorite({ kind: 'supplement', id: selectedSupplement.id })
                  }
                  onBack={goBack}
                  notePath={noteRelativePath}
                  onEditNote={handleEditNote}
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) =>
                    selectedSupplement.filePath &&
                    handleSetTier(selectedSupplement.filePath, nextTier)
                  }
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
                  favorite={isFavorite({ kind: 'person', id: selectedPerson.id })}
                  onToggleFavorite={() =>
                    toggleFavorite({ kind: 'person', id: selectedPerson.id })
                  }
                  onBack={goBack}
                  notePath={noteRelativePath}
                  onEditNote={handleEditNote}
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) =>
                    selectedPerson.filePath && handleSetTier(selectedPerson.filePath, nextTier)
                  }
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
                  favorite={isFavorite({ kind: 'story', id: selectedStory.id })}
                  onToggleFavorite={() =>
                    toggleFavorite({ kind: 'story', id: selectedStory.id })
                  }
                  onBack={goBack}
                  notePath={noteRelativePath}
                  onEditNote={handleEditNote}
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) =>
                    selectedStory.filePath && handleSetTier(selectedStory.filePath, nextTier)
                  }
                />
              )}
              {view === 'plan' && (
                <PlanView
                  locale={locale}
                  activeSection={activePlanSection}
                  onSection={openPlanSection}
                  onBack={goBack}
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
                  favorite={isFavorite({ kind: 'file', id: fileNotePath })}
                  onToggleFavorite={() => toggleFavorite({ kind: 'file', id: fileNotePath })}
                  onBack={goBack}
                  notePath={noteRelativePath}
                  onEditNote={handleEditNote}
                  onDeleteNote={handleDeleteNote}
                  onSetTier={(nextTier) => handleSetTier(fileNotePath, nextTier)}
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
          currentPage={currentPageTitle}
          contextBytes={contextBytes}
          contextMaxBytes={AGENT_CONTEXT_MAX_BYTES}
          usage={usageByConversation[activeConversationId] || EMPTY_USAGE}
          modelConfig={modelConfig}
          currencyMode={currencyMode}
          locale={locale}
        />
      </main>

      <PaneResizer
        side="right"
        size={paneSizes.right}
        locale={locale}
        onResize={(size) => resizePane('right', size)}
        onReset={() => setPaneSizes({ ...paneSizes, right: defaultPaneSizes.right })}
        onResizing={setResizingPane}
      />

      <RightRail
        locale={locale}
        view={view}
        aiActive={view === 'ai'}
        conversations={conversationSummaries}
        activeConversationId={activeConversationId}
        chatBusy={chatBusy}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        supplement={selectedSupplement}
        person={selectedPerson}
        story={selectedStory}
        references={references}
        library={library}
        favorites={favorites}
        activePlanSection={activePlanSection}
        onFavoriteNavigate={openInternalNote}
        onPlanSection={openPlanSection}
        onResumeChat={() => navigate('ai')}
        onNewChat={handleNewChat}
        t={t}
      />

      {settingsOpen && (
        <SettingsDialog
          locale={locale}
          config={modelSettings}
          onChange={saveModelConfig}
          onLocale={setLocale}
          themeMode={themeMode}
          onThemeMode={setThemeMode}
          currencyMode={currencyMode}
          onCurrencyMode={setCurrencyMode}
          onClose={() => setSettingsOpen(false)}
          t={t}
        />
      )}

      {captureGuideOpen && (
        <CaptureGuideDialog
          locale={locale}
          config={modelConfig}
          economyMode={modelSettings.economyMode}
          knowledgeRoot={library.root || normalizedKnowledgeRoot}
          onClose={() => setCaptureGuideOpen(false)}
          onSaved={finishCapture}
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

      {toast && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === 'favorite-added' ? (
            <Star size={17} fill="currentColor" />
          ) : toast.kind === 'favorite-removed' ? (
            <Star size={17} />
          ) : (
            <Check size={17} />
          )}
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

function AppTitlebar({ locale, onSettings }: { locale: Locale; onSettings: () => void }) {
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
      <div className="titlebar-drag-area" data-tauri-drag-region />

      <div className="window-controls">
        <UpdateButton locale={locale} />
        <button
          type="button"
          className="titlebar-settings"
          aria-label={locale === 'zh' ? '打开设置' : 'Open settings'}
          onClick={onSettings}
        >
          <Settings size={14} strokeWidth={1.8} />
        </button>
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
      className={`titlebar-update ${installingUpdate ? 'installing' : ''}`}
      onClick={() => void handleUpdate()}
      aria-label={
        locale === 'zh'
          ? `更新至 Lucky Note ${availableVersion}`
          : `Update Lucky Note to ${availableVersion}`
      }
      title={locale === 'zh' ? `更新至 Lucky Note ${availableVersion}` : `Update Lucky Note to ${availableVersion}`}
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

// Module-level clipboard so cut/copy survives menu close/open cycles.
let fsClipboard: { action: 'copy' | 'cut'; source: string } | null = null;

function joinLibraryPath(root: string, relativePath: string): string {
  return `${root.replace(/[\\/]+$/, '')}/${relativePath}`;
}

function parentDirOf(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index > 0 ? relativePath.slice(0, index) : '';
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

interface TreeEditState {
  mode: 'rename' | 'create-folder' | 'create-note';
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
  onOpenFile,
  onLibraryChanged,
  onSwitchRoot,
  refreshToken,
  notify,
}: {
  root: string;
  locale: Locale;
  t: (key: TranslationKey) => string;
  activeFilePath: string | null;
  onOpenFile: (relativePath: string) => void;
  onLibraryChanged: () => void;
  onSwitchRoot: () => void;
  refreshToken: number;
  notify: (message: string) => void;
}) {
  const [entriesByDir, setEntriesByDir] = useState<Record<string, DirectoryEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [edit, setEdit] = useState<TreeEditState | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef(root);
  rootRef.current = root;

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
    setEntriesByDir({});
    setExpanded({});
    listDirectory(root, '')
      .then((entries) => setEntriesByDir({ '': entries }))
      .catch(() => {});
  }, [root, refreshToken]);

  useEffect(() => {
    if (edit) editRef.current?.select();
  }, [edit]);

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

  const startRename = (menu: CtxMenuState) => {
    closeMenu();
    setEdit({ mode: 'rename', path: menu.relativePath });
    setEditValue(
      menu.kind === 'file' ? menu.name.replace(/\.md$/i, '') : menu.name,
    );
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
      } else if (current.mode === 'create-note') {
        const created = await createNote(rootRef.current, current.path, value);
        refreshDir(current.path);
        onLibraryChanged();
        onOpenFile(created);
      } else {
        await renameEntry(rootRef.current, current.path, value);
        refreshDir(parentDirOf(current.path));
        onLibraryChanged();
      }
    } catch (error) {
      notify(`${t('operationFailed')}${locale === 'zh' ? '：' : ': '}${String(error).replace(/^Error:\s*/i, '')}`);
    }
  };

  const renderEditRow = (dirPath: string, depth: number) =>
    edit && edit.mode !== 'rename' && edit.path === dirPath ? (
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
    const renaming = edit?.mode === 'rename' && edit.path === entry.relativePath;
    return (
      <button
        type="button"
        key={entry.relativePath}
        className={`tree-child ${activeFilePath === entry.relativePath ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onOpenFile(entry.relativePath)}
        onContextMenu={(event) => openContextMenu(event, 'file', entry.relativePath, entry.name)}
      >
        {NOTE_ICONS[entry.icon || ''] || <FileText size={13} />}
        {renaming ? (
          <input
            ref={editRef}
            className="tree-rename-input"
            value={editValue}
            placeholder={t('renamePlaceholder')}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commitEdit();
              if (event.key === 'Escape') setEdit(null);
            }}
            onBlur={() => void commitEdit()}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span>{entry.name.replace(/\.md$/i, '')}</span>
        )}
      </button>
    );
  };

  const renderFolder = (entry: DirectoryEntry, depth: number) => {
    const isOpen = Boolean(expanded[entry.relativePath]);
    const renaming = edit?.mode === 'rename' && edit.path === entry.relativePath;
    return (
      <div key={entry.relativePath}>
        <div className="tree-folder-row" style={{ paddingLeft: 8 + depth * 14 }}>
          <button
            type="button"
            className={`tree-folder ${isOpen ? 'open' : ''}`}
            onClick={() => toggleDir(entry.relativePath)}
            onContextMenu={(event) => openContextMenu(event, 'folder', entry.relativePath, entry.name)}
          >
            <ChevronRight size={13} className={`tree-chevron ${isOpen ? 'expanded' : ''}`} />
            <FolderOpen size={15} />
            {renaming ? (
              <input
                ref={editRef}
                className="tree-rename-input"
                value={editValue}
                placeholder={t('renamePlaceholder')}
                onChange={(event) => setEditValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void commitEdit();
                  if (event.key === 'Escape') setEdit(null);
                }}
                onBlur={() => void commitEdit()}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span>{entry.name}</span>
            )}
          </button>
        </div>
        {isOpen && (
          <div className="tree-children">
            {renderEditRow(entry.relativePath, depth)}
            {(entriesByDir[entry.relativePath] || []).map((child) =>
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
    <div className="nav-tree-group library-tree">
      <div
        className="library-root-row"
        onContextMenu={(event) => openContextMenu(event, 'folder', '', t('treeRoot'))}
      >
        <span className="library-root-label">
          <FolderOpen size={17} />
          <span>{t('treeRoot')}</span>
        </span>
        <button
          type="button"
          className="library-switch-btn"
          onClick={onSwitchRoot}
          aria-label={t('menuSwitchRoot')}
        >
          <Folder size={15} />
        </button>
      </div>
      <div className="tree-children">
        {renderEditRow('', 0)}
        {(entriesByDir[''] || [])
          .filter((entry) => !entry.isDir || !HIDDEN_ROOT_FOLDERS.has(entry.name))
          .map((entry) =>
            entry.isDir ? renderFolder(entry, 0) : renderFile(entry, 0),
          )}
      </div>
      {ctxMenu && (
        <ContextMenu menu={ctxMenu} onClose={closeMenu} actions={ctxActions} t={t} />
      )}
    </div>
  );
}

interface SidebarProps {
  locale: Locale;
  library: LibrarySnapshot;
  view: View;
  libraryRoot: string;
  activeFilePath: string | null;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  chatBusy: boolean;
  onOpenFile: (relativePath: string) => void;
  onLibraryChanged: () => void;
  onSwitchRoot: () => void;
  refreshToken: number;
  notify: (message: string) => void;
  t: (key: TranslationKey) => string;
}

function Sidebar({
  locale,
  library,
  view,
  libraryRoot,
  activeFilePath,
  onNavigate,
  onNewChat,
  chatBusy,
  onOpenFile,
  onLibraryChanged,
  onSwitchRoot,
  refreshToken,
  notify,
  t,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <div className="brand">
          <button className="brand-main" onClick={() => onNavigate('home')}>
            <img src="/brand/logo-new.png" alt="" />
            <strong>{t('appName')}</strong>
          </button>
        </div>

        <nav className="primary-nav" aria-label="Primary">
          <SidebarButton
            icon={<House size={17} />}
            label={t('home')}
            active={view === 'home'}
            onClick={() => onNavigate('home')}
          />
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

          <div className="nav-divider" />

          <LibraryTree
            root={libraryRoot}
            locale={locale}
            t={t}
            activeFilePath={activeFilePath}
            onOpenFile={onOpenFile}
            onLibraryChanged={onLibraryChanged}
            onSwitchRoot={onSwitchRoot}
            refreshToken={refreshToken}
            notify={notify}
          />
        </nav>
      </div>
    </aside>
  );
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

function HomeView({
  locale,
  library,
  onCapture,
  onOrganize,
  onPlan,
  onSupplement,
  onMoveSupplement,
  t,
}: {
  locale: Locale;
  library: LibrarySnapshot;
  onCapture: () => void;
  onOrganize: () => void;
  onPlan: () => void;
  onSupplement: (supplement: Supplement) => void;
  onMoveSupplement: (itemId: string, targetTier: TierId, targetIndex: number) => void;
  t: (key: TranslationKey) => string;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const tiered = useMemo(() => {
    return TIER_IDS.map((tier) => ({
      tier,
      supplements: library.supplements.filter(
        (supplement) => supplement.tier === tier && supplement.id !== draggedId,
      ),
    }));
  }, [draggedId, library.supplements]);
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
    const moved = library.supplements.find((item) => item.id === itemId);
    if (!moved) {
      clearDragState();
      return;
    }

    onMoveSupplement(itemId, targetTier, targetIndex);
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
    const source = library.supplements.find((item) => item.id === itemId);
    if (!source) return;
    const sourceIndex = library.supplements
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

  return (
    <div className="home-view page">
      <section className="hero">
        <div className="hero-kicker">
          <Layers3 size={15} />
          WELCOME
        </div>
        <h1>{t(greetingKey)}</h1>
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
        <div className="section-heading">
          <div>
            <p>{t('evidenceMapSub')}</p>
          </div>
          <span className="section-stat">{library.supplements.length} items</span>
        </div>
        <div className="tier-map" ref={tierMapRef}>
          {tiered.map(({ tier, supplements }) => {
            const insertAt =
              dropTarget?.tier === tier
                ? Math.min(Math.max(dropTarget.index, 0), supplements.length)
                : -1;
            const cards: ReactNode[] = [];
            supplements.forEach((supplement, index) => {
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
                  data-tier-item={supplement.id}
                  key={supplement.id}
                  onClick={(event) => {
                    if (suppressTierClickRef.current) {
                      event.preventDefault();
                      return;
                    }
                    onSupplement(supplement);
                  }}
                  onPointerDown={(pointerEvent) => beginPointerDrag(pointerEvent, supplement.id)}
                >
                  <span>{locale === 'zh' ? supplement.nameZh : supplement.nameEn}</span>
                </button>,
              );
            });
            if (insertAt === supplements.length) {
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
                data-tier-count={supplements.length}
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
                  data-tier-count={supplements.length}
                  data-tier-row={tier}
                >
                  {cards.length ? cards : <span className="tier-empty">—</span>}
                </div>
              </div>
            );
          })}
        </div>
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

function NoteView({
  title,
  tier,
  markdown,
  loading,
  locale,
  currentTarget,
  internalTargets,
  onInternalNavigate,
  favorite,
  onToggleFavorite,
  onBack,
  notePath,
  onEditNote,
  onDeleteNote,
  onSetTier,
}: {
  title: string;
  tier?: string;
  markdown: string;
  loading: boolean;
  locale: Locale;
  currentTarget: Omit<InternalNoteTarget, 'label'>;
  internalTargets: InternalNoteTarget[];
  onInternalNavigate: (target: Omit<InternalNoteTarget, 'label'>) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  notePath: string | null;
  onEditNote: (relativePath: string) => void;
  onDeleteNote: (relativePath: string) => void;
  onSetTier?: (tier: string) => void;
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
        <div className="note-actions">
          <button
            type="button"
            className={`note-action ${favorite ? 'active' : ''}`}
            aria-label={translate(locale, favorite ? 'removeFavorite' : 'addFavorite')}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
            <span>{translate(locale, 'favorites')}</span>
          </button>
          <button
            type="button"
            className="note-action"
            aria-label={translate(locale, 'editNote')}
            disabled={!notePath}
            onClick={() => notePath && onEditNote(notePath)}
          >
            <Pencil size={14} />
            <span>{translate(locale, 'editNote')}</span>
          </button>
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
        </div>
      </div>
      {loading ? (
        <div className="loading-state compact">
          <LoaderCircle className="spin" size={22} />
        </div>
      ) : (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {renderedMarkdown}
          </ReactMarkdown>
        </div>
      )}
    </article>
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
  const renderedConversationRef = useRef('');
  const previousScrollHeightRef = useRef(0);
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

  return (
    <div className="page conversation-view">
      {messages.length === 0 && (
        <div className="chat-empty-state">
          <div className="chat-empty-heading">
            <img src="/brand/logo-new.png" alt="" />
            <strong className="chat-empty-wordmark">Lucky Note</strong>
          </div>
          <p className="chat-empty-features">
            {locale === 'zh'
              ? 'DeepSeek 缓存极致优化 + 高命中率记忆路由 + Library Graph 检索 + 短输出、少调用、自动压缩'
              : 'DeepSeek cache optimization + high-hit memory routing + Library Graph retrieval + shorter output, fewer calls, automatic compaction'}
          </p>
        </div>
      )}
      <div className="message-list">
        {messages.map((message) => {
          if (message.role === 'tool_call') {
            const toolLabels: Record<string, string> = {
              save_note: locale === 'zh' ? '保存笔记' : 'Save note',
              search_library: locale === 'zh' ? '搜索知识库' : 'Search library',
              read_note: locale === 'zh' ? '读取笔记' : 'Read note',
            };
            const label = toolLabels[message.toolName || ''] || message.toolName || 'tool';
            const statusIcon =
              message.toolStatus === 'running' ? (
                <LoaderCircle size={12} className="spin" />
              ) : message.toolStatus === 'failed' ? (
                <X size={12} />
              ) : (
                <Check size={12} />
              );
            return (
              <div className="tool-call-card" key={message.id}>
                <button
                  type="button"
                  className="tool-call-header"
                  onClick={(e) => {
                    const card = (e.currentTarget as HTMLElement).closest('.tool-call-card');
                    card?.classList.toggle('open');
                  }}
                >
                  <Wrench size={13} />
                  <span className="tool-call-label">{label}</span>
                  <span className="tool-call-status">{statusIcon}</span>
                </button>
                <div className="tool-call-body">
                  {message.toolArgs && (
                    <pre className="tool-call-args">{message.toolArgs}</pre>
                  )}
                  {message.toolOutput && (
                    <pre className={`tool-call-output ${message.toolStatus === 'failed' ? 'failed' : ''}`}>
                      {message.toolOutput.length > 2000
                        ? message.toolOutput.slice(0, 2000) + '\n…'
                        : message.toolOutput}
                    </pre>
                  )}
                </div>
              </div>
            );
          }
          if (message.role === 'memory_suggestion' && message.memorySuggestion) {
            const saved = message.memoryStatus === 'saved';
            const dismissed = message.memoryStatus === 'dismissed';
            return (
              <div
                className={`memory-suggestion-card ${saved ? 'saved' : ''} ${dismissed ? 'dismissed' : ''}`}
                key={message.id}
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
                        {locale === 'zh' ? '保存到我的资料' : 'Save to My information'}
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
            <div className={`message ${message.role}`} key={message.id}>
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="message assistant">
            <div className="message-content thinking-line">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
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
  activeSection,
  onSection,
  onBack,
  onAdd,
  t,
}: {
  locale: Locale;
  activeSection: PlanSection;
  onSection: (section: PlanSection) => void;
  onBack: () => void;
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
        {sections.map((section) => (
          <button
            className={section.id === activeSection ? 'active' : ''}
            onClick={() => onSection(section.id)}
            key={section.id}
          >
            <span className="plan-section-icon" style={{ background: section.accent }}>
              {section.icon}
            </span>
            <span>
              <strong>{section.title}</strong>
              <small>{section.description}</small>
            </span>
          </button>
        ))}
        <button onClick={onAdd} key="add">
          <span className="plan-section-icon" style={{ background: '#e5e5e7' }}>
            <FilePlus2 size={17} />
          </span>
          <span>
            <strong>{t('addMaterial')}</strong>
            <small>{t('addMaterialCreateSub')}</small>
          </span>
        </button>
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
  contextBytes,
  contextMaxBytes,
  usage,
  modelConfig,
  currencyMode,
  locale,
}: {
  busy: boolean;
  onSend: (message: string) => void;
  onAbort?: () => void;
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  currentPage?: string;
  contextBytes: number;
  contextMaxBytes: number;
  usage: ConversationUsage;
  modelConfig: ModelConfig;
  currencyMode: CurrencyMode;
  locale: Locale;
}) {
  const [value, setValue] = useState('');
  const cacheTokens = usage.cacheHitTokens + usage.cacheMissTokens;
  const cacheHitRate = cacheTokens > 0
    ? `${Math.round((usage.cacheHitTokens / cacheTokens) * 100)}%`
    : usage.requestCount === 0 ? '0%' : '—';
  const contextPercent = `${Math.min(100, Math.round((contextBytes / contextMaxBytes) * 100))}%`;
  const currency = resolveCurrency(currencyMode, locale);
  const currencySymbol = currency === 'CNY' ? '¥' : '$';
  const cost = estimateDeepSeekCost(usage, modelConfig, currency);
  const costLabel = usage.requestCount === 0
    ? `${currencySymbol}0.00`
    : cost == null
      ? '—'
    : `${currencySymbol}${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`;
  const numberFormat = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');

  // Must match the `.composer textarea` CSS max-height (6 lines at 1.45).
  const autosize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 138);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 138 ? 'auto' : 'hidden';
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
    onSend(value);
    setValue('');
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label={placeholder}
        />
        <div className="composer-tools">
          {currentPage && <span className="composer-page-chip">{currentPage}</span>}
          <span
            className="composer-model-id"
            title={modelConfig.model}
            aria-label={locale === 'zh' ? `当前模型：${modelConfig.model}` : `Current model: ${modelConfig.model}`}
          >
            {modelConfig.model}
          </span>
          <button
            type={busy ? 'button' : 'submit'}
            onClick={busy ? onAbort : undefined}
            disabled={busy ? !onAbort : !value.trim()}
            aria-label={busy ? stopLabel : sendLabel}
          >
            {busy ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </form>
      <div className="composer-metrics" aria-label={locale === 'zh' ? 'AI 用量统计' : 'AI usage'}>
        <span>
          <b>{locale === 'zh' ? '命中率' : 'Cache hit'}</b>{cacheHitRate}
        </span>
        <span>
          <b>{locale === 'zh' ? '消耗 Tokens' : 'Tokens'}</b>{numberFormat.format(usage.totalTokens)}
        </span>
        <span>
          <b>{locale === 'zh' ? '请求次数' : 'Requests'}</b>{numberFormat.format(usage.requestCount)}
        </span>
        <span>
          <b>{locale === 'zh' ? '上下文' : 'Context'}</b>{contextPercent}
        </span>
        <span>
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
  view,
  aiActive,
  conversations,
  activeConversationId,
  chatBusy,
  supplement,
  person,
  story,
  references,
  library,
  favorites,
  activePlanSection,
  onFavoriteNavigate,
  onPlanSection,
  onResumeChat,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  t,
}: {
  locale: Locale;
  view: View;
  aiActive: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string;
  chatBusy: boolean;
  supplement: Supplement | null;
  person: Person | null;
  story: Story | null;
  references: Array<{ label: string; url: string }>;
  library: LibrarySnapshot;
  favorites: FavoriteReference[];
  activePlanSection: PlanSection;
  onFavoriteNavigate: (target: Omit<InternalNoteTarget, 'label'>) => void;
  onPlanSection: (section: PlanSection) => void;
  onResumeChat: () => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const planSections = getPlanSections(locale);
  const hasOpenContent = Boolean(supplement || person || story);
  const favoriteItems = useMemo<FavoriteListItem[]>(() => {
    const items: FavoriteListItem[] = [];
    for (const favorite of favorites) {
      if (favorite.kind === 'supplement') {
        const item = library.supplements.find((candidate) => candidate.id === favorite.id);
        if (item) {
          items.push({
            target: favorite,
            title: locale === 'zh' ? item.nameZh : item.nameEn,
            detail: `${item.tier} · ${item.category}`,
          });
        }
      } else if (favorite.kind === 'person') {
        const item = library.people.find((candidate) => candidate.id === favorite.id);
        if (item) {
          items.push({
            target: favorite,
            title: locale === 'zh' ? item.nameZh || item.name : item.name,
            detail: t('people'),
          });
        }
      } else {
        const item = library.stories.find((candidate) => candidate.id === favorite.id);
        if (item) {
          items.push({
            target: favorite,
            title: locale === 'zh' ? item.title : item.titleEn || item.title,
            detail: t('stories'),
          });
        }
      }
    }
    return items;
  }, [favorites, library, locale, t]);

  return (
    <aside className="right-rail">
      <div className="rail-header">
        <div>
          <span className="rail-kicker">
            {aiActive ? (
              <History size={15} />
            ) : hasOpenContent ? (
              <Library size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {aiActive
              ? t('recentContexts')
              : hasOpenContent
                ? t('reading')
                : t('workspace')}
          </span>
          <h3>
            {aiActive
              ? locale === 'zh'
                ? '当前对话'
                : 'Current conversation'
              : (supplement
                  ? locale === 'zh'
                    ? supplement.nameZh
                    : supplement.nameEn
                  : null) ||
                (person
                  ? locale === 'zh'
                    ? person.nameZh || person.name
                    : person.name
                  : null) ||
                (story ? (locale === 'zh' ? story.title : story.titleEn || story.title) : null) ||
                t('favoritesAndPlan')}
          </h3>
        </div>
        {aiActive ? (
          <button
            type="button"
            className="rail-resume-chat"
            onClick={onNewChat}
            disabled={chatBusy}
          >
            <Plus size={15} />
            {t('newChat')}
          </button>
        ) : conversations.length > 0 ? (
          <button type="button" className="rail-resume-chat" onClick={onResumeChat}>
            <MessageCircleMore size={14} />
            {t('backToChat')}
          </button>
        ) : null}
      </div>

      <div className="rail-scroll">
        {aiActive ? (
          <>
            <div className="context-summary">
              <div>
                <strong>
                  {library.noteCount}{' '}
                  {locale === 'zh' ? '条本地资料' : 'local source items'}
                </strong>
                <small>
                  {locale === 'zh'
                    ? '把当前目标和相关资料交给 TierNote，先看清冲突、选择与下一步。'
                    : 'Bring a goal and the relevant material. Start by seeing conflicts, choices, and the next step.'}
                </small>
              </div>
            </div>
            <div className="rail-section-title">
              {locale === 'zh' ? '历史对话' : 'Conversations'} <span>{conversations.length}</span>
            </div>
            <div className="conversation-history-list">
              {conversations.length ? (
                conversations.map((conversation) => (
                  <div
                    className={`conversation-history-item ${conversation.id === activeConversationId ? 'active' : ''}`}
                    key={conversation.id}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      disabled={chatBusy || conversation.id === activeConversationId}
                    >
                      <span>
                        <strong>{conversation.title || (locale === 'zh' ? '新对话' : 'New conversation')}</strong>
                        <small className="conversation-history-meta">
                          <span>
                            {conversation.messageCount}{locale === 'zh' ? ' 条消息' : ' messages'} · {Math.max(1, Math.round(conversation.estimatedContextBytes / 1024))} KB
                          </span>
                          <time>{formatConversationTime(conversation.updatedAt, locale)}</time>
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="conversation-history-delete"
                      onClick={() => onDeleteConversation(conversation.id)}
                      disabled={chatBusy}
                      aria-label={locale === 'zh' ? '删除对话' : 'Delete conversation'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="rail-empty-state">{locale === 'zh' ? '暂无历史对话' : 'No saved conversations yet'}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rail-section-title">
              {t('favorites')} {favoriteItems.length ? <span>{favoriteItems.length}</span> : null}
            </div>
            {favoriteItems.length ? (
              <div className="favorite-list">
                {favoriteItems.map((item) => (
                  <button
                    type="button"
                    onClick={() => onFavoriteNavigate(item.target)}
                    key={`${item.target.kind}:${item.target.id}`}
                  >
                    <span className="favorite-item-icon">
                      {item.target.kind === 'supplement' ? (
                        <Dumbbell size={17} />
                      ) : item.target.kind === 'person' ? (
                        <UserRound size={17} />
                      ) : (
                        <BookOpen size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="favorite-inline-empty">{t('favoriteHint')}</p>
            )}

            <div className="rail-section-title">
              {t('myPlan')} <span>{planSections.length}</span>
            </div>
            <div className="plan-shortcut-list">
              {planSections.map((section) => (
                <button
                  className={view === 'plan' && activePlanSection === section.id ? 'active' : ''}
                  onClick={() => onPlanSection(section.id)}
                  key={section.id}
                >
                  <span className="plan-shortcut-icon" style={{ background: section.accent }}>
                    {section.icon}
                  </span>
                  <span>
                    <strong>{section.title}</strong>
                    <small>{section.description}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>

            {references.length > 0 && (
              <>
                <div className="rail-section-title">
                  {t('sources')} <span>{references.length}</span>
                </div>
                <div className="source-list">
                  {references.map((reference) => (
                    <AppLink href={reference.url} key={reference.url}>
                      <Globe2 size={15} />
                      <span>{reference.label}</span>
                      <ArrowRight size={14} />
                    </AppLink>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

    </aside>
  );
}

function SettingsDialog({
  locale,
  config,
  themeMode,
  currencyMode,
  onChange,
  onLocale,
  onThemeMode,
  onCurrencyMode,
  onClose,
  t,
}: {
  locale: Locale;
  config: ModelSettings;
  themeMode: ThemeMode;
  currencyMode: CurrencyMode;
  onChange: (config: ModelSettings) => void;
  onLocale: (locale: Locale) => void;
  onThemeMode: (themeMode: ThemeMode) => void;
  onCurrencyMode: (currencyMode: CurrencyMode) => void;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [draft, setDraft] = useState(config);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('model');

  const updateProvider = (provider: ModelProvider) => {
    const next = {
      ...draft,
      activeProvider: provider,
    };
    setDraft(next);
    onChange(next);
  };

  const updateDraft = (patch: Partial<ProviderConfig>) => {
    const provider = draft.activeProvider;
    const next = {
      ...draft,
      providers: {
        ...draft.providers,
        [provider]: { ...draft.providers[provider], ...patch },
      },
    };
    setDraft(next);
    onChange(next);
  };

  const activeConfig = draft.providers[draft.activeProvider];
  const activeOption = providerOptions[draft.activeProvider];
  const settingsSections: Array<{
    id: SettingsSectionId;
    label: string;
    description: string;
    icon: ReactNode;
  }> = [
    { id: 'model', label: t('settingsModel'), description: t('settingsModelDesc'), icon: <Bot size={16} /> },
    { id: 'appearance', label: t('settingsAppearance'), description: t('settingsAppearanceDesc'), icon: <Monitor size={16} /> },
  ];
  const currentSection = settingsSections.find((section) => section.id === activeSection)
    ?? settingsSections[0];
  const visibleSection = currentSection.id;
  const resolvedCurrency = resolveCurrency(currencyMode, locale);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogHeader
          icon={<Settings size={21} />}
          title={t('settings')}
          titleId="settings-title"
          onClose={onClose}
          closeLabel={locale === 'zh' ? '关闭' : 'Close'}
        />

        <div className="settings-content">
          <nav className="settings-nav" aria-label={locale === 'zh' ? '设置分类' : 'Settings sections'}>
            {settingsSections.map((section) => (
              <button
                className={visibleSection === section.id ? 'active' : ''}
                onClick={() => setActiveSection(section.id)}
                key={section.id}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-panel">
            <header className="settings-panel-heading">
              <h3>{currentSection.label}</h3>
              <p>{currentSection.description}</p>
            </header>

            {visibleSection === 'model' && (
              <>
                <div className="settings-section">
                  <label>{t('provider')}</label>
                  <div className="provider-grid">
                    {(Object.keys(providerOptions) as ModelProvider[]).map((provider) => (
                      <button
                        className={draft.activeProvider === provider ? 'active' : ''}
                        onClick={() => updateProvider(provider)}
                        key={provider}
                      >
                        {providerOptions[provider].label[locale]}
                      </button>
                    ))}
                  </div>
                  <div className="field-row">
                    <label>
                      <span>{t('baseUrl')}</span>
                      <input
                        value={activeConfig.baseUrl}
                        onChange={(event) => updateDraft({ baseUrl: event.target.value })}
                        placeholder={activeOption.baseUrlPlaceholder}
                      />
                    </label>
                    <label>
                      <span>{t('model')}</span>
                      <input
                        value={activeConfig.model}
                        onChange={(event) => updateDraft({ model: event.target.value })}
                        placeholder={activeOption.modelPlaceholder}
                      />
                    </label>
                  </div>
                  <label className="full-field">
                    <span>{t('apiKey')}</span>
                    <input
                      type="password"
                      value={activeConfig.apiKey}
                      onChange={(event) => updateDraft({ apiKey: event.target.value })}
                      placeholder={activeOption.apiKeyPlaceholder}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className="settings-section">
                  <label>{t('pricingCurrency')}</label>
                  <div className="currency-switch">
                    {(['auto', 'CNY', 'USD'] as CurrencyMode[]).map((currency) => (
                      <button
                        className={currencyMode === currency ? 'active' : ''}
                        onClick={() => onCurrencyMode(currency)}
                        key={currency}
                      >
                        {currency === 'auto'
                          ? `${t('currencyAuto')} (${resolvedCurrency === 'CNY' ? '¥' : '$'})`
                          : currency === 'CNY'
                            ? `¥ ${t('currencyCny')}`
                            : `$ ${t('currencyUsd')}`}
                      </button>
                    ))}
                  </div>
                  <p className="settings-hint">{t('currencyAutoHint')}</p>
                </div>

                <div className="settings-section economy-section">
                  <div className="economy-heading">
                    <label>{t('economyMode')}</label>
                    <span className="economy-badge"><Zap size={13} /> {t('economyModeBadge')}</span>
                  </div>
                  <p className="settings-hint">{t('economyModeDesc')}</p>
                  <button
                    type="button"
                    className={`economy-toggle ${draft.economyMode ? 'active' : ''}`}
                    aria-pressed={draft.economyMode}
                    onClick={() => {
                      const next = { ...draft, economyMode: !draft.economyMode };
                      setDraft(next);
                      onChange(next);
                    }}
                  >
                    <span className="economy-toggle-track"><span /></span>
                    {draft.economyMode ? t('economyModeOn') : t('economyModeOff')}
                  </button>
                </div>
              </>
            )}

            {visibleSection === 'appearance' && (
              <div className="settings-section settings-section-stack">
                <div>
                  <label>{t('appearance')}</label>
                  <div className="theme-switch">
                    <button className={themeMode === 'system' ? 'active' : ''} onClick={() => onThemeMode('system')}>
                      <Monitor size={15} />{t('themeSystem')}
                    </button>
                    <button className={themeMode === 'light' ? 'active' : ''} onClick={() => onThemeMode('light')}>
                      <Sun size={15} />{t('themeLight')}
                    </button>
                    <button className={themeMode === 'dark' ? 'active' : ''} onClick={() => onThemeMode('dark')}>
                      <Moon size={15} />{t('themeDark')}
                    </button>
                  </div>
                </div>
                <div>
                  <label>{t('language')}</label>
                  <div className="language-switch">
                    <button className={locale === 'zh' ? 'active' : ''} onClick={() => onLocale('zh')}>中文</button>
                    <button className={locale === 'en' ? 'active' : ''} onClick={() => onLocale('en')}>English</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        <footer className="dialog-footer">
          <div className="dialog-meta">
            <button
              className="version-link"
              onClick={() => void openExternalUrl(PRODUCT_WEBSITE)}
            >
              TierNote · v{APP_VERSION}
            </button>
            <button onClick={() => void openExternalUrl(FEEDBACK_URL)}>
              <Github size={13} strokeWidth={1.8} />
              {t('feedback')}
            </button>
          </div>
          <button className="primary-button" onClick={onClose}>
            {t('close')}
          </button>
        </footer>
      </section>
    </div>
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
  economyMode,
  knowledgeRoot,
  onClose,
  onSaved,
  t,
}: {
  locale: Locale;
  config: ModelConfig;
  economyMode: boolean;
  knowledgeRoot: string;
  onClose: () => void;
  onSaved: (path: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}) {
  const [source, setSource] = useState('');
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const organize = async () => {
    const clean = source.trim();
    if (!clean) {
      setError(t('captureInputRequired'));
      return;
    }
    if (isTauri && !config.apiKey.trim()) {
      setError(t('captureNeedsModel'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      setDraft(
        await prepareCapture({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          input: clean,
          locale,
          economyMode,
        }),
      );
    } catch (requestError) {
      setError(
        `${t('capturePrepareFailed')}: ${String(requestError).replace(/^Error:\s*/i, '')}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    if (!knowledgeRoot) {
      setError(t('captureNeedsLibrary'));
      return;
    }
    if (!draft.title.trim() || !draft.content.trim()) {
      setError(t('captureDraftRequired'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const path = await saveCapture({
        knowledgeRoot,
        title: draft.title,
        content: draft.content,
        sourceUrl: draft.sourceUrl,
        locale,
      });
      await onSaved(path);
    } catch (saveError) {
      setError(`${t('captureSaveFailed')}: ${String(saveError).replace(/^Error:\s*/i, '')}`);
      setSaving(false);
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
          {!draft ? (
            <>
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
              <div className="capture-prompt-example">
                <p className="capture-prompt-copy">{t('capturePrompt')}</p>
              </div>
            </>
          ) : (
            <div className="capture-draft">
              <label className="capture-field">
                <span>{t('captureDraftTitle')}</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  maxLength={180}
                />
              </label>
              <label className="capture-field">
                <span>{t('captureDraftContent')}</span>
                <textarea
                  className="capture-draft-content"
                  value={draft.content}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  maxLength={120000}
                />
              </label>
              {draft.sourceUrl && <p className="capture-source-url">{draft.sourceUrl}</p>}
            </div>
          )}

          {error && (
            <p className="capture-error" role="alert">
              {error}
            </p>
          )}

          <div className="capture-guide-actions">
            <button
              className="secondary-button"
              onClick={draft ? () => setDraft(null) : onClose}
              disabled={busy || saving}
            >
              {draft ? t('captureBack') : t('notNow')}
            </button>
            <button
              className="primary-button"
              onClick={draft ? save : organize}
              disabled={busy || saving || (!draft && !source.trim())}
            >
              {busy || saving ? (
                <LoaderCircle className="spinning" size={16} />
              ) : draft ? (
                <Check size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {busy
                ? t('capturePreparing')
                : saving
                  ? t('captureSaving')
                  : draft
                    ? t('captureConfirmSave')
                    : t('capturePrepare')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;

export type Locale = 'zh' | 'en';
export type View =
  | 'home'
  | 'ai'
  | 'people'
  | 'person'
  | 'stories'
  | 'story'
  | 'plan'
  | 'file'
  | 'log';

export interface PriorityNote {
  id: string;
  title: string;
  tier: string;
  filePath: string;
}

export interface Person {
  id: string;
  name: string;
  nameZh?: string;
  summary: string;
  tier?: string;
  filePath?: string;
  accent: string;
}

export interface Story {
  id: string;
  title: string;
  titleEn?: string;
  summary: string;
  summaryEn?: string;
  tier?: string;
  filePath?: string;
  accent: string;
}

export interface LibrarySnapshot {
  root: string;
  myInfoRoot: string;
  connected: boolean;
  priorities: PriorityNote[];
  people: Person[];
  stories: Story[];
  noteCount: number;
}

export type ModelProtocol = 'openai' | 'anthropic';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type WebReaderProvider = 'direct' | 'firecrawl' | 'jina';

export interface WebReaderSettings {
  provider: WebReaderProvider;
  baseUrl: string;
  apiKey: string;
}

export interface ProviderConfig {
  providerId: string;
  name: string;
  protocol: ModelProtocol;
  baseUrl: string;
  apiKey: string;
  customModels: string[];
  models: string[];
  model: string;
}

export interface ModelConfig extends ProviderConfig {
  provider: ModelProtocol;
  providerKey: string;
  reasoningEffort: ReasoningEffort;
}

export interface ModelSettings {
  activeProvider: string;
  reasoningEffort: ReasoningEffort;
  providers: Record<string, ProviderConfig>;
  webReader: WebReaderSettings;
}

export interface ModelCatalogCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
}

export interface ModelCatalogLimit {
  context?: number;
  input?: number;
  output?: number;
}

export interface ModelCatalogModel {
  id: string;
  name: string;
  family?: string;
  reasoning: boolean;
  reasoningOptions: ReasoningEffort[];
  toolCall: boolean;
  attachment: boolean;
  status?: string;
  releaseDate?: string;
  cost?: ModelCatalogCost;
  limit?: ModelCatalogLimit;
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  npm: string;
  api?: string;
  doc?: string;
  models: Record<string, ModelCatalogModel>;
}

export type ModelCatalog = Record<string, ModelCatalogProvider>;

export interface MemorySuggestion {
  id: string;
  kind: 'goal' | 'preference' | 'constraint' | 'profile' | 'correction' | 'health_context';
  content: string;
  sourceConversationId: string;
  locale?: Locale;
}

export interface MemoryItem extends MemorySuggestion {
  createdAt: number;
  updatedAt: number;
  sourceType?: string;
  sourcePath?: string;
  status?: string;
  contentHash?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'memory_suggestion';
  content: string;
  createdAt: number;
  toolName?: string;
  toolArgs?: string;
  toolStatus?: 'running' | 'done' | 'failed';
  toolOutput?: string;
  memorySuggestion?: MemorySuggestion;
  memoryStatus?: 'pending' | 'saved' | 'dismissed';
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  estimatedContextBytes: number;
}

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  uiMessages: ChatMessage[];
}

export interface ChatRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider?: ModelProtocol;
  reasoningEffort?: ReasoningEffort;
  question: string;
  locale: Locale;
  knowledgeRoot: string;
  contextPaths: string[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface CaptureRequest {
  knowledgeRoot: string;
  title: string;
  content: string;
  sourceUrl?: string;
  locale: Locale;
}

export interface PrepareCaptureRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider?: ModelProtocol;
  reasoningEffort?: ReasoningEffort;
  transcriptionMode?: 'api' | 'local';
  input: string;
  locale: Locale;
  knowledgeRoot: string;
  webReader: WebReaderSettings;
}

export type TranscriptionProtocol = 'openai-compatible' | 'deepgram' | 'assemblyai' | 'elevenlabs' | 'custom';

export interface TranscriptionProviderConfig {
  providerId: string;
  protocol: TranscriptionProtocol;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface TranscriptionSettingsConfig {
  activeProvider: string;
  providers: Record<string, TranscriptionProviderConfig>;
  activeRuntime: string;
  activeModel: string;
}

export interface TranscriptionCheckResult {
  ok: boolean;
  message: string;
}

export type ImageCapabilityMode = 'recognition' | 'generation' | 'speech' | 'video' | 'music' | 'sound';
export type ImageProviderProtocol =
  | 'openai-compatible'
  | 'openai-images'
  | 'openrouter-images'
  | 'gemini-interactions'
  | 'openai-speech'
  | 'openai-video'
  | 'runway-video'
  | 'byteplus-video'
  | 'kling-video'
  | 'vertex-video'
  | 'minimax-video'
  | 'luma-video'
  | 'vidu-video'
  | 'pika-video'
  | 'wan-video'
  | 'ltx-video'
  | 'adobe-firefly-video'
  | 'tencent-tokenhub-video'
  | 'gemini-music'
  | 'elevenlabs-music'
  | 'minimax-music'
  | 'custom-music'
  | 'elevenlabs-sound'
  | 'custom-sound';

export interface ImageProviderConfig {
  providerId: string;
  protocol: ImageProviderProtocol;
  endpoint: string;
  model: string;
  apiKey: string;
  secondaryApiKey?: string;
  voice?: string;
}

export interface ImageCapabilityConfig {
  activeProvider: string;
  providers: Record<string, ImageProviderConfig>;
}

export interface ImageSettingsConfig {
  recognition: ImageCapabilityConfig;
  generation: ImageCapabilityConfig;
  speech: ImageCapabilityConfig;
  video: ImageCapabilityConfig;
  music: ImageCapabilityConfig;
  sound: ImageCapabilityConfig;
}

export interface ImageCheckResult {
  ok: boolean;
  message: string;
}

export interface GeneratedFilesSettings {
  directory: string;
  usesWorkspaceDefault: boolean;
}

export interface TranscriptionResourceStatus {
  id: string;
  kind: 'runtime' | 'model';
  installed: boolean;
  downloading: boolean;
  bytes: number;
}

export interface TranscriptionResourceProgress {
  id: string;
  kind: 'runtime' | 'model';
  status: 'downloading' | 'installed' | 'cancelled' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  message?: string;
}

export interface CaptureDraft {
  title: string;
  content: string;
  sourceUrl?: string;
}

export type FileContentKind = 'text' | 'transcript' | 'image' | 'unsupported';

export interface FileContent {
  kind: FileContentKind;
  text: string;
  imagePath?: string;
  label: string;
  extension: string;
}

export interface SkillCategory {
  id: string;
  label: string;
  fixed: boolean;
}

export interface SkillDefinition {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  codexCompatible: boolean;
  sourceId: string;
  sourceUrl: string;
  sourceVersion?: string;
  enabled: boolean;
  builtin?: boolean;
  iconId?: string;
  runtimeId?: string;
}

export interface WeixinMessageSettings {
  enabled: boolean;
  accountId: string;
  token: string;
  baseUrl: string;
  allowedUserId: string;
  syncBuf: string;
}

export interface TelegramMessageSettings {
  enabled: boolean;
  botToken: string;
  botName: string;
  allowedUserId: string;
  pairingCode: string;
  updateOffset: number;
}

export interface MessageSettingsConfig {
  knowledgeRoot: string;
  locale: Locale;
  transcriptionMode: 'api' | 'local';
  weixin: WeixinMessageSettings;
  telegram: TelegramMessageSettings;
}

export interface MessageChannelStatus {
  weixin: 'disconnected' | 'waiting_scan' | 'connecting' | 'connected' | 'error';
  telegram: 'disconnected' | 'waiting_pairing' | 'connecting' | 'connected' | 'error';
  weixinError: string;
  telegramError: string;
  activeJobs: number;
}

export interface WeixinLoginStart {
  sessionId: string;
  qrCodeUrl: string;
}

export interface WeixinLoginPoll {
  status: string;
  connected: boolean;
  needsVerifyCode: boolean;
  message: string;
}

export interface SkillPlugin {
  id: string;
  name: string;
  description: string;
  version?: string;
  categoryId: string;
  codexCompatible: boolean;
  sourceUrl: string;
  skillCount: number;
  error?: string;
  enabled: boolean;
  builtin?: boolean;
  iconId?: string;
  publisher: string;
  origin: 'bundled' | 'git';
  runtimeId?: string;
}

export interface SkillCatalog {
  categories: SkillCategory[];
  skills: SkillDefinition[];
  plugins: SkillPlugin[];
  icons: Record<string, string>;
}

export interface SkillSourceDraft {
  sourceUrl: string;
  categoryId: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cacheWriteTokens: number;
}

// ── Agent events (from Rust backend via Tauri) ──

export type AgentEvent =
  | { type: 'text_delta'; conversationId?: string; text: string }
  | { type: 'tool_call_start'; conversationId?: string; id: string; name: string }
  | { type: 'tool_call_args'; conversationId?: string; id: string; args: string }
  | { type: 'tool_result'; conversationId?: string; id: string; output: string; success: boolean }
  | { type: 'memory_suggestion'; conversationId?: string; suggestion: MemorySuggestion }
  | { type: 'usage'; conversationId?: string; usage: LlmUsage }
  | { type: 'request_started'; conversationId?: string }
  | { type: 'done'; conversationId?: string }
  | { type: 'error'; conversationId?: string; message: string }
  | { type: 'state'; conversationId?: string; state: string };

export interface ToolCallMessage {
  id: string;
  name: string;
  args: string;
  status: 'running' | 'done' | 'failed';
  output?: string;
}

export interface AgentRequest {
  conversationId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  provider?: string;
  reasoningEffort?: ReasoningEffort;
  modelContextWindow?: number;
  modelMaxOutputTokens?: number;
  modelReasoningEfforts?: ReasoningEffort[];
  webReader: WebReaderSettings;
  message: string;
  locale: Locale;
  knowledgeRoot: string;
  contextPaths: string[];
  skillId?: string;
  noteSummary?: string;
  enabledMyInfoSections: string[];
  includePriorities: boolean;
  /** Title of the library note the user is viewing when sending, if any. */
  currentPage?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

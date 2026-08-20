import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  HardDrive,
  Server,
  X,
} from 'lucide-react';
import {
  cancelTranscriptionDownload,
  checkTranscriptionConfig,
  chooseTranscriptionStorageDirectory,
  downloadTranscriptionResource,
  getTranscriptionStorage,
  listTranscriptionResources,
  loadTranscriptionConfig,
  onTranscriptionResourceProgress,
  openExternalUrl,
  openTranscriptionStorageDirectory,
  persistTranscriptionConfig,
  setTranscriptionStorageDirectory,
} from '../api';
import type { Locale, TranscriptionProviderConfig, TranscriptionSettingsConfig, TranscriptionStorageInfo } from '../types';
import '../transcriptionSettings.css';

type ComponentState = 'available' | 'downloading' | 'installed';
type TranscriptionTab = 'api' | 'funasr' | 'native' | 'cuda' | 'firered';

interface DownloadableComponent {
  id: string;
  name: Record<Locale, string>;
  detail: Record<Locale, string>;
  size: string;
  included?: boolean;
  recommended?: boolean;
  runtimeId?: string;
  compatibleRuntimeIds?: string[];
}

const TRANSCRIPTION_MODELS: DownloadableComponent[] = [
  {
    id: 'fireredasr2-aed',
    name: { zh: 'FireRedASR2-AED', en: 'FireRedASR2-AED' },
    detail: { zh: '中文、20+ 方言、中英混合与歌声 · 官方第一梯队', en: 'Chinese, 20+ dialects, code-switching, and singing · top-tier official model' },
    size: '4.4 GB',
    recommended: true,
    runtimeId: 'firered',
  },
  {
    id: 'fireredasr2-llm',
    name: { zh: 'FireRedASR2-LLM', en: 'FireRedASR2-LLM' },
    detail: { zh: '最高中文与方言精度 · 需要大显存 NVIDIA GPU', en: 'Highest Chinese and dialect accuracy · large-memory NVIDIA GPU required' },
    size: '17.6 GB',
    runtimeId: 'firered',
  },
  {
    id: 'sensevoice-small',
    name: { zh: 'SenseVoiceSmall', en: 'SenseVoiceSmall' },
    detail: { zh: '中文、粤语和中英混合 · CPU 本地运行', en: 'Chinese, Cantonese, and mixed Chinese-English · local CPU' },
    size: '254 MB',
    recommended: true,
    runtimeId: 'funasr',
  },
  {
    id: 'paraformer-large',
    name: { zh: 'Paraformer Large', en: 'Paraformer Large' },
    detail: { zh: '普通话和中英混合 · 长音频与批量转写', en: 'Mandarin and mixed Chinese-English · long-form and batch transcription' },
    size: '237 MB',
    runtimeId: 'funasr',
  },
  {
    id: 'funasr-nano',
    name: { zh: 'Fun-ASR-Nano', en: 'Fun-ASR-Nano' },
    detail: { zh: '中文、方言和专业术语 · 语音大模型', en: 'Chinese, dialects, and specialist terms · speech LLM' },
    size: '954 MB',
    runtimeId: 'funasr',
  },
  {
    id: 'fast',
    name: { zh: 'Whisper Base', en: 'Whisper Base' },
    detail: { zh: '多语言兼容 · 中文效果有限', en: 'Broad language compatibility · limited Chinese accuracy' },
    size: '142 MB',
    runtimeId: 'native',
    compatibleRuntimeIds: ['native', 'cuda'],
  },
  {
    id: 'standard',
    name: { zh: 'Whisper Small', en: 'Whisper Small' },
    detail: { zh: '多语言兼容 · 中文效果有限', en: 'Broad language compatibility · limited Chinese accuracy' },
    size: '466 MB',
    recommended: true,
    runtimeId: 'native',
    compatibleRuntimeIds: ['native', 'cuda'],
  },
  {
    id: 'accurate',
    name: { zh: 'Whisper Medium', en: 'Whisper Medium' },
    detail: { zh: '多语言兼容 · 下载体积较大', en: 'Broad language compatibility · larger download' },
    size: '1.5 GB',
    runtimeId: 'native',
    compatibleRuntimeIds: ['native', 'cuda'],
  },
];

interface TranscriptionApiProvider {
  id: string;
  name: Record<Locale, string>;
  endpoint: string;
  model: string;
  website: string;
  protocol: TranscriptionProviderConfig['protocol'];
}

interface TranscriptionSelectOption {
  value: string;
  label: string;
}

function TranscriptionSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: TranscriptionSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return undefined;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const moveFocus = (direction: 1 | -1) => {
    const focusedIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    const nextIndex = focusedIndex < 0
      ? selectedIndex
      : (focusedIndex + direction + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  const selectedLabel = options[selectedIndex]?.label ?? value;

  return (
    <div className="transcription-select" ref={rootRef}>
      <button
        type="button"
        className="transcription-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            window.requestAnimationFrame(() => moveFocus(event.key === 'ArrowDown' ? 1 : -1));
          }
        }}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div className="transcription-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              type="button"
              className={option.value === value ? 'selected' : ''}
              role="option"
              aria-selected={option.value === value}
              ref={(element) => { optionRefs.current[index] = element; }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(event.key === 'ArrowDown' ? 1 : -1);
                }
              }}
              key={option.value}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} strokeWidth={2} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TRANSCRIPTION_API_PROVIDERS: TranscriptionApiProvider[] = [
  {
    id: 'siliconflow',
    name: { zh: '硅基流动', en: 'SiliconFlow' },
    endpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
    model: 'FunAudioLLM/SenseVoiceSmall',
    website: 'https://cloud.siliconflow.cn/account/ak',
    protocol: 'openai-compatible',
  },
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'gpt-transcribe',
    website: 'https://platform.openai.com/api-keys',
    protocol: 'openai-compatible',
  },
  {
    id: 'groq',
    name: { zh: 'Groq', en: 'Groq' },
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    website: 'https://console.groq.com/keys',
    protocol: 'openai-compatible',
  },
  {
    id: 'deepgram',
    name: { zh: 'Deepgram', en: 'Deepgram' },
    endpoint: 'https://api.deepgram.com/v1/listen',
    model: 'nova-3',
    website: 'https://console.deepgram.com/project',
    protocol: 'deepgram',
  },
  {
    id: 'assemblyai',
    name: { zh: 'AssemblyAI', en: 'AssemblyAI' },
    endpoint: 'https://api.assemblyai.com/v2/transcript',
    model: 'universal-3-pro',
    website: 'https://www.assemblyai.com/app',
    protocol: 'assemblyai',
  },
  {
    id: 'elevenlabs',
    name: { zh: 'ElevenLabs', en: 'ElevenLabs' },
    endpoint: 'https://api.elevenlabs.io/v1/speech-to-text',
    model: 'scribe_v2',
    website: 'https://elevenlabs.io/app/developers/api-keys',
    protocol: 'elevenlabs',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    endpoint: '',
    model: '',
    website: '',
    protocol: 'custom',
  },
];

const TRANSCRIPTION_API_MODELS: Record<string, string[]> = {
  siliconflow: ['FunAudioLLM/SenseVoiceSmall', 'TeleAI/TeleSpeechASR'],
  openai: ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe-diarize', 'whisper-1'],
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  deepgram: ['nova-3'],
  assemblyai: ['universal-3-pro', 'universal-2'],
  elevenlabs: ['scribe_v2', 'scribe_v1'],
};

function currentPlatform(): 'windows' | 'macos' | 'linux' {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent.toLowerCase();
  if (agent.includes('macintosh') || agent.includes('mac os')) return 'macos';
  if (agent.includes('linux')) return 'linux';
  return 'windows';
}

function runtimeComponents(platform: ReturnType<typeof currentPlatform>): DownloadableComponent[] {
  const fireredPythonVersions = platform === 'windows' ? '3.11–3.13' : '3.11–3.14';
  const runtimes: DownloadableComponent[] = [
    {
      id: 'firered',
      name: { zh: 'FireRedASR2 官方环境', en: 'Official FireRedASR2 environment' },
      detail: { zh: `自动配置官方代码与 PyTorch · 支持 Python ${fireredPythonVersions}`, en: `Sets up the official code and PyTorch · supports Python ${fireredPythonVersions}` },
      size: `Python ${fireredPythonVersions}`,
    },
    {
      id: 'funasr',
      name: { zh: 'FunASR 本地引擎', en: 'FunASR local engine' },
      detail: { zh: '运行 SenseVoice、Paraformer 与 Fun-ASR-Nano · 含长音频 VAD', en: 'Runs SenseVoice, Paraformer, and Fun-ASR-Nano · includes long-audio VAD' },
      size: platform === 'windows' ? '7 MB' : '9 MB',
    },
    {
      id: 'native',
      name: { zh: 'Whisper CPU 引擎', en: 'Whisper CPU engine' },
      detail: { zh: '运行 Whisper Base、Small 与 Medium', en: 'Runs Whisper Base, Small, and Medium' },
      size: platform === 'windows' ? '8 MB' : '9 MB',
    },
  ];
  if (platform === 'windows') {
    runtimes.push({
      id: 'cuda',
      name: { zh: 'Whisper NVIDIA 引擎', en: 'Whisper NVIDIA engine' },
      detail: { zh: 'Whisper GPU 加速 · 需要兼容的 NVIDIA 驱动', en: 'GPU acceleration for Whisper · compatible NVIDIA driver required' },
      size: '640 MB',
    });
  }
  return runtimes;
}

function modelStateKey(runtimeId: string, modelId: string): string {
  return `${runtimeId}:${modelId}`;
}

function resourceStateKey(kind: 'runtime' | 'model', runtimeId: string, id: string): string {
  return `${kind}:${runtimeId}:${id}`;
}

function displayStoragePath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

function platformLabel(platform: ReturnType<typeof currentPlatform>, locale: Locale): string {
  if (platform === 'macos') return locale === 'zh' ? 'macOS · 自动选择架构' : 'macOS · architecture selected automatically';
  if (platform === 'linux') return locale === 'zh' ? 'Linux · 64 位' : 'Linux · 64-bit';
  return locale === 'zh' ? 'Windows · 64 位' : 'Windows · 64-bit';
}

export function TranscriptionSettings({
  locale,
  initialTab = 'api',
}: {
  locale: Locale;
  initialTab?: 'api' | 'local';
}) {
  const platform = useMemo(currentPlatform, []);
  const runtimes = useMemo(() => runtimeComponents(platform), [platform]);
  const [runtimeStates, setRuntimeStates] = useState<Record<string, ComponentState>>(() =>
    Object.fromEntries(runtimes.map((runtime) => [runtime.id, 'available'])),
  );
  const [modelStates, setModelStates] = useState<Record<string, ComponentState>>(() =>
    Object.fromEntries(runtimes.flatMap((runtime) => TRANSCRIPTION_MODELS.map((model) => [modelStateKey(runtime.id, model.id), 'available']))),
  );
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [activeRuntime, setActiveRuntime] = useState('');
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TranscriptionTab>(initialTab === 'api' ? 'api' : 'firered');
  const [apiProvider, setApiProvider] = useState('siliconflow');
  const [apiUrl, setApiUrl] = useState(TRANSCRIPTION_API_PROVIDERS[0].endpoint);
  const [apiModel, setApiModel] = useState(TRANSCRIPTION_API_PROVIDERS[0].model);
  const [apiKey, setApiKey] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiTested, setApiTested] = useState(false);
  const [apiError, setApiError] = useState('');
  const providerConfigsRef = useRef<Record<string, TranscriptionProviderConfig>>(
    Object.fromEntries(TRANSCRIPTION_API_PROVIDERS.map((provider) => [provider.id, {
      providerId: provider.id,
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      model: provider.model,
      apiKey: '',
    }])),
  );
  const pendingConfigRef = useRef<TranscriptionSettingsConfig | null>(null);
  const [resourceErrors, setResourceErrors] = useState<Record<string, string>>({});
  const [storageInfo, setStorageInfo] = useState<TranscriptionStorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageError, setStorageError] = useState('');
  const activeTabRef = useRef<TranscriptionTab>(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    let alive = true;
    void listTranscriptionResources().then((resources) => {
      if (!alive) return;
      const runtimeEntries = resources.filter((item) => item.kind === 'runtime');
      const modelEntries = resources.filter((item) => item.kind === 'model');
      setRuntimeStates((current) => ({ ...current, ...Object.fromEntries(runtimeEntries.map((item) => [item.id, item.downloading ? 'downloading' : item.installed ? 'installed' : 'available'])) }));
      setModelStates((current) => ({ ...current, ...Object.fromEntries(modelEntries.map((item) => [modelStateKey(item.runtimeId, item.id), item.downloading ? 'downloading' : item.installed ? 'installed' : 'available'])) }));
      setResourceErrors(Object.fromEntries(resources
        .filter((item) => item.error)
        .map((item) => [resourceStateKey(item.kind, item.runtimeId, item.id), item.error!])));
    });
    let unlisten: (() => void) | undefined;
    void onTranscriptionResourceProgress((event) => {
      if (!alive) return;
      const nextState: ComponentState = event.status === 'downloading'
        ? 'downloading'
        : event.status === 'installed' ? 'installed' : 'available';
      if (event.kind === 'runtime' && runtimes.some((runtime) => runtime.id === event.id)) {
        setRuntimeStates((states) => ({ ...states, [event.id]: nextState }));
      } else if (event.kind === 'model' && TRANSCRIPTION_MODELS.some((model) => model.id === event.id)) {
        setModelStates((states) => ({ ...states, [modelStateKey(event.runtimeId, event.id)]: nextState }));
      }
      const key = resourceStateKey(event.kind, event.runtimeId, event.id);
      setProgress((values) => ({ ...values, [key]: event.percent }));
      if (event.status === 'installed') {
        if (event.kind === 'runtime') setActiveRuntime(event.id);
      }
      if (event.message && event.status === 'error') {
        setResourceErrors((errors) => ({ ...errors, [key]: event.message! }));
      } else if (event.status === 'downloading' || event.status === 'installed') {
        setResourceErrors((errors) => ({ ...errors, [key]: '' }));
      }
    }).then((stop) => { unlisten = stop; });
    return () => { alive = false; unlisten?.(); };
  }, [runtimes]);

  useEffect(() => {
    if (activeTab === 'api') return undefined;
    let alive = true;
    setStorageInfo(null);
    setStorageError('');
    void getTranscriptionStorage(activeTab).then((storage) => {
      if (alive && storage) setStorageInfo(storage);
    }).catch((error) => {
      if (alive) setStorageError(String(error).replace(/^Error:\s*/i, ''));
    });
    return () => { alive = false; };
  }, [activeTab]);

  useEffect(() => {
    let alive = true;
    void loadTranscriptionConfig().then((config) => {
      if (!alive) return;
      providerConfigsRef.current = { ...providerConfigsRef.current, ...(config?.providers ?? {}) };
      const provider = providerConfigsRef.current[config?.activeProvider || 'siliconflow'];
      if (provider) {
        setApiProvider(provider.providerId);
        setApiUrl(provider.endpoint);
        setApiModel(provider.model);
        setApiKey(provider.apiKey);
      }
      if (config?.activeRuntime) {
        setActiveRuntime(config.activeRuntime);
        if (initialTab === 'local' && runtimes.some((runtime) => runtime.id === config.activeRuntime)) {
          setActiveTab(config.activeRuntime as TranscriptionTab);
        }
      }
      if (config?.activeModel) setActiveModel(config.activeModel);
      setConfigLoaded(true);
    }).catch(() => {
      if (alive) setConfigLoaded(true);
    });
    return () => { alive = false; };
  }, [initialTab, runtimes]);

  useEffect(() => {
    if (!configLoaded) return;
    const provider = TRANSCRIPTION_API_PROVIDERS.find((item) => item.id === apiProvider)
      ?? TRANSCRIPTION_API_PROVIDERS[0];
    providerConfigsRef.current = {
      ...providerConfigsRef.current,
      [apiProvider]: {
        providerId: apiProvider,
        protocol: provider.protocol,
        endpoint: apiUrl,
        model: apiModel,
        apiKey,
      },
    };
    const config: TranscriptionSettingsConfig = {
      activeProvider: apiProvider,
      providers: providerConfigsRef.current,
      activeRuntime,
      activeModel: activeModel ?? '',
    };
    pendingConfigRef.current = config;
    const timer = window.setTimeout(() => {
      void persistTranscriptionConfig(config).catch((error) => {
        setApiError(String(error).replace(/^Error:\s*/i, ''));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeModel, activeRuntime, apiKey, apiModel, apiProvider, apiUrl, configLoaded]);

  useEffect(() => {
    if (!configLoaded) return undefined;
    return () => {
      if (pendingConfigRef.current) void persistTranscriptionConfig(pendingConfigRef.current);
    };
  }, [configLoaded]);

  const toggleLocalModel = (modelId: string) => {
    const model = TRANSCRIPTION_MODELS.find((item) => item.id === modelId);
    const compatible = model?.compatibleRuntimeIds ?? (model?.runtimeId ? [model.runtimeId] : []);
    const tabRuntime = activeTab === 'api' ? '' : activeTab;
    if (!model || modelStates[modelStateKey(tabRuntime, modelId)] !== 'installed' || !compatible.includes(tabRuntime) || runtimeStates[tabRuntime] !== 'installed') {
      return;
    }
    const selected = activeModel === modelId && activeRuntime === tabRuntime;
    if (selected) {
      setActiveModel(null);
      return;
    }
    const runtime = compatible.includes(tabRuntime) ? tabRuntime : model?.runtimeId ?? compatible[0] ?? 'native';
    setActiveRuntime(runtime);
    setActiveModel(modelId);
  };

  const startDownload = (item: DownloadableComponent, kind: 'runtime' | 'model') => {
    const runtimeId = kind === 'runtime' ? item.id : activeTab === 'api' ? (item.runtimeId ?? 'native') : activeTab;
    const key = resourceStateKey(kind, runtimeId, item.id);
    const setStates = kind === 'runtime' ? setRuntimeStates : setModelStates;
    const stateKey = kind === 'runtime' ? item.id : modelStateKey(runtimeId, item.id);
    setStates((states) => ({ ...states, [stateKey]: 'downloading' }));
    setProgress((values) => ({ ...values, [key]: 0 }));
    setResourceErrors((errors) => ({ ...errors, [key]: '' }));
    void downloadTranscriptionResource(kind, item.id, runtimeId).catch((error) => {
      setStates((states) => ({ ...states, [stateKey]: 'available' }));
      setResourceErrors((errors) => ({ ...errors, [key]: String(error).replace(/^Error:\s*/i, '') }));
    });
  };

  const cancelDownload = (item: DownloadableComponent, kind: 'runtime' | 'model') => {
    const runtimeId = kind === 'runtime' ? item.id : activeTab === 'api' ? (item.runtimeId ?? 'native') : activeTab;
    void cancelTranscriptionDownload(kind, item.id, runtimeId);
  };

  const renderRows = (items: DownloadableComponent[], kind: 'runtime' | 'model') => items.map((item) => {
    const runtimeId = kind === 'runtime' ? item.id : activeTab === 'api' ? (item.runtimeId ?? 'native') : activeTab;
    const state = kind === 'runtime' ? runtimeStates[item.id] : modelStates[modelStateKey(runtimeId, item.id)];
    const key = resourceStateKey(kind, runtimeId, item.id);
    const value = progress[key] ?? 0;
    const compatibleRuntimes = item.compatibleRuntimeIds ?? (item.runtimeId ? [item.runtimeId] : []);
    const runtimeReady = kind === 'runtime'
      || (activeTab !== 'api' && compatibleRuntimes.includes(activeTab) && runtimeStates[activeTab] === 'installed');
    const active = kind === 'model'
      && state === 'installed'
      && runtimeReady
      && activeModel === item.id
      && activeRuntime === activeTab;

    return (
      <div className={`transcription-component-row${active ? ' is-active' : ''}`} key={item.id}>
        <div className="transcription-component-mark" aria-hidden="true">
          {kind === 'runtime' ? <Cpu size={18} strokeWidth={1.8} /> : <Gauge size={18} strokeWidth={1.8} />}
        </div>
        <div className="transcription-component-copy">
          <div className="transcription-component-title">
            <strong>{item.name[locale]}</strong>
            {item.recommended && <span>{locale === 'zh' ? '推荐' : 'Recommended'}</span>}
          </div>
          <p>{item.detail[locale]}</p>
          {state === 'downloading' && (
            <div className="transcription-download-progress" aria-label={locale === 'zh' ? `下载进度 ${value}%` : `Download progress ${value}%`}>
              <span style={{ width: `${value}%` }} />
            </div>
          )}
          {resourceErrors[key] && <p className="transcription-resource-error" role="alert">{resourceErrors[key]}</p>}
        </div>
        <div className="transcription-component-meta">
          {state === 'downloading' ? `${value}% · ${item.size}` : item.size}
        </div>
        <div className="transcription-component-actions">
          {kind === 'runtime' && state === 'installed' && (
            <span className="transcription-downloaded-state">{locale === 'zh' ? '已下载' : 'Downloaded'}</span>
          )}
          {state === 'available' && (
            <button type="button" className="transcription-download-action" onClick={() => startDownload(item, kind)}>
              <Download size={15} />
              {locale === 'zh' ? (kind === 'runtime' ? '安装' : '下载') : (kind === 'runtime' ? 'Install' : 'Download')}
            </button>
          )}
          {state === 'downloading' && (
            <button type="button" className="transcription-icon-action" aria-label={locale === 'zh' ? `取消下载${item.name.zh}` : `Cancel ${item.name.en} download`} onClick={() => cancelDownload(item, kind)}>
              <X size={16} />
            </button>
          )}
          {kind === 'model' && state === 'installed' && runtimeReady && (
            <button
              type="button"
              className="transcription-model-switch"
              role="switch"
              aria-checked={active}
              aria-label={locale === 'zh'
                ? `${active ? '停用' : '使用'}模型 ${item.name.zh}`
                : `${active ? 'Disable' : 'Use'} model ${item.name.en}`}
              onClick={() => toggleLocalModel(item.id)}
            >
              <span aria-hidden="true" />
            </button>
          )}
          {kind === 'model' && state === 'installed' && !runtimeReady && (
            <span className="transcription-missing-engine-state">
              {locale === 'zh' ? '缺少引擎' : 'Engine missing'}
            </span>
          )}
        </div>
      </div>
    );
  });

  const selectedRuntimeId = activeTab === 'api' ? 'funasr' : activeTab;
  const selectedRuntime = runtimes.find((runtime) => runtime.id === selectedRuntimeId) ?? runtimes[0];
  const visibleModels = TRANSCRIPTION_MODELS.filter((model) => {
    const compatible = model.compatibleRuntimeIds ?? (model.runtimeId ? [model.runtimeId] : []);
    return compatible.includes(selectedRuntime.id);
  });
  const configuredModel = TRANSCRIPTION_MODELS.find((model) => model.id === activeModel);
  const configuredRuntimeIds = configuredModel?.compatibleRuntimeIds
    ?? (configuredModel?.runtimeId ? [configuredModel.runtimeId] : []);
  const configuredModelReady = activeModel !== null
    && modelStates[modelStateKey(activeRuntime, activeModel)] === 'installed';

  const chooseStorageDirectory = () => {
    const runtimeId = selectedRuntime.id;
    setStorageError('');
    void chooseTranscriptionStorageDirectory().then((directory) => {
      if (!directory) return;
      setStorageBusy(true);
      return setTranscriptionStorageDirectory(runtimeId, directory).then((storage) => {
        if (activeTabRef.current === runtimeId) setStorageInfo(storage);
        return listTranscriptionResources();
      }).then((resources) => {
        if (!resources) return;
        setRuntimeStates((current) => ({ ...current, ...Object.fromEntries(resources.filter((item) => item.kind === 'runtime').map((item) => [item.id, item.installed ? 'installed' : 'available'])) }));
        setModelStates((current) => ({ ...current, ...Object.fromEntries(resources.filter((item) => item.kind === 'model').map((item) => [modelStateKey(item.runtimeId, item.id), item.installed ? 'installed' : 'available'])) }));
        setResourceErrors(Object.fromEntries(resources
          .filter((item) => item.error)
          .map((item) => [resourceStateKey(item.kind, item.runtimeId, item.id), item.error!])));
      });
    }).catch((error) => {
      if (activeTabRef.current === runtimeId) {
        setStorageError(String(error).replace(/^Error:\s*/i, ''));
      }
    }).finally(() => setStorageBusy(false));
  };

  const installedExtraSize = TRANSCRIPTION_MODELS
    .filter((item) => !item.included)
    .filter((item) => modelStates[modelStateKey(selectedRuntime.id, item.id)] === 'installed')
    .map((item) => item.size);

  const testApiConnection = () => {
    setApiTesting(true);
    setApiTested(false);
    setApiError('');
    const provider = TRANSCRIPTION_API_PROVIDERS.find((item) => item.id === apiProvider)
      ?? TRANSCRIPTION_API_PROVIDERS[0];
    const config: TranscriptionSettingsConfig = {
      activeProvider: apiProvider,
      providers: {
        [apiProvider]: {
          providerId: apiProvider,
          protocol: provider.protocol,
          endpoint: apiUrl,
          model: apiModel,
          apiKey,
        },
      },
      activeRuntime,
      activeModel: activeModel ?? '',
    };
    void checkTranscriptionConfig(config).then((result) => {
      setApiTesting(false);
      setApiTested(result.ok);
      if (!result.ok) setApiError(result.message);
    }).catch((error) => {
      setApiTesting(false);
      setApiError(String(error).replace(/^Error:\s*/i, ''));
    });
  };

  const selectedApiProvider = TRANSCRIPTION_API_PROVIDERS.find((provider) => provider.id === apiProvider)
    ?? TRANSCRIPTION_API_PROVIDERS[0];

  const selectApiProvider = (next: string) => {
    const currentProvider = TRANSCRIPTION_API_PROVIDERS.find((item) => item.id === apiProvider)
      ?? TRANSCRIPTION_API_PROVIDERS[0];
    providerConfigsRef.current[apiProvider] = {
      providerId: apiProvider,
      protocol: currentProvider.protocol,
      endpoint: apiUrl,
      model: apiModel,
      apiKey,
    };
    const provider = TRANSCRIPTION_API_PROVIDERS.find((item) => item.id === next)
      ?? TRANSCRIPTION_API_PROVIDERS[0];
    const stored = providerConfigsRef.current[provider.id];
    setApiProvider(provider.id);
    setApiUrl(stored?.endpoint ?? provider.endpoint);
    setApiModel(stored?.model ?? provider.model);
    setApiKey(stored?.apiKey ?? '');
    setApiTested(false);
    setApiError('');
  };

  return (
    <div className="transcription-settings-group">
      <header className="transcription-settings-header">
        <div>
          <h2>{locale === 'zh' ? '音频转文案' : 'Audio to text'}</h2>
          <p>{locale === 'zh' ? '配置云端或本地语音识别模型，将音频转换为文字。' : 'Configure hosted or local speech recognition models to turn audio into text.'}</p>
        </div>
        <div className="transcription-device-summary">
          <HardDrive size={16} strokeWidth={1.8} />
          <span>{platformLabel(platform, locale)}</span>
        </div>
      </header>

      <nav className="transcription-tabs" aria-label={locale === 'zh' ? '语音识别方式' : 'Speech recognition modes'}>
        <button type="button" className={activeTab === 'api' ? 'active' : ''} onClick={() => setActiveTab('api')}>
          <Server size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '云端识别' : 'Cloud'}
        </button>
        {runtimes.map((runtime) => (
          <button
            type="button"
            className={activeTab === runtime.id ? 'active' : ''}
            onClick={() => setActiveTab(runtime.id as TranscriptionTab)}
            key={runtime.id}
          >
            <Cpu size={16} strokeWidth={1.8} />
            {runtime.id === 'funasr' && 'FunASR'}
            {runtime.id === 'native' && 'Whisper CPU'}
            {runtime.id === 'cuda' && 'Whisper NVIDIA'}
            {runtime.id === 'firered' && 'FireRedASR2'}
            {configuredModelReady
              && runtimeStates[runtime.id] === 'installed'
              && activeRuntime === runtime.id
              && configuredRuntimeIds.includes(runtime.id) && (
              <span className="transcription-tab-active-state">{locale === 'zh' ? '使用中' : 'In use'}</span>
            )}
          </button>
        ))}
      </nav>

      {activeTab === 'api' && (
        <section className="transcription-api-settings">
          <div className="transcription-api-form">
            <label>
              <span>{locale === 'zh' ? '语音识别服务' : 'Speech recognition service'}</span>
              <span className="transcription-provider-select">
                <TranscriptionSelect
                  value={apiProvider}
                  options={TRANSCRIPTION_API_PROVIDERS.map((provider) => ({
                    value: provider.id,
                    label: provider.name[locale],
                  }))}
                  onChange={selectApiProvider}
                  ariaLabel={locale === 'zh' ? '选择语音识别服务' : 'Choose speech recognition service'}
                />
                {selectedApiProvider.website && (
                  <button
                    type="button"
                    className="transcription-website-action"
                    onClick={() => void openExternalUrl(selectedApiProvider.website)}
                    aria-label={locale === 'zh' ? `打开${selectedApiProvider.name.zh}网站` : `Open ${selectedApiProvider.name.en} website`}
                  >
                    <ExternalLink size={16} />
                  </button>
                )}
              </span>
            </label>
            <label>
              <span>{locale === 'zh' ? '语音识别模型' : 'Recognition model'}</span>
              {TRANSCRIPTION_API_MODELS[apiProvider] ? (
                <TranscriptionSelect
                  value={apiModel}
                  options={TRANSCRIPTION_API_MODELS[apiProvider].map((model) => ({ value: model, label: model }))}
                  onChange={(model) => { setApiModel(model); setApiTested(false); }}
                  ariaLabel={locale === 'zh' ? '选择语音识别模型' : 'Choose speech recognition model'}
                />
              ) : (
                <input
                  value={apiModel}
                  onChange={(event) => { setApiModel(event.target.value); setApiTested(false); }}
                  placeholder={locale === 'zh' ? '输入服务支持的语音识别模型' : 'Enter a supported speech recognition model'}
                />
              )}
            </label>
            <label>
              <span>{locale === 'zh' ? 'API 地址' : 'API URL'}</span>
              <input value={apiUrl} onChange={(event) => { setApiUrl(event.target.value); setApiTested(false); }} placeholder="https://…" />
            </label>
            <label>
              <span>{locale === 'zh' ? 'API Key' : 'API key'}</span>
              <input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setApiTested(false); }} placeholder={locale === 'zh' ? '输入后保存在本机' : 'Stored on this device'} />
            </label>
          </div>

          <div className="transcription-api-footer">
            {apiError && <p className="transcription-api-error" role="alert">{apiError}</p>}
            <button type="button" className="transcription-test-action" disabled={apiTesting || !apiUrl.trim() || !apiModel.trim() || !apiKey.trim()} onClick={testApiConnection}>
              {apiTesting ? (locale === 'zh' ? '检查中…' : 'Checking…') : (apiTested ? (locale === 'zh' ? '配置完整' : 'Configuration complete') : (locale === 'zh' ? '检查配置' : 'Check configuration'))}
            </button>
          </div>
        </section>
      )}

      {activeTab !== 'api' && <>
      <section className="transcription-settings-block transcription-storage-block">
        <div className="transcription-block-heading">
          <div>
            <h3>{locale === 'zh' ? '存储位置' : 'Storage location'}</h3>
            <p>{locale === 'zh' ? `仅存放 ${selectedRuntime.name.zh} 及其模型；更换目录时会自动迁移这一组资源。` : `Stores only ${selectedRuntime.name.en} and its models; this engine family migrates when the directory changes.`}</p>
          </div>
          <HardDrive size={18} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div className="transcription-storage-path">
          <span>{storageInfo ? displayStoragePath(storageInfo.directory) : (locale === 'zh' ? '正在读取…' : 'Loading…')}</span>
          {storageInfo?.usesDefault && <em>{locale === 'zh' ? '系统盘默认目录' : 'System-drive default'}</em>}
        </div>
        <div className="transcription-storage-actions">
          <button type="button" className="transcription-download-action" disabled={storageBusy} onClick={chooseStorageDirectory}>
            <FolderOpen size={15} />
            {storageBusy ? (locale === 'zh' ? '正在迁移…' : 'Migrating…') : (locale === 'zh' ? '选择目录' : 'Choose directory')}
          </button>
          <button type="button" className="transcription-text-action" onClick={() => void openTranscriptionStorageDirectory(selectedRuntime.id)}>
            {locale === 'zh' ? '打开目录' : 'Open folder'}
          </button>
        </div>
        {storageError && <p className="transcription-resource-error" role="alert">{storageError}</p>}
      </section>
      <section className="transcription-settings-block">
        <div className="transcription-block-heading">
          <div>
            <h3>{locale === 'zh' ? '运行引擎' : 'Runtime engines'}</h3>
          </div>
          <Cpu size={18} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div className="transcription-component-list">{renderRows([selectedRuntime], 'runtime')}</div>
      </section>
      <section className="transcription-settings-block">
        <div className="transcription-block-heading">
          <div>
            <h3>{locale === 'zh' ? '可用模型' : 'Available models'}</h3>
          </div>
          <span className="transcription-storage-total">
            {installedExtraSize.length
              ? (locale === 'zh' ? `已安装 ${installedExtraSize.join(' + ')}` : `Installed ${installedExtraSize.join(' + ')}`)
              : (locale === 'zh' ? '尚未下载模型' : 'No model downloaded')}
          </span>
        </div>
        <div className="transcription-component-list">{renderRows(visibleModels, 'model')}</div>
      </section>
      </>}
    </div>
  );
}

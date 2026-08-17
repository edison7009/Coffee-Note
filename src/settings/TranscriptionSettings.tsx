import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cpu,
  Download,
  ExternalLink,
  Gauge,
  HardDrive,
  Server,
  X,
  Zap,
} from 'lucide-react';
import {
  cancelTranscriptionDownload,
  checkTranscriptionConfig,
  downloadTranscriptionResource,
  listTranscriptionResources,
  loadTranscriptionConfig,
  onTranscriptionResourceProgress,
  openExternalUrl,
  persistTranscriptionConfig,
} from '../api';
import type { Locale, TranscriptionProviderConfig, TranscriptionSettingsConfig } from '../types';
import '../transcriptionSettings.css';

type ComponentState = 'available' | 'downloading' | 'installed';

interface DownloadableComponent {
  id: string;
  name: Record<Locale, string>;
  detail: Record<Locale, string>;
  size: string;
  included?: boolean;
  recommended?: boolean;
}

const TRANSCRIPTION_MODELS: DownloadableComponent[] = [
  {
    id: 'fast',
    name: { zh: '快速', en: 'Fast' },
    detail: { zh: '短视频与低配置设备', en: 'Short clips and lower-powered devices' },
    size: '142 MB',
  },
  {
    id: 'standard',
    name: { zh: '标准', en: 'Standard' },
    detail: { zh: '速度与中英文准确度均衡', en: 'Balanced speed and multilingual accuracy' },
    size: '466 MB',
    recommended: true,
  },
  {
    id: 'accurate',
    name: { zh: '高精度', en: 'High accuracy' },
    detail: { zh: '长视频、访谈与课程', en: 'Long videos, interviews, and lectures' },
    size: '1.5 GB',
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
    model: 'gpt-4o-mini-transcribe',
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
    model: 'universal-2',
    website: 'https://www.assemblyai.com/app',
    protocol: 'assemblyai',
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
  openai: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'gpt-4o-transcribe-diarize', 'whisper-1'],
  groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
};

function currentPlatform(): 'windows' | 'macos' | 'linux' {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent.toLowerCase();
  if (agent.includes('macintosh') || agent.includes('mac os')) return 'macos';
  if (agent.includes('linux')) return 'linux';
  return 'windows';
}

function runtimeComponents(platform: ReturnType<typeof currentPlatform>): DownloadableComponent[] {
  if (platform === 'macos') {
    return [];
  }

  if (platform === 'linux') {
    return [
      {
        id: 'native',
        name: { zh: 'CPU 通用引擎', en: 'Universal CPU engine' },
        detail: { zh: '下载后即可使用', en: 'Ready after download' },
        size: '9 MB',
        recommended: true,
      },
    ];
  }

  return [
    {
      id: 'native',
      name: { zh: 'CPU 通用引擎', en: 'Universal CPU engine' },
      detail: { zh: '下载后即可使用', en: 'Ready after download' },
      size: '8 MB',
      recommended: true,
    },
    {
      id: 'cuda',
      name: { zh: 'NVIDIA GPU 加速', en: 'NVIDIA GPU acceleration' },
      detail: { zh: '适用于兼容的 NVIDIA 显卡与驱动', en: 'For compatible NVIDIA graphics and drivers' },
      size: '640 MB',
    },
  ];
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
    Object.fromEntries(runtimes.map((runtime) => [runtime.id, runtime.included ? 'installed' : 'available'])),
  );
  const [modelStates, setModelStates] = useState<Record<string, ComponentState>>(() =>
    Object.fromEntries(TRANSCRIPTION_MODELS.map((model) => [model.id, 'available'])),
  );
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [activeRuntime, setActiveRuntime] = useState('');
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api' | 'local'>(initialTab);
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

  useEffect(() => {
    let alive = true;
    void listTranscriptionResources().then((resources) => {
      if (!alive) return;
      const runtimeEntries = resources.filter((item) => item.kind === 'runtime');
      const modelEntries = resources.filter((item) => item.kind === 'model');
      setRuntimeStates((current) => ({ ...current, ...Object.fromEntries(runtimeEntries.map((item) => [item.id, item.downloading ? 'downloading' : item.installed ? 'installed' : 'available'])) }));
      setModelStates((current) => ({ ...current, ...Object.fromEntries(modelEntries.map((item) => [item.id, item.downloading ? 'downloading' : item.installed ? 'installed' : 'available'])) }));
    });
    let unlisten: (() => void) | undefined;
    void onTranscriptionResourceProgress((event) => {
      if (!alive) return;
      const setStates = event.kind === 'runtime' ? setRuntimeStates : setModelStates;
      const nextState: ComponentState = event.status === 'downloading'
        ? 'downloading'
        : event.status === 'installed' ? 'installed' : 'available';
      setStates((states) => ({ ...states, [event.id]: nextState }));
      setProgress((values) => ({ ...values, [`${event.kind}:${event.id}`]: event.percent }));
      if (event.status === 'installed') {
        if (event.kind === 'runtime') setActiveRuntime(event.id);
        else setActiveModel(event.id);
      }
      if (event.message && event.status === 'error') {
        setResourceErrors((errors) => ({ ...errors, [`${event.kind}:${event.id}`]: event.message! }));
      }
    }).then((stop) => { unlisten = stop; });
    return () => { alive = false; unlisten?.(); };
  }, []);

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
      if (config?.activeRuntime) setActiveRuntime(config.activeRuntime);
      if (config?.activeModel) setActiveModel(config.activeModel);
      setConfigLoaded(true);
    }).catch(() => {
      if (alive) setConfigLoaded(true);
    });
    return () => { alive = false; };
  }, []);

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

  const startDownload = (
    item: DownloadableComponent,
    kind: 'runtime' | 'model',
  ) => {
    const key = `${kind}:${item.id}`;
    const setStates = kind === 'runtime' ? setRuntimeStates : setModelStates;
    setStates((states) => ({ ...states, [item.id]: 'downloading' }));
    setProgress((values) => ({ ...values, [key]: 0 }));
    setResourceErrors((errors) => ({ ...errors, [key]: '' }));
    void downloadTranscriptionResource(kind, item.id).catch((error) => {
      setStates((states) => ({ ...states, [item.id]: 'available' }));
      setResourceErrors((errors) => ({ ...errors, [key]: String(error).replace(/^Error:\s*/i, '') }));
    });
  };

  const cancelDownload = (item: DownloadableComponent, kind: 'runtime' | 'model') => {
    void cancelTranscriptionDownload(kind, item.id);
  };

  const renderRows = (items: DownloadableComponent[], kind: 'runtime' | 'model') => items.map((item) => {
    const state = (kind === 'runtime' ? runtimeStates : modelStates)[item.id];
    const active = kind === 'runtime' ? activeRuntime === item.id : activeModel === item.id;
    const key = `${kind}:${item.id}`;
    const value = progress[key] ?? 0;

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
          {active && state === 'installed' && (
            <span className="transcription-active-state">{locale === 'zh' ? '使用中' : 'In use'}</span>
          )}
          {!active && state === 'installed' && (
            <button type="button" className="transcription-text-action" onClick={() => kind === 'runtime' ? setActiveRuntime(item.id) : setActiveModel(item.id)}>
              {locale === 'zh' ? '使用' : 'Use'}
            </button>
          )}
          {state === 'available' && (
            <button type="button" className="transcription-download-action" onClick={() => startDownload(item, kind)}>
              <Download size={15} />{locale === 'zh' ? '下载' : 'Download'}
            </button>
          )}
          {state === 'downloading' && (
            <button type="button" className="transcription-icon-action" aria-label={locale === 'zh' ? `取消下载${item.name.zh}` : `Cancel ${item.name.en} download`} onClick={() => cancelDownload(item, kind)}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    );
  });

  const installedExtraSize = [...runtimes, ...TRANSCRIPTION_MODELS]
    .filter((item) => !item.included)
    .filter((item) => (runtimeStates[item.id] ?? modelStates[item.id]) === 'installed')
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
          {locale === 'zh' ? '语音识别模型' : 'Speech recognition model'}
          <span className="transcription-tab-recommended">{locale === 'zh' ? '推荐' : 'Recommended'}</span>
        </button>
        <button type="button" className={activeTab === 'local' ? 'active' : ''} onClick={() => setActiveTab('local')}>
          <Cpu size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '本地语音识别模型' : 'Local speech recognition models'}
        </button>
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

      {activeTab === 'local' && <>
      <section className="transcription-settings-block">
        <div className="transcription-block-heading">
          <div>
            <h3>{locale === 'zh' ? '运行引擎' : 'Runtime'}</h3>
            <p>{locale === 'zh' ? '本地模型需要先下载引擎，才能运行模型。' : 'Download the runtime before running a local model.'}</p>
          </div>
          <Zap size={18} strokeWidth={1.7} aria-hidden="true" />
        </div>
        {runtimes.length > 0
          ? <div className="transcription-component-list">{renderRows(runtimes, 'runtime')}</div>
          : <p className="transcription-runtime-unavailable">{locale === 'zh' ? '当前系统的本地运行引擎尚未提供。' : 'A local runtime is not available for this system yet.'}</p>}
      </section>

      <section className="transcription-settings-block">
        <div className="transcription-block-heading">
          <div>
            <h3>{locale === 'zh' ? '选择模型' : 'Choose a model'}</h3>
            <p>{locale === 'zh' ? '根据机器配置选择不同量级的模型，处理结果也有所区别。' : 'Choose a model size for this device; processing results vary by model.'}</p>
          </div>
          <span className="transcription-storage-total">
            {installedExtraSize.length
              ? (locale === 'zh' ? `已安装 ${installedExtraSize.join(' + ')}` : `Installed ${installedExtraSize.join(' + ')}`)
              : (locale === 'zh' ? '尚未下载模型' : 'No model downloaded')}
          </span>
        </div>
        <div className="transcription-component-list">{renderRows(TRANSCRIPTION_MODELS, 'model')}</div>
      </section>
      </>}
    </div>
  );
}

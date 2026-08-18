import { AudioLines, ExternalLink, ImagePlus, ScanSearch, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  checkImageSettings,
  loadImageSettings,
  openExternalUrl,
  persistImageSettings,
} from '../api';
import type {
  ImageCapabilityConfig,
  ImageCapabilityMode,
  ImageProviderConfig,
  ImageProviderProtocol,
  ImageSettingsConfig,
  Locale,
} from '../types';
import { SettingsSelect } from './SettingsSelect';
import '../transcriptionSettings.css';

interface ImageProviderPreset {
  id: string;
  name: Record<Locale, string>;
  protocol: ImageProviderProtocol;
  endpoint: string;
  model: string;
  website: string;
  voice?: string;
}

const RECOGNITION_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    protocol: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-5.6-luna',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: { zh: 'Google Gemini', en: 'Google Gemini' },
    protocol: 'openai-compatible',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.6-flash',
    website: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openrouter',
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    protocol: 'openai-compatible',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-5.4-mini',
    website: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'openai-compatible',
    endpoint: '',
    model: '',
    website: '',
  },
];

const GENERATION_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    protocol: 'openai-images',
    endpoint: 'https://api.openai.com/v1/images/generations',
    model: 'gpt-image-2',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: { zh: 'Google Gemini', en: 'Google Gemini' },
    protocol: 'gemini-interactions',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    model: 'gemini-3.1-flash-image',
    website: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openrouter',
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    protocol: 'openrouter-images',
    endpoint: 'https://openrouter.ai/api/v1/images',
    model: 'google/gemini-3.1-flash-image',
    website: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'openai-images',
    endpoint: '',
    model: '',
    website: '',
  },
];

const SPEECH_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    protocol: 'openai-speech',
    endpoint: 'https://api.openai.com/v1/audio/speech',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'openai-speech',
    endpoint: '',
    model: '',
    voice: 'alloy',
    website: '',
  },
];

const VIDEO_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    protocol: 'openai-video',
    endpoint: 'https://api.openai.com/v1/videos',
    model: 'sora-2',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'openai-video',
    endpoint: '',
    model: '',
    website: '',
  },
];

function providerPresets(mode: ImageCapabilityMode): ImageProviderPreset[] {
  if (mode === 'recognition') return RECOGNITION_PROVIDERS;
  if (mode === 'generation') return GENERATION_PROVIDERS;
  if (mode === 'speech') return SPEECH_PROVIDERS;
  return VIDEO_PROVIDERS;
}

function defaultCapability(mode: ImageCapabilityMode): ImageCapabilityConfig {
  const providers = providerPresets(mode);
  return {
    activeProvider: providers[0].id,
    providers: Object.fromEntries(providers.map((provider) => [provider.id, {
      providerId: provider.id,
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      model: provider.model,
      apiKey: '',
      voice: provider.voice ?? '',
    }])),
  };
}

function defaultSettings(): ImageSettingsConfig {
  return {
    recognition: defaultCapability('recognition'),
    generation: defaultCapability('generation'),
    speech: defaultCapability('speech'),
    video: defaultCapability('video'),
  };
}

function mergeCapability(
  defaults: ImageCapabilityConfig,
  stored: ImageCapabilityConfig | undefined,
): ImageCapabilityConfig {
  return {
    activeProvider: stored?.activeProvider || defaults.activeProvider,
    providers: { ...defaults.providers, ...(stored?.providers ?? {}) },
  };
}

export function MultimodalSettings({ locale }: { locale: Locale }) {
  const [activeTab, setActiveTab] = useState<ImageCapabilityMode>('recognition');
  const initialSettings = useRef(defaultSettings());
  const [providerId, setProviderId] = useState(initialSettings.current.recognition.activeProvider);
  const [endpoint, setEndpoint] = useState(initialSettings.current.recognition.providers.openai.endpoint);
  const [model, setModel] = useState(initialSettings.current.recognition.providers.openai.model);
  const [apiKey, setApiKey] = useState('');
  const [voice, setVoice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState('');
  const settingsRef = useRef<ImageSettingsConfig>(initialSettings.current);
  const pendingConfigRef = useRef<ImageSettingsConfig | null>(null);

  const showCapability = (
    mode: ImageCapabilityMode,
    settings = settingsRef.current,
  ) => {
    const presets = providerPresets(mode);
    const capability = settings[mode];
    const activeId = capability.activeProvider || presets[0].id;
    const active = capability.providers[activeId] ?? capability.providers[presets[0].id];
    setProviderId(active.providerId);
    setEndpoint(active.endpoint);
    setModel(active.model);
    setApiKey(active.apiKey);
    setVoice(active.voice ?? '');
  };

  const currentProvider = (): ImageProviderConfig => {
    const preset = providerPresets(activeTab).find((provider) => provider.id === providerId)
      ?? providerPresets(activeTab)[0];
    return {
      providerId,
      protocol: preset.protocol,
      endpoint,
      model,
      apiKey,
      voice,
    };
  };

  const settingsWithCurrentForm = (): ImageSettingsConfig => ({
    ...settingsRef.current,
    [activeTab]: {
      ...settingsRef.current[activeTab],
      activeProvider: providerId,
      providers: {
        ...settingsRef.current[activeTab].providers,
        [providerId]: currentProvider(),
      },
    },
  });

  useEffect(() => {
    let alive = true;
    void loadImageSettings().then((stored) => {
      if (!alive) return;
      const defaults = defaultSettings();
      const settings = {
        recognition: mergeCapability(defaults.recognition, stored?.recognition),
        generation: mergeCapability(defaults.generation, stored?.generation),
        speech: mergeCapability(defaults.speech, stored?.speech),
        video: mergeCapability(defaults.video, stored?.video),
      };
      settingsRef.current = settings;
      showCapability('recognition', settings);
      setLoaded(true);
    }).catch(() => {
      if (alive) setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    const settings = settingsWithCurrentForm();
    settingsRef.current = settings;
    pendingConfigRef.current = settings;
    const timer = window.setTimeout(() => {
      void persistImageSettings(settings).catch((reason) => {
        setError(String(reason).replace(/^Error:\s*/i, ''));
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeTab, apiKey, endpoint, loaded, model, providerId, voice]);

  useEffect(() => {
    if (!loaded) return undefined;
    return () => {
      if (pendingConfigRef.current) void persistImageSettings(pendingConfigRef.current);
    };
  }, [loaded]);

  const presets = providerPresets(activeTab);
  const selectedProvider = presets.find((provider) => provider.id === providerId) ?? presets[0];

  const selectTab = (mode: ImageCapabilityMode) => {
    if (mode === activeTab) return;
    settingsRef.current = settingsWithCurrentForm();
    setActiveTab(mode);
    showCapability(mode);
    setTested(false);
    setError('');
  };

  const selectProvider = (nextProviderId: string) => {
    const settings = settingsWithCurrentForm();
    settingsRef.current = settings;
    const preset = presets.find((provider) => provider.id === nextProviderId) ?? presets[0];
    const stored = settings[activeTab].providers[preset.id];
    setProviderId(preset.id);
    setEndpoint(stored?.endpoint ?? preset.endpoint);
    setModel(stored?.model ?? preset.model);
    setApiKey(stored?.apiKey ?? '');
    setVoice(stored?.voice ?? preset.voice ?? '');
    setTested(false);
    setError('');
  };

  const testConnection = () => {
    const settings = settingsWithCurrentForm();
    settingsRef.current = settings;
    setTesting(true);
    setTested(false);
    setError('');
    void persistImageSettings(settings)
      .then(() => checkImageSettings(settings, activeTab))
      .then((result) => {
        setTesting(false);
        setTested(result.ok);
        if (!result.ok) setError(result.message);
      })
      .catch((reason) => {
        setTesting(false);
        setError(String(reason).replace(/^Error:\s*/i, ''));
      });
  };

  const isRecognition = activeTab === 'recognition';
  const isGeneration = activeTab === 'generation';
  const isSpeech = activeTab === 'speech';
  const isVideo = activeTab === 'video';
  const capabilityLabel = locale === 'zh'
    ? (isRecognition ? '图片识别' : isGeneration ? '图片生成' : isSpeech ? '语音生成' : '视频生成')
    : (isRecognition ? 'Image recognition' : isGeneration ? 'Image generation' : isSpeech ? 'Speech generation' : 'Video generation');

  return (
    <div className="transcription-settings-group image-settings-group">
      <header className="transcription-settings-header">
        <div>
          <h2>{locale === 'zh' ? '多模态模型' : 'Multimodal models'}</h2>
          <p>
            {locale === 'zh'
              ? '分别配置图片识别、图片生成、语音生成与视频生成服务，供相关技能按需调用。'
              : 'Configure image recognition, image generation, speech generation, and video generation for the skills that need them.'}
          </p>
        </div>
      </header>

      <nav className="transcription-tabs" aria-label={locale === 'zh' ? '多模态模型能力类型' : 'Multimodal model capability'}>
        <button type="button" className={isRecognition ? 'active' : ''} onClick={() => selectTab('recognition')}>
          <ScanSearch size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '图片识别' : 'Image recognition'}
        </button>
        <button type="button" className={isGeneration ? 'active' : ''} onClick={() => selectTab('generation')}>
          <ImagePlus size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '图片生成' : 'Image generation'}
        </button>
        <button type="button" className={isSpeech ? 'active' : ''} onClick={() => selectTab('speech')}>
          <AudioLines size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '语音生成' : 'Speech generation'}
        </button>
        <button type="button" className={isVideo ? 'active' : ''} onClick={() => selectTab('video')}>
          <Video size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '视频生成' : 'Video generation'}
        </button>
      </nav>

      <section className="transcription-api-settings image-api-settings">
        <div className="transcription-api-form">
          <label>
            <span>{capabilityLabel}{locale === 'zh' ? '服务' : ' service'}</span>
            <span className="transcription-provider-select">
              <SettingsSelect
                value={providerId}
                options={presets.map((provider) => ({ value: provider.id, label: provider.name[locale] }))}
                onChange={selectProvider}
                ariaLabel={locale === 'zh' ? `选择${capabilityLabel}服务` : `Choose ${capabilityLabel.toLowerCase()} service`}
              />
              {selectedProvider.website && (
                <button
                  type="button"
                  className="transcription-website-action"
                  onClick={() => void openExternalUrl(selectedProvider.website)}
                  aria-label={locale === 'zh' ? `打开${selectedProvider.name.zh}网站` : `Open ${selectedProvider.name.en} website`}
                >
                  <ExternalLink size={16} />
                </button>
              )}
            </span>
          </label>
          <label>
            <span>{capabilityLabel}{locale === 'zh' ? '模型' : ' model'}</span>
            <input
              value={model}
              onChange={(event) => { setModel(event.target.value); setTested(false); }}
              placeholder={locale === 'zh' ? `输入${capabilityLabel}模型 ID` : `Enter a ${capabilityLabel.toLowerCase()} model ID`}
              spellCheck={false}
            />
          </label>
          {isSpeech && (
            <label>
              <span>{locale === 'zh' ? '声音 ID' : 'Voice ID'}</span>
              <input
                value={voice}
                onChange={(event) => { setVoice(event.target.value); setTested(false); }}
                placeholder="alloy"
                spellCheck={false}
              />
            </label>
          )}
          <label>
            <span>{locale === 'zh' ? 'API 地址' : 'API URL'}</span>
            <input value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setTested(false); }} placeholder="https://…" spellCheck={false} />
          </label>
          <label>
            <span>{locale === 'zh' ? 'API Key' : 'API key'}</span>
            <input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setTested(false); }} placeholder={locale === 'zh' ? '输入后保存在本机' : 'Stored on this device'} spellCheck={false} />
          </label>
        </div>

        <div className="transcription-api-footer">
          {error && <p className="transcription-api-error" role="alert">{error}</p>}
          <button type="button" className="transcription-test-action" disabled={testing || !endpoint.trim() || !model.trim() || !apiKey.trim()} onClick={testConnection}>
            {testing
              ? (locale === 'zh' ? '检查中…' : 'Checking…')
              : tested
                ? (locale === 'zh' ? `${capabilityLabel}可用` : `${capabilityLabel} available`)
                : (locale === 'zh' ? '检查配置' : 'Check configuration')}
          </button>
        </div>
      </section>
    </div>
  );
}

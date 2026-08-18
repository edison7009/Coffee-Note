import { AudioLines, ExternalLink, ImagePlus, Music2, ScanSearch, Video, Waves } from 'lucide-react';
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
  models?: string[];
  modelRequired?: boolean;
  website: string;
  apiKeyLabel?: Record<Locale, string>;
  secondaryApiKeyLabel?: Record<Locale, string>;
  voice?: string;
}

const RECOGNITION_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    protocol: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-5.6',
    models: ['gpt-5.6'],
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: { zh: 'Google Gemini', en: 'Google Gemini' },
    protocol: 'openai-compatible',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.7-flash',
    models: ['gemini-3.7-flash', 'gemini-3.1-pro-preview'],
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
    models: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: { zh: 'Google Gemini', en: 'Google Gemini' },
    protocol: 'gemini-interactions',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    model: 'gemini-3.1-flash-image',
    models: [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
      'gemini-2.5-flash-image',
    ],
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
    models: ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
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
    id: 'runway',
    name: { zh: 'Runway', en: 'Runway' },
    protocol: 'runway-video',
    endpoint: 'https://api.dev.runwayml.com/v1/image_to_video',
    model: 'gen4.5',
    models: [
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
    ],
    website: 'https://dev.runwayml.com/',
  },
  {
    id: 'byteplus',
    name: { zh: 'BytePlus / 火山引擎 Seedance', en: 'BytePlus / Volcano Engine Seedance' },
    protocol: 'byteplus-video',
    endpoint: 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks',
    model: 'dreamina-seedance-2-5-260628',
    models: [
      'dreamina-seedance-2-5-260628',
      'doubao-seedance-2-5-260628',
      'dreamina-seedance-2-0-260128',
      'seedance-1-5-pro-251215',
    ],
    website: 'https://docs.byteplus.com/en/docs/ModelArk/2607688',
  },
  {
    id: 'kling',
    name: { zh: '可灵 Kling', en: 'Kling AI' },
    protocol: 'kling-video',
    endpoint: 'https://api-singapore.klingai.com/v1/videos/text2video',
    model: 'kling-v3',
    models: ['kling-v3', 'kling-v3-omni', 'kling-v2-6'],
    website: 'https://kling.ai/document-api/guides/capability-map/video',
  },
  {
    id: 'tencent-hunyuan',
    name: { zh: '腾讯云 混元 / 优图', en: 'Tencent Cloud Hunyuan / Youtu' },
    protocol: 'tencent-tokenhub-video',
    endpoint: 'https://tokenhub.tencentmaas.com/v1/api/video/submit',
    model: 'hy-video-1.5',
    models: ['hy-video-1.5', 'yt-video-2.0', 'yt-video-fx', 'yt-video-humanactor'],
    website: 'https://cloud.tencent.com/document/product/1823/130081',
  },
  {
    id: 'tencent-pixverse',
    name: { zh: '腾讯云 PixVerse', en: 'Tencent Cloud PixVerse' },
    protocol: 'tencent-tokenhub-video',
    endpoint: 'https://tokenhub.tencentmaas.com/v1/wand/pixverse/text-to-video',
    model: 'pixverse-video-v6.0',
    models: ['pixverse-video-v6.0', 'pixverse-video-c1', 'pixverse-video-v5.6'],
    website: 'https://cloud.tencent.com/document/product/1823/135325',
  },
  {
    id: 'vertex',
    name: { zh: 'Google Vertex AI Veo', en: 'Google Vertex AI Veo' },
    protocol: 'vertex-video',
    endpoint: 'https://aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/global/publishers/google/models/MODEL_ID:predictLongRunning',
    model: 'veo-3.1-generate-001',
    models: ['veo-3.1-generate-001', 'veo-3.1-fast-generate-001'],
    website: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation',
    apiKeyLabel: { zh: 'OAuth Access Token', en: 'OAuth access token' },
  },
  {
    id: 'minimax',
    name: { zh: 'MiniMax / 海螺', en: 'MiniMax / Hailuo' },
    protocol: 'minimax-video',
    endpoint: 'https://api.minimax.io/v2/video_generation',
    model: 'MiniMax-H3',
    models: ['MiniMax-H3'],
    website: 'https://platform.minimax.io/docs/api-reference/video-generation-v2-create',
  },
  {
    id: 'luma',
    name: { zh: 'Luma Ray', en: 'Luma Ray' },
    protocol: 'luma-video',
    endpoint: 'https://agents.lumalabs.ai/v1/generations',
    model: 'ray-3.2',
    models: ['ray-3.2'],
    website: 'https://docs.agents.lumalabs.ai/guides/videos/generation/',
  },
  {
    id: 'vidu',
    name: { zh: 'Vidu', en: 'Vidu' },
    protocol: 'vidu-video',
    endpoint: 'https://api.vidu.com/ent/v2/text2video',
    model: 'viduq3-pro',
    models: ['viduq3-pro', 'viduq3-turbo', 'viduq2', 'viduq1'],
    website: 'https://platform.vidu.com/docs/text-to-video',
  },
  {
    id: 'pika',
    name: { zh: 'Pika', en: 'Pika' },
    protocol: 'pika-video',
    endpoint: 'https://api.dev.pika.art/v1/media/pika/pika-2.5/text-to-video',
    model: 'pika/pika-2.5/text-to-video',
    models: ['pika/pika-2.5/text-to-video'],
    website: 'https://dev.pika.art/models/pika/pika-2.5/text-to-video',
  },
  {
    id: 'wan',
    name: { zh: '阿里云 Wan', en: 'Alibaba Cloud Wan' },
    protocol: 'wan-video',
    endpoint: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    model: 'wan2.7-t2v',
    models: [
      'wan3.0-video',
      'wan2.7-t2v',
      'wan2.7-t2v-2026-06-12',
      'wan2.7-t2v-2026-04-25',
      'wan2.7-i2v',
      'wan2.7-i2v-2026-04-25',
      'wan2.7-r2v',
      'wan2.7-videoedit',
      'wan2.6-t2v',
      'wan2.6-i2v',
      'wan2.6-r2v',
      'wan2.5-t2v-preview',
      'wan2.2-t2v-plus',
      'happyhorse-1.1-t2v',
      'happyhorse-1.1-i2v',
      'happyhorse-1.1-r2v',
    ],
    website: 'https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference',
  },
  {
    id: 'ltx',
    name: { zh: 'LTX', en: 'LTX' },
    protocol: 'ltx-video',
    endpoint: 'https://api.ltx.io/v2/text-to-video',
    model: 'ltx-2-5-pro',
    models: ['ltx-2-5-pro', 'ltx-2-5-fast'],
    website: 'https://docs.ltx.io/models',
  },
  {
    id: 'adobe',
    name: { zh: 'Adobe Firefly Video', en: 'Adobe Firefly Video' },
    protocol: 'adobe-firefly-video',
    endpoint: 'https://firefly-api.adobe.io/v3/videos/generate-async',
    model: '',
    modelRequired: false,
    website: 'https://developer.adobe.com/firefly-services/docs/firefly-api/api/',
    apiKeyLabel: { zh: 'OAuth Access Token', en: 'OAuth access token' },
    secondaryApiKeyLabel: { zh: 'Adobe x-api-key', en: 'Adobe x-api-key' },
  },
  {
    id: 'openai',
    name: { zh: 'OpenAI Sora（2026-09-24 停用）', en: 'OpenAI Sora (ends Sep 24, 2026)' },
    protocol: 'openai-video',
    endpoint: 'https://api.openai.com/v1/videos',
    model: 'sora-2',
    models: ['sora-2', 'sora-2-pro'],
    website: 'https://developers.openai.com/api/docs/guides/video-generation',
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

const MUSIC_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'gemini',
    name: { zh: 'Google Lyria', en: 'Google Lyria' },
    protocol: 'gemini-music',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    model: 'lyria-3-pro-preview',
    models: ['lyria-3-pro-preview', 'lyria-3-clip-preview'],
    website: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'elevenlabs',
    name: { zh: 'ElevenLabs Music', en: 'ElevenLabs Music' },
    protocol: 'elevenlabs-music',
    endpoint: 'https://api.elevenlabs.io/v1/music',
    model: 'music_v2',
    models: ['music_v2', 'music_v1'],
    website: 'https://elevenlabs.io/app/developers/api-keys',
  },
  {
    id: 'minimax',
    name: { zh: 'MiniMax Music', en: 'MiniMax Music' },
    protocol: 'minimax-music',
    endpoint: 'https://api.minimax.io/v1/music_generation',
    model: 'music-3.0',
    models: ['music-3.0', 'music-2.6', 'music-cover'],
    website: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'custom-music',
    endpoint: '',
    model: '',
    website: '',
  },
];

const SOUND_PROVIDERS: ImageProviderPreset[] = [
  {
    id: 'elevenlabs',
    name: { zh: 'ElevenLabs Sound Effects', en: 'ElevenLabs Sound Effects' },
    protocol: 'elevenlabs-sound',
    endpoint: 'https://api.elevenlabs.io/v1/sound-generation',
    model: 'eleven_text_to_sound_v2',
    models: ['eleven_text_to_sound_v2'],
    website: 'https://elevenlabs.io/app/developers/api-keys',
  },
  {
    id: 'custom',
    name: { zh: '自定义服务', en: 'Custom service' },
    protocol: 'custom-sound',
    endpoint: '',
    model: '',
    website: '',
  },
];

function providerPresets(mode: ImageCapabilityMode): ImageProviderPreset[] {
  if (mode === 'recognition') return RECOGNITION_PROVIDERS;
  if (mode === 'generation') return GENERATION_PROVIDERS;
  if (mode === 'speech') return SPEECH_PROVIDERS;
  if (mode === 'video') return VIDEO_PROVIDERS;
  if (mode === 'music') return MUSIC_PROVIDERS;
  return SOUND_PROVIDERS;
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
      secondaryApiKey: '',
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
    music: defaultCapability('music'),
    sound: defaultCapability('sound'),
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
  const [secondaryApiKey, setSecondaryApiKey] = useState('');
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
    setSecondaryApiKey(active.secondaryApiKey ?? '');
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
      secondaryApiKey,
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
        music: mergeCapability(defaults.music, stored?.music),
        sound: mergeCapability(defaults.sound, stored?.sound),
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
  }, [activeTab, apiKey, endpoint, loaded, model, providerId, secondaryApiKey, voice]);

  useEffect(() => {
    if (!loaded) return undefined;
    return () => {
      if (pendingConfigRef.current) void persistImageSettings(pendingConfigRef.current);
    };
  }, [loaded]);

  const presets = providerPresets(activeTab);
  const selectedProvider = presets.find((provider) => provider.id === providerId) ?? presets[0];
  const modelOptions = selectedProvider.models ?? [];
  const visibleModelOptions = model && !modelOptions.includes(model)
    ? [model, ...modelOptions]
    : modelOptions;

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
    setSecondaryApiKey(stored?.secondaryApiKey ?? '');
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
  const isMusic = activeTab === 'music';
  const isSound = activeTab === 'sound';
  const capabilityLabel = locale === 'zh'
    ? (isRecognition ? '图片识别' : isGeneration ? '图片生成' : isSpeech ? '语音生成' : isVideo ? '视频生成' : isMusic ? '音乐生成' : '音效生成')
    : (isRecognition ? 'Image recognition' : isGeneration ? 'Image generation' : isSpeech ? 'Speech generation' : isVideo ? 'Video generation' : isMusic ? 'Music generation' : 'Sound effects generation');

  return (
    <div className="transcription-settings-group image-settings-group">
      <header className="transcription-settings-header">
        <div>
          <h2>{locale === 'zh' ? '多模态模型' : 'Multimodal models'}</h2>
          <p>
            {locale === 'zh'
              ? '分别配置图片识别、图片生成、语音生成、视频生成、音乐生成与音效生成服务，供相关技能按需调用。'
              : 'Configure image recognition, image generation, speech generation, video generation, music generation, and sound effects generation for the skills that need them.'}
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
        <button type="button" className={isMusic ? 'active' : ''} onClick={() => selectTab('music')}>
          <Music2 size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '音乐生成' : 'Music generation'}
        </button>
        <button type="button" className={isSound ? 'active' : ''} onClick={() => selectTab('sound')}>
          <Waves size={16} strokeWidth={1.8} />
          {locale === 'zh' ? '音效生成' : 'Sound effects'}
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
          {selectedProvider.modelRequired !== false && (
            <label>
              <span>{capabilityLabel}{locale === 'zh' ? '模型' : ' model'}</span>
              {visibleModelOptions.length > 0 ? (
                <SettingsSelect
                  value={model}
                  options={visibleModelOptions.map((modelId) => ({ value: modelId, label: modelId }))}
                  onChange={(nextModel) => { setModel(nextModel); setTested(false); }}
                  ariaLabel={locale === 'zh' ? `选择${capabilityLabel}模型` : `Choose ${capabilityLabel.toLowerCase()} model`}
                />
              ) : (
                <input
                  value={model}
                  onChange={(event) => { setModel(event.target.value); setTested(false); }}
                  placeholder={locale === 'zh' ? `输入${capabilityLabel}模型 ID` : `Enter a ${capabilityLabel.toLowerCase()} model ID`}
                  spellCheck={false}
                />
              )}
            </label>
          )}
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
            <span>{selectedProvider.apiKeyLabel?.[locale] ?? (locale === 'zh' ? 'API Key' : 'API key')}</span>
            <input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setTested(false); }} placeholder={locale === 'zh' ? '输入后保存在本机' : 'Stored on this device'} spellCheck={false} />
          </label>
          {selectedProvider.secondaryApiKeyLabel && (
            <label>
              <span>{selectedProvider.secondaryApiKeyLabel[locale]}</span>
              <input type="password" value={secondaryApiKey} onChange={(event) => { setSecondaryApiKey(event.target.value); setTested(false); }} placeholder={locale === 'zh' ? '输入后保存在本机' : 'Stored on this device'} spellCheck={false} />
            </label>
          )}
        </div>

        <div className="transcription-api-footer">
          {error && <p className="transcription-api-error" role="alert">{error}</p>}
          <button
            type="button"
            className="transcription-test-action"
            disabled={testing
              || !endpoint.trim()
              || (selectedProvider.modelRequired !== false && !model.trim())
              || !apiKey.trim()
              || Boolean(selectedProvider.secondaryApiKeyLabel && !secondaryApiKey.trim())}
            onClick={testConnection}
          >
            {testing
              ? (locale === 'zh' ? '检查中…' : 'Checking…')
              : tested
                ? (locale === 'zh' ? '配置完整' : 'Configuration complete')
                : (locale === 'zh' ? '检查配置' : 'Check configuration')}
          </button>
        </div>
      </section>
    </div>
  );
}

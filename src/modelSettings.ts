import type { ModelConfig, ModelProvider, ModelSettings, ProviderConfig } from './types';

const DEFAULT_ENDPOINTS: Record<ModelProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  anthropic: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' },
};

const emptyProviderConfig = (provider: ModelProvider): ProviderConfig => ({
  baseUrl: DEFAULT_ENDPOINTS[provider].baseUrl,
  model: DEFAULT_ENDPOINTS[provider].model,
  apiKey: '',
});

export function createEmptyModelSettings(): ModelSettings {
  return {
    activeProvider: 'openai',
    providers: {
      openai: emptyProviderConfig('openai'),
      anthropic: emptyProviderConfig('anthropic'),
    },
  };
}

export function migrateModelProvider(raw: unknown): ModelProvider {
  if (raw === 'anthropic') return 'anthropic';
  return 'openai';
}

function readProviderConfig(value: unknown, provider: ModelProvider): ProviderConfig {
  const fallback = DEFAULT_ENDPOINTS[provider];
  if (!value || typeof value !== 'object') return emptyProviderConfig(provider);
  const config = value as Record<string, unknown>;
  return {
    baseUrl:
      typeof config.baseUrl === 'string' && config.baseUrl.trim()
        ? config.baseUrl
        : fallback.baseUrl,
    model:
      typeof config.model === 'string' && config.model.trim() ? config.model : fallback.model,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
  };
}

export function normalizeModelSettings(value: unknown): ModelSettings {
  const empty = createEmptyModelSettings();
  if (!value || typeof value !== 'object') return empty;

  const stored = value as Record<string, unknown>;
  const activeProvider = migrateModelProvider(stored.activeProvider ?? stored.provider);
  if (stored.providers && typeof stored.providers === 'object') {
    const providers = stored.providers as Record<string, unknown>;
    return {
      activeProvider,
      providers: {
        openai: readProviderConfig(providers.openai, 'openai'),
        anthropic: readProviderConfig(providers.anthropic, 'anthropic'),
      },
    };
  }

  return {
    activeProvider,
    providers: {
      ...empty.providers,
      [activeProvider]: readProviderConfig(stored, activeProvider),
    },
  };
}

export function getActiveModelConfig(settings: ModelSettings): ModelConfig {
  return {
    provider: settings.activeProvider,
    ...settings.providers[settings.activeProvider],
  };
}

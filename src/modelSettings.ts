import type {
  ModelConfig,
  ModelSettings,
  ProviderConfig,
  ReasoningEffort,
} from './types';
import { defaultProtocolForProvider } from './modelCatalog';

const EMPTY_PROVIDER: ProviderConfig = {
  providerId: 'custom',
  name: 'Custom provider',
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  customModels: [],
  models: [],
  model: '',
};

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function configuredProviderModels(
  provider: Pick<ProviderConfig, 'models'>,
): string[] {
  return Array.from(new Set(
    provider.models
      .map((model) => model.trim())
      .filter(Boolean),
  ));
}

export function createEmptyModelSettings(): ModelSettings {
  return {
    activeProvider: '',
    reasoningEffort: 'medium',
    providers: {},
  };
}

function inferProviderId(key: string, baseUrl: string): string {
  const identity = `${key} ${baseUrl}`.toLowerCase();
  if (identity.includes('deepseek')) return 'deepseek';
  if (identity.includes('openrouter')) return 'openrouter';
  if (identity.includes('anthropic')) return 'anthropic';
  if (identity.includes('openai')) return 'openai';
  return key || 'custom';
}

function readProviderConfig(value: unknown, key: string): ProviderConfig | null {
  if (!value || typeof value !== 'object') return null;
  const config = value as Record<string, unknown>;
  const storedBaseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';
  const model = typeof config.model === 'string' ? config.model : '';
  const providerId = typeof config.providerId === 'string' && config.providerId.trim()
    ? config.providerId.trim()
    : inferProviderId(key, storedBaseUrl);
  const baseUrl = providerId === 'deepseek'
    && storedBaseUrl.trim().replace(/\/$/, '') === 'https://api.deepseek.com/anthropic'
    ? 'https://api.deepseek.com'
    : storedBaseUrl;
  const rawModels = config.models;
  const hasExplicitModelList = Array.isArray(rawModels);
  const configuredModels = hasExplicitModelList
    ? rawModels.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : [];
  const legacySeededDeepSeekModel = providerId === 'deepseek'
    && (key === 'openai' || key === 'anthropic')
    && model === 'deepseek-v4-flash';
  const models = Array.from(new Set(
    (hasExplicitModelList ? configuredModels : [model]).map((item) => item.trim()).filter(Boolean),
  )).filter((item) => !legacySeededDeepSeekModel || item !== 'deepseek-v4-flash');
  const storedCustomModels = Array.isArray(config.customModels)
    ? config.customModels
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const customModels = Array.from(new Set([
    ...storedCustomModels,
    ...(providerId.startsWith('custom-') && !Array.isArray(config.customModels) ? models : []),
  ]));
  const selectedModel = models.includes(model) ? model : models[0] || '';
  return {
    providerId,
    name: typeof config.name === 'string' && config.name.trim()
      ? config.name.trim()
      : providerId === 'custom' ? 'Custom provider' : providerId,
    protocol: defaultProtocolForProvider(providerId),
    baseUrl,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    customModels,
    models,
    model: selectedModel,
  };
}

function readReasoningEffort(value: unknown): ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORTS.has(value as ReasoningEffort)
    ? value as ReasoningEffort
    : 'medium';
}

function mergeDuplicateProviderConfigs(
  providers: Record<string, ProviderConfig>,
  requestedActive: string,
): { activeProvider: string; providers: Record<string, ProviderConfig> } {
  const groups = new Map<string, Array<[string, ProviderConfig]>>();
  for (const entry of Object.entries(providers)) {
    const providerId = entry[1].providerId;
    groups.set(providerId, [...(groups.get(providerId) || []), entry]);
  }

  const merged: Record<string, ProviderConfig> = {};
  let activeProvider = requestedActive;
  for (const entries of groups.values()) {
    const requestedEntry = entries.find(([key]) => key === requestedActive);
    const preferred = requestedEntry || entries.reduce((best, candidate) => {
      const score = ([, provider]: [string, ProviderConfig]) =>
        configuredProviderModels(provider).length * 100
        + Number(Boolean(provider.apiKey.trim())) * 10
        + Number(Boolean(provider.baseUrl.trim()));
      return score(candidate) > score(best) ? candidate : best;
    });
    const [, preferredConfig] = preferred;
    const preferredKey = preferredConfig.providerId;
    const models = Array.from(new Set(
      entries.flatMap(([, provider]) => configuredProviderModels(provider)),
    ));
    const customModels = Array.from(new Set(
      entries.flatMap(([, provider]) => provider.customModels),
    ));
    const model = [preferredConfig.model, ...entries.map(([, provider]) => provider.model)]
      .find((candidate) => models.includes(candidate)) || models[0] || '';
    const firstValue = (read: (provider: ProviderConfig) => string) =>
      read(preferredConfig).trim()
      || entries.map(([, provider]) => read(provider).trim()).find(Boolean)
      || '';

    merged[preferredKey] = {
      ...preferredConfig,
      name: firstValue((provider) => provider.name) || preferredConfig.providerId,
      protocol: defaultProtocolForProvider(preferredConfig.providerId),
      baseUrl: firstValue((provider) => provider.baseUrl),
      apiKey: firstValue((provider) => provider.apiKey),
      customModels,
      models,
      model,
    };
    if (entries.some(([key]) => key === requestedActive)) activeProvider = preferredKey;
  }

  if (!merged[activeProvider]) activeProvider = Object.keys(merged)[0] || '';
  return { activeProvider, providers: merged };
}

export function normalizeModelSettings(value: unknown): ModelSettings {
  const empty = createEmptyModelSettings();
  if (!value || typeof value !== 'object') return empty;
  const stored = value as Record<string, unknown>;

  if (stored.providers && typeof stored.providers === 'object') {
    const rawProviders = stored.providers as Record<string, unknown>;
    const providers = Object.fromEntries(
      Object.entries(rawProviders).flatMap(([key, rawConfig]) => {
        const config = readProviderConfig(rawConfig, key);
        return config ? [[key, config]] : [];
      }),
    );
    const requestedActive = typeof stored.activeProvider === 'string'
      ? stored.activeProvider
      : '';
    const merged = mergeDuplicateProviderConfigs(providers, requestedActive);
    return {
      activeProvider: merged.activeProvider,
      reasoningEffort: readReasoningEffort(stored.reasoningEffort),
      providers: merged.providers,
    };
  }

  // v1 stored one protocol configuration at the top level.
  const protocol = stored.provider === 'anthropic' ? 'anthropic' : 'openai';
  const config = readProviderConfig(stored, protocol);
  if (!config) return empty;
  return {
    activeProvider: protocol,
    reasoningEffort: 'medium',
    providers: { [protocol]: config },
  };
}

export function getActiveModelConfig(settings: ModelSettings): ModelConfig {
  const config = settings.providers[settings.activeProvider] || EMPTY_PROVIDER;
  const models = configuredProviderModels(config);
  const model = models.includes(config.model) ? config.model : '';
  return {
    ...config,
    models,
    model,
    provider: config.protocol,
    providerKey: settings.activeProvider,
    reasoningEffort: settings.reasoningEffort,
  };
}

export function configuredModelChoices(settings: ModelSettings): Array<{
  providerKey: string;
  provider: ProviderConfig;
  model: string;
}> {
  return Object.entries(settings.providers).flatMap(([providerKey, provider]) =>
    configuredProviderModels(provider).map((model) => ({ providerKey, provider, model })),
  );
}

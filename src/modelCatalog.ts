import type {
  ModelCatalog,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelProtocol,
  ReasoningEffort,
} from './types';

// Provider logos are bundled with the app (public/providers/{id}.svg) and
// served from the same origin as the UI; nothing loads from models.dev.
const PROVIDER_LOGO_ROOT = '/providers';

const OFFICIAL_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
};

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function readReasoningOptions(value: unknown): ReasoningEffort[] {
  if (!Array.isArray(value)) return [];
  const effort = value
    .map(asRecord)
    .find((option) => option?.type === 'effort');
  if (!effort || !Array.isArray(effort.values)) return [];
  return effort.values.filter(
    (item): item is ReasoningEffort =>
      typeof item === 'string' && REASONING_EFFORTS.has(item as ReasoningEffort),
  );
}

function normalizeModel(key: string, value: unknown): ModelCatalogModel | null {
  const model = asRecord(value);
  if (!model) return null;
  const cost = asRecord(model.cost);
  const limit = asRecord(model.limit);
  return {
    id: typeof model.id === 'string' ? model.id : key,
    name: typeof model.name === 'string' ? model.name : key,
    family: typeof model.family === 'string' ? model.family : undefined,
    reasoning: model.reasoning === true,
    reasoningOptions: readReasoningOptions(model.reasoning_options),
    toolCall: model.tool_call === true,
    attachment: model.attachment === true,
    status: typeof model.status === 'string' ? model.status : undefined,
    releaseDate: typeof model.release_date === 'string' ? model.release_date : undefined,
    cost: cost ? {
      input: optionalNumber(cost.input),
      output: optionalNumber(cost.output),
      cacheRead: optionalNumber(cost.cache_read),
      cacheWrite: optionalNumber(cost.cache_write),
      reasoning: optionalNumber(cost.reasoning),
    } : undefined,
    limit: limit ? {
      context: optionalNumber(limit.context),
      input: optionalNumber(limit.input),
      output: optionalNumber(limit.output),
    } : undefined,
  };
}

export function normalizeModelCatalog(value: unknown): ModelCatalog {
  const raw = asRecord(value);
  if (!raw) return {};

  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const provider = asRecord(value);
      const rawModels = provider && asRecord(provider.models);
      if (!provider || !rawModels) return [];
      const id = typeof provider.id === 'string' ? provider.id : key;
      const models = Object.fromEntries(
        Object.entries(rawModels).flatMap(([modelKey, modelValue]) => {
          const model = normalizeModel(modelKey, modelValue);
          return model ? [[model.id, model]] : [];
        }),
      );
      const normalized: ModelCatalogProvider = {
        id,
        name: typeof provider.name === 'string' ? provider.name : id,
        npm: typeof provider.npm === 'string' ? provider.npm : '',
        api: typeof provider.api === 'string' ? provider.api : OFFICIAL_ENDPOINTS[id],
        doc: typeof provider.doc === 'string' ? provider.doc : undefined,
        models,
      };
      return [[id, normalized]];
    }),
  );
}

export function supportedCatalogProviders(catalog: ModelCatalog): ModelCatalogProvider[] {
  return Object.values(catalog)
    .filter((provider) => provider.api || provider.id === 'openai' || provider.id === 'anthropic')
    .sort((left, right) => {
      const featured = ['openai', 'anthropic', 'deepseek', 'openrouter'];
      const leftRank = featured.indexOf(left.id);
      const rightRank = featured.indexOf(right.id);
      if (leftRank >= 0 || rightRank >= 0) {
        if (leftRank < 0) return 1;
        if (rightRank < 0) return -1;
        return leftRank - rightRank;
      }
      return left.name.localeCompare(right.name);
    });
}

export function defaultProtocolForProvider(providerId: string): ModelProtocol {
  return providerId === 'anthropic' ? 'anthropic' : 'openai';
}

export function defaultEndpointForProvider(provider: ModelCatalogProvider): string {
  return OFFICIAL_ENDPOINTS[provider.id] || provider.api || '';
}

export function providerLogoUrl(providerId: string): string {
  return `${PROVIDER_LOGO_ROOT}/${encodeURIComponent(providerId)}.svg`;
}

export function getCatalogModel(
  catalog: ModelCatalog,
  providerId: string,
  modelId: string,
): ModelCatalogModel | undefined {
  return catalog[providerId]?.models[modelId];
}

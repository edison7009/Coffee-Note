import type {
  TranscriptionResourceStatus,
  TranscriptionSettingsConfig,
} from './types';

export type TranscriptionMode = 'api' | 'local';

export type TranscriptionAvailability = Record<TranscriptionMode, boolean>;

export function transcriptionAvailability(
  config: TranscriptionSettingsConfig | null,
  resources: TranscriptionResourceStatus[],
): TranscriptionAvailability {
  const provider = config?.providers?.[config.activeProvider];
  const api = Boolean(
    provider?.apiKey.trim()
    && provider.endpoint.trim()
    && provider.model.trim(),
  );
  const hasLocalSelection = Boolean(config?.activeRuntime.trim() && config.activeModel.trim());
  const local = hasLocalSelection
    && resources.some((resource) => (
      resource.kind === 'runtime'
      && resource.id === config?.activeRuntime
      && resource.installed
    ))
    && resources.some((resource) => (
      resource.kind === 'model'
      && resource.id === config?.activeModel
      && resource.installed
    ));
  return { api, local };
}

export const MY_INFO_RETRIEVAL_KEY = 'coffee-note:my-info-retrieval:v1';
export const MY_PRIORITIES_RETRIEVAL_KEY = 'coffee-note:my-priorities-retrieval:v1';

export const MY_INFO_SECTION_IDS = [
  'supplements',
  'exercise',
  'experience',
  'lessons',
  'sleep',
] as const;

export type MyInfoSectionId = (typeof MY_INFO_SECTION_IDS)[number];
export type MyInfoRetrievalState = Record<string, boolean> & Record<MyInfoSectionId, boolean>;

export const DEFAULT_MY_INFO_RETRIEVAL: MyInfoRetrievalState = {
  supplements: true,
  exercise: true,
  experience: true,
  lessons: true,
  sleep: true,
};

export function normalizeMyInfoRetrieval(value: unknown): MyInfoRetrievalState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_MY_INFO_RETRIEVAL };
  }
  const stored = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(stored)
      .filter(([id, enabled]) => id.startsWith('plans/') && typeof enabled === 'boolean')
      .map(([id, enabled]) => [id, enabled]),
  ) as MyInfoRetrievalState;
  for (const id of MY_INFO_SECTION_IDS) {
    normalized[id] = stored[id] === false ? false : true;
  }
  return normalized;
}

export function parseMyInfoRetrieval(value: string | null): MyInfoRetrievalState {
  if (!value) return { ...DEFAULT_MY_INFO_RETRIEVAL };
  try {
    return normalizeMyInfoRetrieval(JSON.parse(value));
  } catch {
    return { ...DEFAULT_MY_INFO_RETRIEVAL };
  }
}

export function enabledMyInfoSections(
  state: MyInfoRetrievalState,
  customPaths: readonly string[] = [],
): string[] {
  return [
    ...MY_INFO_SECTION_IDS.filter((id) => state[id]),
    ...customPaths.filter((path) => state[path] !== false),
  ];
}

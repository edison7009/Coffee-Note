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
export type MyInfoRetrievalState = Record<MyInfoSectionId, boolean>;

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
  return Object.fromEntries(
    MY_INFO_SECTION_IDS.map((id) => [id, stored[id] === false ? false : true]),
  ) as MyInfoRetrievalState;
}

export function parseMyInfoRetrieval(value: string | null): MyInfoRetrievalState {
  if (!value) return { ...DEFAULT_MY_INFO_RETRIEVAL };
  try {
    return normalizeMyInfoRetrieval(JSON.parse(value));
  } catch {
    return { ...DEFAULT_MY_INFO_RETRIEVAL };
  }
}

export function enabledMyInfoSections(state: MyInfoRetrievalState): MyInfoSectionId[] {
  return MY_INFO_SECTION_IDS.filter((id) => state[id]);
}

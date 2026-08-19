const STORAGE_PREFIX = 'tiernote:';
const LEGACY_STORAGE_PREFIX = 'coffee-note:';
const STORAGE_MIGRATION_MARKER = `${STORAGE_PREFIX}storage-migration:v1`;

export function migrateLegacyStorage(): void {
  if (window.localStorage.getItem(STORAGE_MIGRATION_MARKER) === 'complete') return;

  const legacyKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(key);
  }

  for (const legacyKey of legacyKeys) {
    const name = legacyKey.slice(LEGACY_STORAGE_PREFIX.length);
    const nextKey = `${STORAGE_PREFIX}${name}`;
    const value = window.localStorage.getItem(legacyKey);
    if (value !== null && window.localStorage.getItem(nextKey) === null) {
      window.localStorage.setItem(nextKey, value);
    }
    window.localStorage.removeItem(legacyKey);
  }

  window.localStorage.setItem(STORAGE_MIGRATION_MARKER, 'complete');
}

export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

export function readStorageValue(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeStorageValue(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

const STORAGE_PREFIX = 'coffee-note:';

export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

export function readStorageValue(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeStorageValue(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

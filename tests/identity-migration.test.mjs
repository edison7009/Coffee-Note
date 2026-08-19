import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const storage = await readFile(new URL('../src/storage.ts', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const config = JSON.parse(
  await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);

test('TierNote is the only current desktop and browser-storage identity', () => {
  assert.equal(config.identifier, 'app.tiernote.desktop');
  assert.deepEqual(config.bundle.externalBin, ['binaries/tiernote-video-ffmpeg']);
  assert.match(storage, /const STORAGE_PREFIX = 'tiernote:'/);
  assert.match(storage, /const LEGACY_STORAGE_PREFIX = 'coffee-note:'/);
});

test('legacy browser storage migrates before startup reads current settings', () => {
  assert.match(storage, /if \(value !== null && window\.localStorage\.getItem\(nextKey\) === null\)/);
  assert.match(storage, /window\.localStorage\.removeItem\(legacyKey\)/);
  assert.ok(
    main.indexOf('migrateLegacyStorage();') < main.indexOf('applyStartupTheme();'),
    'legacy storage must migrate before the startup theme is read',
  );
});

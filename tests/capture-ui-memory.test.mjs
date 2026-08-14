import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('the import dialog remembers its last speech recognition mode', () => {
  assert.match(
    appSource,
    /const CAPTURE_TRANSCRIPTION_MODE_KEY = storageKey\('capture-transcription-mode:v1'\)/,
  );
  assert.match(
    appSource,
    /useStoredState<TranscriptionMode>\(\s*CAPTURE_TRANSCRIPTION_MODE_KEY,\s*'api',\s*\)/s,
  );
  assert.match(appSource, /onChange=\{\(\) => setTranscriptionMode\('local'\)\}/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('the import dialog remembers its last speech recognition mode', () => {
  assert.match(
    appSource,
    /const CAPTURE_TRANSCRIPTION_MODE_KEY = storageKey\('capture-transcription-mode:v1'\)/,
  );
  assert.match(
    appSource,
    /useStoredState<TranscriptionMode>\(\s*CAPTURE_TRANSCRIPTION_MODE_KEY,\s*'api',\s*\)/s,
  );
  assert.match(appSource, /onChange=\{\(\) => setTranscriptionMode\(mode\)\}/);
});

test('the import dialog only offers configured transcription modes', () => {
  assert.match(appSource, /loadTranscriptionConfig\(\)/);
  assert.match(appSource, /listTranscriptionResources\(\)/);
  assert.match(appSource, /const onlyConfiguredMode = configuredModes\.length === 1/);
  assert.match(appSource, /disabled=\{onlyConfiguredMode === mode\}/);
  assert.match(appSource, /captureConfigureTranscriptionApi/);
  assert.match(appSource, /captureConfigureTranscriptionLocal/);
  assert.match(appSource, /setSettingsSection\('transcription'\)/);
  assert.match(appSource, /resourcesResult\.status === 'fulfilled' \? resourcesResult\.value : \[\]/);
});

test('the import dialog radio controls follow the selected surface scheme', () => {
  assert.match(
    css,
    /\.capture-transcription-choice input\s*\{[^}]*appearance:\s*none;[^}]*background:\s*var\(--tertiary-surface\);[^}]*border:\s*1px solid color-mix\(in srgb, var\(--ink\) 38%, var\(--tertiary-surface\)\);/s,
  );
  assert.match(
    css,
    /\.capture-dialog \.capture-transcription-choice input:checked\s*\{[^}]*background:\s*radial-gradient\([^}]*var\(--switch-on\) 0 3px,[^}]*var\(--tertiary-surface\) 3\.25px[^}]*border-color:\s*var\(--switch-on\);/s,
  );
  assert.doesNotMatch(css, /\.capture-dialog \.capture-transcription-choice input:checked\s*\{[^}]*box-shadow:/s);
});

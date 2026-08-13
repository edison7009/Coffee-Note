import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('all editable text inputs share the desktop text context menu', () => {
  assert.match(appSource, /function TextInputContextMenu\(\{ locale \}: \{ locale: Locale \}\)/);
  assert.match(appSource, /document\.addEventListener\('contextmenu', open\)/);
  assert.match(appSource, /<TextInputContextMenu locale=\{locale\} \/>/);
  assert.match(appSource, /TEXT_INPUT_TYPES = new Set\(\['text', 'search', 'url', 'email', 'tel', 'password'\]\)/);
  assert.match(appSource, /event\.defaultPrevented/);
});

test('controlled text inputs receive native input events after context-menu edits', () => {
  assert.match(appSource, /input\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(appSource, /Object\.getOwnPropertyDescriptor\(prototype, 'value'\)/);
  assert.match(appSource, /const canEdit = !input\.readOnly/);
  assert.match(appSource, /readClipboardText\(\)/);
});

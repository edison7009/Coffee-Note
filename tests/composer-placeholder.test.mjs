import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const i18n = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('composer placeholder stays concise and visually quieter than entered text', () => {
  assert.match(i18n, /askPlaceholder: '写下想法，或让 AI 帮你整理…'/);
  assert.match(i18n, /askPlaceholder: 'Write a thought, or let AI organize it…'/);
  assert.match(styles, /\.composer textarea\s*\{[^}]*font-size:\s*16px/s);
  assert.match(styles, /\.composer textarea::placeholder\s*\{[^}]*font-size:\s*14px/s);
});

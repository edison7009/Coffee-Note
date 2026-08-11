import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('main and contextual rail use a softer content ink than the navigation shell', () => {
  assert.match(css, /--accent:\s*#3a3b3d;/);
  assert.match(css, /:root\[data-theme='dark'\]\s*\{[^}]*--accent:\s*#c7c7c7;/s);
  assert.match(css, /\.main-pane,\s*\.right-rail\s*\{\s*--ink:\s*var\(--accent\);/s);
  assert.doesNotMatch(css, /--content-ink:/);
  assert.match(css, /\.tier-items button\s*\{[^}]*color:\s*var\(--ink\);/s);
  assert.match(css, /\[data-theme='dark'\] \.tier-items button\s*\{\s*color:\s*var\(--ink\);/s);
  assert.match(css, /\.message-content\s*\{[^}]*color:\s*var\(--ink\);/s);
  assert.match(css, /\[data-theme='dark'\] \.message-content,[\s\S]*?color:\s*var\(--ink\);/s);
});

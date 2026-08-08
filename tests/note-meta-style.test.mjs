import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('note paths and note actions share the same metadata typography', () => {
  assert.match(
    css,
    /\.note-path,\s*\.note-action\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*13px;[^}]*font-weight:\s*550;/s,
  );
});

test('dark theme keeps note paths and note actions on one muted color rule', () => {
  assert.match(
    css,
    /\[data-theme='dark'\]\s+\.note-path,\s*\[data-theme='dark'\]\s+\.note-action\s*\{[^}]*color:\s*var\(--muted\);/s,
  );
});

test('priority picker uses compact neutral menu states without hover decoration', () => {
  assert.match(css, /\.tier-picker-menu\s*\{[^}]*width:\s*176px;/s);
  assert.match(
    css,
    /\.large-tier\.tier-picker-trigger:hover,\s*\.large-tier\.tier-picker-trigger\.open\s*\{\s*box-shadow:\s*none;\s*\}/s,
  );
  assert.match(
    css,
    /\.tier-picker-menu button:hover,\s*\.tier-picker-menu button\.active\s*\{[^}]*background:\s*var\(--accent-soft\);[^}]*border-color:\s*transparent;[^}]*box-shadow:\s*none;/s,
  );
});

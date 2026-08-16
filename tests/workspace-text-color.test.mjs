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

test('conversation selection follows the chosen surface scheme with regular text', () => {
  assert.match(
    css,
    /\.conversation-history-item:hover,[\s\S]*?\.conversation-history-item\.unread\s*\{\s*background:\s*color-mix\(in srgb, var\(--sidebar-surface\) 38%, var\(--canvas\)\);/s,
  );
  assert.match(
    css,
    /\[data-theme='dark'\] \.conversation-history-item:hover,[\s\S]*?\[data-theme='dark'\] \.conversation-history-item\.unread\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--sidebar-surface\) 38%, var\(--canvas\)\);/s,
  );
  assert.doesNotMatch(
    css,
    /\[data-theme='dark'\] \.conversation-history-item(?:\.active)?\s*>\s*button:first-child(?:\:hover[^,\s]*)?\s*\{[^}]*background:\s*var\(--accent-soft\);/s,
  );
  assert.match(
    css,
    /\.conversation-history-item strong\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*400;/s,
  );
  assert.match(
    css,
    /\.conversation-history-item small\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;/s,
  );
});

test('tier list dark surfaces remain transparent to the selected color scheme', () => {
  assert.match(
    css,
    /\.tier-map,\s*\[data-theme='dark'\] \.tier-map\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--secondary-surface\) 88%, transparent\);[^}]*border:\s*0;/s,
  );
  assert.match(
    css,
    /\.tier-items,\s*\[data-theme='dark'\] \.tier-items\s*\{[^}]*background:\s*transparent;/s,
  );
  assert.match(
    css,
    /\[data-theme='dark'\] \.tier-label\s*\{[^}]*var\(--tier-color\) 17%, var\(--paper\)/s,
  );
  assert.doesNotMatch(css, /\[data-theme='dark'\] \.tier-(?:map|row|label|items)\s*\{[^}]*(?:#1c1e1d|#252725|#363937|#383b39|rgba\(31, 33, 32)/s);
});

test('tier dragging uses the shared day and night interaction color', () => {
  assert.match(
    css,
    /\.tier-drag-placeholder\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--switch-on\) 28%, var\(--tertiary-surface\)\);/s,
  );
  assert.match(
    css,
    /\.tier-item-ghost\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--switch-on\) 28%, var\(--tertiary-surface\)\);/s,
  );
});

test('home entry cards and tier list use borderless color-block surfaces', () => {
  assert.match(css, /\.start-cards\s*\{[^}]*gap:\s*16px;/s);
  assert.match(
    css,
    /\.action-card,\s*\[data-theme='dark'\] \.action-card\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--shape-color\) 10%, var\(--paper\)\);[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
  );
  assert.match(
    css,
    /\.tier-row,\s*\[data-theme='dark'\] \.tier-row\s*\{[^}]*border-bottom:\s*0;/s,
  );
});

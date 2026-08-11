import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('pane resize handles use system blue by day and egg-yolk yellow at night', () => {
  assert.match(styles, /:root\s*\{[^}]*--pane-handle:\s*#007aff/s);
  assert.match(styles, /:root\[data-theme='dark'\]\s*\{[^}]*--pane-handle:\s*#e7be15/s);
  assert.match(styles, /\.panel-resizing-left \.pane-resizer-left span,[^{]*\.panel-resizing-right \.pane-resizer-right span\s*\{[^}]*background:\s*var\(--pane-handle\)/s);
});

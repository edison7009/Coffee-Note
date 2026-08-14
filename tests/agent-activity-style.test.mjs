import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('running agent activity uses one static theme-colored DeepSeek-style status line', () => {
  assert.match(
    css,
    /\.agent-turn-status\s*\{[^}]*height:\s*26px;[^}]*color:\s*var\(--switch-on\);[^}]*font-size:\s*14px;[^}]*line-height:\s*26px;/s,
  );
  assert.match(app, /locale === 'zh' \? '正在深入思考…' : 'Deep diving…'/);
  assert.doesNotMatch(css, /agent-activity-shimmer|activity-dot-spinner/);
  assert.doesNotMatch(app, /activity-dot-spinner/);
});

test('the active turn clock appears only after fifteen seconds', () => {
  assert.match(app, /elapsedSeconds >= 15/);
  assert.match(
    css,
    /\.agent-turn-status-clock\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*12px;[^}]*font-variant-numeric:\s*tabular-nums;/s,
  );
});

test('tool rows and conversation history use static aligned activity marks', () => {
  assert.match(app, /<Wrench size=\{13\} \/>/);
  assert.match(app, /className="conversation-history-working-dot"/);
  assert.match(
    css,
    /\.conversation-history-working-dot\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;[^}]*border-radius:\s*50%;[^}]*background:\s*var\(--switch-on\);/s,
  );
});

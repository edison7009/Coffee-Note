import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('running agent activity uses the theme-colored typewriter shimmer without a spinner', () => {
  assert.match(
    css,
    /\.agent-turn-status-shimmer\s*\{[^}]*background:\s*linear-gradient\([\s\S]*?var\(--agent-status-accent\)[\s\S]*?background-size:\s*225% 100%;[^}]*background-clip:\s*text;[^}]*animation:\s*agent-turn-status-shimmer 2\.4s linear infinite;/s,
  );
  assert.match(css, /\.agent-turn-status\s*\{[^}]*font-weight:\s*400;/s);
  assert.match(app, /AGENT_STATUS_VERBS/);
  assert.match(app, /AGENT_STATUS_GLYPHS/);
  assert.match(app, /setFrame\(\(value\) => \(value \+ 1\) % AGENT_STATUS_FRAMES\.length\)/);
  assert.match(app, /'Wrangling'/);
  assert.match(app, /'炮制'/);
  assert.match(app, /agent-turn-status-caret/);
  assert.match(app, /setTimeout\(\(\) => setPhase\('erase'\), 2800\)/);
  assert.match(app, /setShown\(\(value\) => value\.slice\(0, -1\)\), 45\)/);
  assert.match(app, /setShown\(target\.slice\(0, shown\.length \+ 1\)\), 70\)/);
  assert.match(css, /@keyframes agent-turn-status-shimmer\s*\{\s*to\s*\{\s*background-position:\s*0 0;/s);
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.agent-turn-status-shimmer,[\s\S]*?\.agent-turn-status-caret\s*\{[^}]*animation:\s*none;/s,
  );
  assert.doesNotMatch(css, /activity-dot-spinner/);
  assert.doesNotMatch(app, /activity-dot-spinner/);
});

test('the active turn clock appears only after fifteen seconds', () => {
  assert.match(app, /elapsedSeconds >= 15/);
  assert.match(
    css,
    /\.agent-turn-status-clock\s*\{[^}]*color:\s*var\(--muted\);[^}]*font-size:\s*12px;[^}]*font-variant-numeric:\s*tabular-nums;[^}]*-webkit-text-fill-color:\s*var\(--muted\);/s,
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

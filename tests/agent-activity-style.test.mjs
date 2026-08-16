import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('running agent activity follows the latest tool with neutral shimmer', () => {
  assert.match(
    css,
    /\.agent-turn-status-shimmer\s*\{[^}]*background:\s*linear-gradient\([\s\S]*?var\(--ink\)[\s\S]*?background-position:\s*200% center;[^}]*background-size:\s*200% 100%;[^}]*background-clip:\s*text;[^}]*animation:\s*agent-turn-status-shimmer 2\.4s linear infinite;/s,
  );
  assert.match(css, /\.agent-turn-status\s*\{[^}]*font-weight:\s*400;/s);
  assert.match(app, /formatAgentToolPhrase/);
  assert.match(app, /latestRunningTool/);
  assert.match(app, /toolName=\{latestRunningTool\}/);
  assert.match(app, /agent-turn-status-shimmer/);
  assert.match(app, /key=\{toolName\}/);
  assert.match(
    css,
    /@keyframes agent-turn-status-shimmer\s*\{\s*0%\s*\{\s*background-position:\s*200% center;[\s\S]*?100%\s*\{\s*background-position:\s*-200% center;/s,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.agent-turn-status-shimmer,[\s\S]*?\.agent-turn-status-caret\s*\{[^}]*animation:\s*none;/s,
  );
  assert.doesNotMatch(css, /activity-dot-spinner/);
  assert.doesNotMatch(app, /activity-dot-spinner/);
});

test('the active turn clock uses the muted tabular style', () => {
  assert.match(app, /formatAgentRunDuration\(elapsedSeconds, locale\)/);
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

test('conversation history gives titles the full row and overlays delete on hover', () => {
  assert.match(
    css,
    /\.conversation-history-item > button:first-child,[\s\S]*?\.conversation-history-rename\s*\{[^}]*padding:\s*8px 12px;/s,
  );
  assert.match(
    css,
    /\.conversation-history-delete,[\s\S]*?\.conversation-history-working\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*right:\s*5px;/s,
  );
  assert.match(
    css,
    /\.conversation-history-delete\s*\{[^}]*background:\s*var\(--tertiary-surface\);[^}]*opacity:\s*0;/s,
  );
  assert.match(
    css,
    /\.conversation-history-item:hover \.conversation-history-delete,[\s\S]*?\.conversation-history-item:focus-within \.conversation-history-delete\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
  );
  assert.match(
    css,
    /\.conversation-history-delete:hover:not\(:disabled\)\s*\{[^}]*background:\s*color-mix\(in srgb, #a33a3a 9%, var\(--tertiary-surface\)\);/s,
  );
  assert.doesNotMatch(
    css,
    /\.conversation-history-delete:hover:not\(:disabled\)\s*\{[^}]*background:[^;}]*transparent;/s,
  );
});

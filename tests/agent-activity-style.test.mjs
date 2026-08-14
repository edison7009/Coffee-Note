import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('running agent activity uses the same slow broad white shimmer in both themes', () => {
  assert.match(
    css,
    /\.tool-activity\.is-running \.tool-activity-label,[\s\S]*?--activity-shimmer-shoulder:\s*#c7c7cb;[\s\S]*?--activity-shimmer-peak:\s*#f5f5f7;[\s\S]*?background-size:\s*240% 100%;[\s\S]*?animation:\s*agent-activity-shimmer 3\.2s linear infinite;/,
  );
  assert.doesNotMatch(
    css,
    /\[data-theme='dark'\] \.tool-activity\.is-running \.tool-activity-label/,
  );
  assert.match(
    css,
    /@keyframes agent-activity-shimmer\s*\{\s*to\s*\{\s*background-position:\s*0 0;/s,
  );
});

test('reduced motion keeps agent activity readable and static', () => {
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.agent-thinking-label\s*\{[^}]*color:\s*var\(--muted\);[^}]*background:\s*none;[^}]*animation:\s*none;/s,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.activity-dot-spinner::before\s*\{[^}]*animation:\s*none;/s,
  );
});

test('running AI activity uses the shared Braille dot spinner everywhere', () => {
  assert.match(
    css,
    /\.activity-dot-spinner::before\s*\{[^}]*content:\s*'⠋';[^}]*animation:\s*activity-dot-spinner 900ms step-end infinite;/s,
  );
  assert.match(
    css,
    /@keyframes activity-dot-spinner\s*\{[\s\S]*?10%\s*\{\s*content:\s*'⠙';[\s\S]*?90%, 100%\s*\{\s*content:\s*'⠏';/s,
  );
  assert.equal((app.match(/className="activity-dot-spinner"/g) || []).length, 2);
  assert.match(app, /className="activity-dot-spinner conversation-history-spinner"/);
  assert.doesNotMatch(
    css,
    /\.conversation-history-item \.conversation-history-spinner\s*\{[^}]*border-top-color:/s,
  );
});

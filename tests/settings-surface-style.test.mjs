import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const settingsStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const transcriptionStyles = await readFile(new URL('../src/transcriptionSettings.css', import.meta.url), 'utf8');
const appearanceStyles = await readFile(new URL('../src/weather.css', import.meta.url), 'utf8');

function rule(styles, selector) {
  return styles.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('model settings use the workspace as their only page surface', () => {
  const section = rule(settingsStyles, "\\[data-theme='dark'\\] \\.settings-page \\.settings-section");
  const browser = rule(settingsStyles, '\\.settings-model-browser');

  assert.match(section, /background:\s*transparent/);
  assert.match(section, /border:\s*0/);
  assert.match(browser, /background:\s*transparent/);
  assert.doesNotMatch(browser, /border:\s*1px solid|border-radius/);
  assert.match(browser, /border-top:\s*1px solid var\(--line\)/);
});

test('transcription settings keep controls without nested cards or dividers', () => {
  const group = rule(transcriptionStyles, '\\.transcription-settings-group');
  const componentList = rule(transcriptionStyles, '\\.transcription-component-list');

  assert.match(group, /background:\s*transparent/);
  assert.match(group, /border:\s*0/);
  assert.match(componentList, /background:\s*transparent/);
  assert.match(componentList, /border:\s*0/);
  assert.doesNotMatch(componentList, /border-top:\s*1px solid|border-bottom:\s*1px solid/);
});

test('transcription API inputs use the shared surface and regular placeholder weight', () => {
  assert.match(
    transcriptionStyles,
    /\.transcription-api-form input,[\s\S]*?\.transcription-api-form select\s*\{[^}]*background:\s*var\(--control-surface\);[^}]*font-weight:\s*400;/s,
  );
  assert.match(
    transcriptionStyles,
    /\.transcription-api-form input::placeholder\s*\{[^}]*font-weight:\s*400;[^}]*opacity:\s*0\.58;/s,
  );
  assert.match(
    transcriptionStyles,
    /\.transcription-api-form input:-webkit-autofill[\s\S]*?\{[^}]*box-shadow:\s*0 0 0 1000px var\(--control-surface\) inset;/s,
  );
});

test('general and appearance settings share one continuous unframed surface', () => {
  const group = rule(appearanceStyles, '\\.settings-preferences-group');

  assert.match(group, /display:\s*grid/);
  assert.match(group, /gap:\s*48px/);
  assert.match(group, /background:\s*transparent/);
  assert.match(group, /border:\s*0/);
  assert.match(group, /border-radius:\s*0/);
  assert.match(appearanceStyles, /\.settings-preference-block \+ \.settings-preference-block\s*\{[^}]*border-top:\s*0/s);
});

test('appearance color scheme uses the shared selected background', () => {
  const hover = rule(settingsStyles, '\\.surface-scheme-card:hover');
  const selected = rule(
    settingsStyles,
    "\\.surface-scheme-card\\.active,\\s*\\[data-theme='dark'\\] \\.surface-scheme-card\\.active",
  );

  assert.match(hover, /background:\s*var\(--accent-soft\)/);
  assert.match(selected, /background:\s*var\(--accent-soft\)/);
  assert.doesNotMatch(selected, /background:\s*(?:#fff(?:fff)?|white|var\(--paper\))/i);
});

test('appearance color schemes use compact side-by-side swatches', () => {
  const preview = rule(settingsStyles, '\\.surface-scheme-preview');

  assert.match(preview, /width:\s*48px/);
  assert.match(preview, /height:\s*32px/);
  assert.match(preview, /border-radius:\s*4px/);
  assert.match(
    appSource,
    /linear-gradient\(90deg, \$\{scheme\.light\.canvas\} 0 50%, \$\{scheme\.dark\.canvas\} 50% 100%\)/,
  );
});

test('user message bubbles reuse the navigation surface in both themes', () => {
  const bubbleRules = [...settingsStyles.matchAll(/\.message\.user \.message-content\s*\{([^}]*)\}/g)]
    .map((match) => match[1]);

  assert.ok(
    bubbleRules.some((body) =>
      /background:\s*var\(--sidebar-surface\)/.test(body),
    ),
  );
});

test('all settings pages share the model page content width', () => {
  assert.match(
    settingsStyles,
    /\.settings-page \.settings-panel-model,[\s\S]*width:\s*min\(1120px, 100%\);/,
  );
  assert.match(
    settingsStyles,
    /\.settings-page \.settings-panel-skills,[\s\S]*\.settings-page \.settings-panel-transcription,[\s\S]*\.settings-page \.settings-panel-general,[\s\S]*\.settings-page \.settings-panel-appearance,[\s\S]*width:\s*min\(1120px, 100%\);/,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const settingsStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
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

test('transcription settings keep controls but remove nested page cards', () => {
  const group = rule(transcriptionStyles, '\\.transcription-settings-group');
  const componentList = rule(transcriptionStyles, '\\.transcription-component-list');

  assert.match(group, /background:\s*transparent/);
  assert.match(group, /border:\s*0/);
  assert.match(componentList, /background:\s*transparent/);
  assert.match(componentList, /border-top:\s*1px solid var\(--line\)/);
  assert.doesNotMatch(componentList, /border:\s*1px solid/);
});

test('appearance settings are one continuous unframed surface', () => {
  const group = rule(appearanceStyles, '\\.settings-appearance-group');

  assert.match(group, /display:\s*grid/);
  assert.match(group, /gap:\s*48px/);
  assert.match(group, /background:\s*transparent/);
  assert.match(group, /border:\s*0/);
  assert.match(group, /border-radius:\s*0/);
  assert.match(appearanceStyles, /\.settings-appearance-block \+ \.settings-appearance-block\s*\{[^}]*border-top:\s*0/s);
});

test('all settings pages share the model page content width', () => {
  assert.match(
    settingsStyles,
    /\.settings-page \.settings-panel-model,[\s\S]*width:\s*min\(1120px, 100%\);/,
  );
  assert.match(
    settingsStyles,
    /\.settings-page \.settings-panel-skills,[\s\S]*\.settings-page \.settings-panel-transcription,[\s\S]*\.settings-page \.settings-panel-appearance,[\s\S]*width:\s*min\(1120px, 100%\);/,
  );
});

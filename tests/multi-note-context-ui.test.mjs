import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('the library tree exposes an explicit multi-select mode', () => {
  assert.match(appSource, /className=\{`library-multi-select-btn\$\{multiSelectActive \? ' active' : ''\}`\}/);
  assert.match(appSource, /onClick=\{multiSelectActive \? onCancelMultiSelect : onToggleMultiSelect\}/);
  assert.match(appSource, /if \(multiSelectActive\) \{\s*onToggleContextNote\(entry\.relativePath, title\);/s);
  assert.match(appSource, /aria-pressed=\{multiSelectActive \? selected : undefined\}/);
  assert.match(cssSource, /\.tree-selection-check\s*\{/);
  assert.doesNotMatch(cssSource, /\.tree-child\.context-selected\s*\{/);
  assert.doesNotMatch(appSource, /tree-selection-box/);
});

test('selected notes replace the implicit open page context for agent requests', () => {
  assert.match(appSource, /contextPaths: selectedContextPaths\.length > 0\s*\? selectedContextPaths/s);
  assert.match(appSource, /noteSummary: selectedContextPaths\.length > 0 \? undefined : noteSummary\?\.text/);
  assert.match(appSource, /currentPage: selectedContextPaths\.length > 0 \? undefined : currentPageTitle/);
  assert.match(appSource, /\$\{firstTitle\}等\$\{selectedContextNotes\.length\}篇/);
  assert.match(appSource, /currentPage=\{composerContextLabel\}/);
});

test('multi-select controls meet the bilingual copy contract', () => {
  assert.match(i18nSource, /multiSelect: '多选'/);
  assert.match(i18nSource, /cancelMultiSelect: '取消'/);
  assert.match(i18nSource, /multiSelect: 'Multi-select'/);
  assert.match(i18nSource, /cancelMultiSelect: 'Cancel'/);
});

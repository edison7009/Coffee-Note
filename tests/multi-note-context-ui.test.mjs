import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('the library tree exposes an explicit multi-select mode', () => {
  assert.match(appSource, /className=\{`library-multi-select-btn\$\{multiSelectActive \? ' active' : ''\}`\}/);
  assert.match(appSource, /onClick=\{multiSelectActive \? onCancelMultiSelect : onToggleMultiSelect\}/);
  assert.match(appSource, /<ListChecks className="library-multi-select-icon" size=\{17\} strokeWidth=\{1\.9\} \/>/);
  assert.match(appSource, /className="library-switch-btn"[\s\S]*className=\{`library-multi-select-btn/s);
  assert.match(appSource, /locale === 'zh' \? '取消多选' : 'Cancel multi-select'/);
  assert.match(appSource, /locale === 'zh' \? '多选文章' : 'Select multiple notes'/);
  assert.doesNotMatch(appSource, /\{multiSelectActive \? t\('cancelMultiSelect'\) : t\('multiSelect'\)\}/);
  assert.match(appSource, /if \(multiSelectActive\) \{\s*onToggleContextNote\(entry\.relativePath, title\);/s);
  assert.match(appSource, /data-tree-is-dir="true"\s*onPointerDown=\{multiSelectActive \? undefined : \(event\) => beginTreePointerDrag\(event, entry\)\}/s);
  assert.match(appSource, /aria-pressed=\{multiSelectActive \? selected : undefined\}/);
  assert.match(cssSource, /\.tree-selection-check\s*\{[^}]*color:\s*var\(--switch-on\);/s);
  assert.match(cssSource, /\.library-multi-select-btn\.active\s*\{[^}]*color:\s*var\(--accent-contrast\);[^}]*background:\s*var\(--switch-on\);/s);
  assert.match(cssSource, /\.library-multi-select-icon\s*\{[^}]*transform:\s*scaleX\(-1\);/s);
  assert.doesNotMatch(cssSource, /\.tree-child\.context-selected\s*\{/);
  assert.doesNotMatch(appSource, /tree-selection-box/);
});

test('selected notes replace the implicit open page context for agent requests', () => {
  assert.match(appSource, /contextPaths: selectedContextPaths\.length > 0\s*\? selectedContextPaths\s*:\s*implicitContextEnabled \? implicitContextPaths : \[\]/s);
  assert.match(appSource, /noteSummary: selectedContextPaths\.length > 0 \|\| !implicitContextEnabled\s*\? undefined\s*:\s*noteSummary\?\.text/s);
  assert.match(appSource, /currentPage: selectedContextPaths\.length > 0 \|\| !implicitContextEnabled\s*\? undefined\s*:\s*currentPageTitle/s);
  assert.match(appSource, /\$\{firstTitle\}等\$\{selectedContextNotes\.length\}篇/);
  assert.match(appSource, /currentPage=\{composerContextLabel\}/);
});

test('article context uses a removable pill and clearing it changes the next request', () => {
  assert.match(appSource, /className="composer-context-pill"/);
  assert.match(appSource, /onClick=\{onClearCurrentPage\}/);
  assert.match(appSource, /<X size=\{13\} strokeWidth=\{2\.4\} \/>/);
  assert.match(appSource, /const dismissComposerContext = \(\) => \{\s*setImplicitContextDismissed\(true\);\s*if \(selectedContextNotes\.length > 0\) cancelMultiSelect\(\);/s);
  assert.match(appSource, /setImplicitContextDismissed\(false\);\s*\}, \[view, fileNotePath, selectedSupplement\?\.id, selectedPerson\?\.id, selectedStory\?\.id\]\);/s);
  assert.match(cssSource, /\.composer-context-pill\s*\{[^}]*height:\s*24px;[^}]*max-width:\s*min\(270px, 32vw\);[^}]*padding:\s*0 10px 0 8px;[^}]*color:\s*var\(--switch-on\);[^}]*background:\s*color-mix\(in srgb, var\(--switch-on\) 11%, transparent\);[^}]*border:\s*0;[^}]*font-weight:\s*400;/s);
  assert.doesNotMatch(cssSource, /\.composer-context-pill\s*\{[^}]*box-shadow:/s);
  assert.match(cssSource, /\.composer-context-pill:hover\s*\{[^}]*color:\s*var\(--switch-on\);[^}]*background:\s*color-mix\(in srgb, var\(--switch-on\) 17%, transparent\);/s);
  assert.match(cssSource, /\.composer-context-pill span\s*\{[^}]*display:\s*flex;[^}]*height:\s*16px;[^}]*align-items:\s*center;[^}]*line-height:\s*16px;/s);
  assert.doesNotMatch(appSource, /composer-page-chip/);
});

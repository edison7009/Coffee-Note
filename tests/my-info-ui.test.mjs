import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('the visible personal-context label is My Contexts', () => {
  assert.match(i18n, /myPlan: '我的设定'/);
  assert.match(i18n, /peopleCard: '我的设定'/);
  assert.match(i18n, /planTitle: '我的设定'/);
  assert.match(i18n, /myPlan: 'My Contexts'/);
  assert.doesNotMatch(i18n, /'我的资料'|'My information'/);
  assert.match(appSource, /'保存到我的设定'\s*:\s*'Save to My Contexts'/);
});

test('My Info explains that AI only retrieves enabled content', () => {
  assert.match(i18n, /planHint: 'AI只检索开关开启的内容，内容也可以是提示词、技能等。'/);
});

test('the five My Info documents expose independent accessible switches', () => {
  assert.match(appSource, /sections\.map\(\(section\) =>[\s\S]*?className="plan-retrieval-switch"/s);
  assert.match(appSource, /role="switch"/);
  assert.match(appSource, /aria-checked=\{retrievalState\[section\.id\]\}/);
  assert.match(appSource, /onClick=\{\(\) => onToggleRetrieval\(section\.id\)\}/);
  assert.doesNotMatch(appSource, /key="add"[\s\S]*?role="switch"/s);
  assert.match(appSource, /`AI 检索：\$\{section\.title\}`/);
  assert.match(appSource, /`AI retrieval for \$\{section\.title\}`/);
  assert.doesNotMatch(appSource, /retrievalState\[section\.id\] \? '关闭' : '开启'/);
});

test('default My Contexts card titles use English title case', () => {
  for (const title of ['My Resume', 'My Goals', 'My Experience', 'My Lessons', 'Key Records']) {
    assert.match(appSource, new RegExp(`'${title}'`));
  }
  assert.match(i18n, /addMaterial: 'Add Material'/);
  assert.doesNotMatch(appSource, /'My (resume|goals|experience|lessons)'|'Key records'/);
  assert.doesNotMatch(i18n, /addMaterial: 'Add material'/);
});

test('Key Records does not duplicate resume content in its description', () => {
  assert.match(appSource, /'项目、经历与值得回看的资料'/);
  assert.match(appSource, /'Projects, experiences, and useful reference'/);
  assert.doesNotMatch(appSource, /'简历、项目、经历与值得回看的资料'|'Resumes, projects, experiences, and useful reference'/);
});

test('My Info cards open directly without a selected-card state', () => {
  assert.match(appSource, /className="plan-section-card"[\s\S]*?onClick=\{\(\) => onSection\(section\.id\)\}/s);
  assert.doesNotMatch(appSource, /plan-section-card \$\{section\.id === activeSection/);
  assert.doesNotMatch(css, /\.plan-section-card\.active/);
  assert.match(css, /\.plan-section-grid > \.plan-section-card\s*\{[^}]*background:\s*var\(--control-surface\);/s);
});

test('agent requests include the enabled My Info section IDs', () => {
  assert.match(appSource, /enabledMyInfoSections: enabledMyInfoSections\(myInfoRetrieval\)/);
  assert.match(appSource, /view === 'file' && fileNoteSource === 'library' \? fileNotePath : undefined/);
});

test('enabled switches use the themed state without hover decoration', () => {
  assert.match(css, /\.plan-retrieval-switch\[aria-checked='true'\][^{]*\{[^}]*background:\s*var\(--switch-on\);/s);
  assert.match(css, /\.plan-retrieval-switch\[aria-checked='true'\] > span\s*\{[^}]*background:\s*var\(--accent-contrast\);/s);
  assert.match(css, /--switch-on:\s*#007aff;/);
  assert.match(css, /\[data-theme='dark'\][^{]*\{[\s\S]*?--switch-on:\s*#e7be15;/s);
  assert.doesNotMatch(css, /\.plan-retrieval-switch:hover/);
});

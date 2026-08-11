import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('file notes appear in the starred shortcut list and reopen through file navigation', () => {
  assert.match(
    appSource,
    /if \(target\.kind === 'file'\) \{\s*openFileNote\(target\.id\);\s*return;/s,
  );
  assert.match(appSource, /else if \(favorite\.kind === 'file'\)/);
  assert.match(
    appSource,
    /library\.priorities\.find\(\(candidate\) => candidate\.filePath === favorite\.id\)/,
  );
  assert.match(appSource, /title: priority\?\.title \|\| planSection\?\.title \|\| fileName \|\| favorite\.id/);
});

test('the desktop UI uses Star wording and the requested empty-state guidance', () => {
  assert.match(i18nSource, /favorites: '星标'/);
  assert.match(i18nSource, /favoriteHint: '在标题下方点击星标，添加快捷列表。'/);
  assert.match(i18nSource, /favorites: 'Star'/);
  assert.doesNotMatch(i18nSource, /收藏/);
});

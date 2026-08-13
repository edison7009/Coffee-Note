import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('home navigation row exposes the shared library switch action', () => {
  assert.match(appSource, /<Sidebar[\s\S]*?onSwitchRoot=\{handleSwitchRoot\}/);
  assert.match(
    appSource,
    /<div className=\{`nav-home-row[^`]*`\}>[\s\S]*?<SidebarButton[\s\S]*?<button[^>]*className="nav-switch-root"[^>]*onClick=\{onSwitchRoot\}[^>]*aria-label=\{t\('menuSwitchRoot'\)\}/s,
  );
  assert.doesNotMatch(appSource, /className="nav-switch-root"[^>]*\stitle=/s);
  assert.doesNotMatch(appSource, /className="rail-global-action"/);
});

test('title bar uses the aligned wordmark without a duplicate logo', () => {
  const titlebarBrand = appSource.match(
    /<div className="titlebar-brand"[^>]*>([\s\S]*?)<\/div>/s,
  )?.[1];
  assert.ok(titlebarBrand, 'titlebar brand markup should exist');
  assert.match(titlebarBrand, /<strong>Coffee Note<\/strong>/);
  assert.doesNotMatch(titlebarBrand, /<img\b/);
  const chatEmptyHeading = appSource.match(
    /<div className="chat-empty-heading">([\s\S]*?)<\/div>/s,
  )?.[1];
  assert.ok(chatEmptyHeading, 'chat empty heading markup should exist');
  assert.doesNotMatch(chatEmptyHeading, /<img\b/);
});

test('title bar wordmark shares the navigation icon inset', () => {
  assert.match(css, /\.titlebar-leading\s*\{[^}]*padding-left:\s*23px;/s);
});

test('left navigation leaves breathing room above Home', () => {
  assert.match(css, /\.sidebar-scroll\s*\{[^}]*padding:\s*14px 12px 0;/s);
});

test('home row action uses the existing compact neutral icon treatment', () => {
  assert.match(
    css,
    /\.nav-switch-root\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  );
});

test('home row places library search immediately before the folder action', () => {
  assert.match(
    appSource,
    /<div className="nav-home-actions">[\s\S]*?className="nav-search-library"[\s\S]*?<Search size=\{17\} \/>[\s\S]*?className="nav-switch-root"[\s\S]*?<Folder size=\{17\} \/>/s,
  );
  assert.match(appSource, /onSearchLibrary=\{\(\) => setLibrarySearchOpen\(true\)\}/);
  assert.doesNotMatch(appSource, /className="nav-search-library"[^>]*\stitle=/s);
});

test('sidebar footer fades the navigation into the fixed status area', () => {
  assert.match(css, /\.sidebar-footer\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;[^}]*padding:\s*3px 10px 10px;/s);
  assert.match(css, /\.sidebar-footer::before\s*\{[^}]*bottom:\s*100%;[^}]*height:\s*28px;[^}]*linear-gradient\(to bottom, transparent, var\(--sidebar-surface\)\)/s);
});

test('available update action sits between message status and settings in the sidebar footer', () => {
  const footer = appSource.match(/<div className="sidebar-footer">([\s\S]*?)<\/div>/s)?.[1];
  assert.ok(footer, 'sidebar footer markup should exist');
  assert.match(
    footer,
    /className="sidebar-status"[\s\S]*?<UpdateButton locale=\{locale\} \/>[\s\S]*?className="sidebar-settings-entry"/s,
  );
  assert.doesNotMatch(
    appSource,
    /<div className="window-controls">\s*<UpdateButton locale=\{locale\} \/>/s,
  );
  assert.match(css, /\.sidebar-update\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
});

test('library section divider has comfortable vertical breathing room', () => {
  assert.match(css, /\.nav-section-divider\s*\{[^}]*height:\s*1px;[^}]*margin:\s*10px 10px 8px;/s);
});

test('library root displays the selected directory name instead of a fixed translation', () => {
  assert.match(appSource, /function directoryDisplayName\(root: string\)/);
  assert.match(appSource, /const libraryLabel = directoryDisplayName\(root\) \|\| root;/);
  assert.match(appSource, /openContextMenu\(event, 'folder', '', libraryLabel\)/);
  assert.match(appSource, /<span>\{libraryLabel\}<\/span>/);
  assert.doesNotMatch(appSource, /t\('treeRoot'\)/);
  assert.doesNotMatch(i18nSource, /treeRoot:/);
});

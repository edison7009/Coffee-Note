import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const desktopCapabilities = readFileSync(
  new URL('../src-tauri/capabilities/default.json', import.meta.url),
  'utf8',
);

test('desktop brand link keeps the current production domain', () => {
  assert.match(appSource, /const PRODUCT_WEBSITE = 'https:\/\/note\.coffeecli\.com\/'/);
});

test('settings replaces the three-pane workspace instead of opening a modal', () => {
  assert.match(appSource, /settingsOpen\s*\?\s*\(\s*<SettingsPage/s);

  const settingsPage = appSource.slice(
    appSource.indexOf('function SettingsPage('),
    appSource.indexOf('function AddMaterialDialog('),
  );
  assert.doesNotMatch(settingsPage, /modal-backdrop|role="dialog"|aria-modal/);
  assert.match(styles, /\.settings-page\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*2;/s);
});

test('settings keeps model and appearance as separate navigation pages', () => {
  const settingsPage = appSource.slice(
    appSource.indexOf('function SettingsPage('),
    appSource.indexOf('function AddMaterialDialog('),
  );
  assert.match(appSource, /id:\s*'model'/);
  assert.match(appSource, /id: 'model', label: t\('settingsModel'\), icon: <Box size=\{18\}/);
  assert.match(appSource, /id:\s*'appearance'/);
  assert.match(appSource, /id: 'appearance', label: t\('settingsAppearance'\), icon: <Settings2 size=\{18\}/);
  assert.doesNotMatch(appSource, /id:\s*'library'/);
  assert.match(appSource, /className="settings-back"/);
  assert.doesNotMatch(appSource, /className="settings-sidebar-heading"/);
  assert.doesNotMatch(settingsPage, /settings-page-header|sectionDescription|settings-title/);
});

test('settings entry sits in the title-bar menu and uses a text label', () => {
  const menuStart = appSource.indexOf('<nav');
  const menuEnd = appSource.indexOf('</nav>', menuStart);
  const titlebarMenu = appSource.slice(menuStart, menuEnd);
  assert.match(titlebarMenu, /className=\{`titlebar-settings-entry/);
  assert.match(titlebarMenu, /'设置'\s*:\s*'Settings'/);
  assert.doesNotMatch(appSource, /className="titlebar-settings"/);
});

test('settings navigation rail stays compact', () => {
  assert.match(styles, /\.settings-page\s*\{[^}]*grid-template-columns:\s*220px minmax\(0, 1fr\);/s);
  assert.match(styles, /\.settings-sidebar-footer button\s*\{[^}]*white-space:\s*nowrap;/s);
});

test('custom provider entry keeps a stable row height while editing', () => {
  assert.match(styles, /\.settings-add-provider\s*\{[^}]*height:\s*36px;/s);
  assert.match(styles, /\.settings-custom-provider-form\s*\{[^}]*height:\s*36px;/s);
  assert.match(styles, /\.settings-custom-provider-form input\s*\{[^}]*height:\s*36px;/s);
});

test('desktop permissions allow destructive-action confirmation dialogs', () => {
  assert.match(desktopCapabilities, /"dialog:allow-message"/);
});

test('settings uses one continuous work surface without the contextual rail', () => {
  assert.match(styles, /\.settings-workspace\s*\{[^}]*background:\s*var\(--paper\);[^}]*border-top-left-radius:/s);
  assert.doesNotMatch(styles, /settings-library/);
});

test('desktop modal backdrops dim without blurring the workspace', () => {
  const modalBackdropRules = [...styles.matchAll(/\.modal-backdrop\s*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .join('\n');
  assert.doesNotMatch(modalBackdropRules, /backdrop-filter|filter:\s*blur/);
  assert.match(modalBackdropRules, /background:\s*rgba/);
});

test('settings scrollbars stay thin and low contrast', () => {
  assert.match(styles, /\.settings-workspace-scroll,[\s\S]*\.settings-provider-list\s*\{[^}]*scrollbar-color:[^}]*26%[^}]*scrollbar-width:\s*thin;/);
  assert.match(styles, /\.settings-workspace-scroll::\-webkit-scrollbar[\s\S]*width:\s*8px;/);
  assert.match(styles, /\.settings-workspace-scroll::\-webkit-scrollbar-thumb[\s\S]*border:\s*2px solid transparent;/);
});

test('provider model lists fully expand without an inner scroller or result cap', () => {
  const modelListRule = styles.match(/\.settings-model-list\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(modelListRule, /max-height|overflow-y|scrollbar/);
  assert.doesNotMatch(appSource, /\.slice\(0,\s*100\)/);
});

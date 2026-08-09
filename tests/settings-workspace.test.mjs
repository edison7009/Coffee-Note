import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

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
  assert.match(appSource, /id:\s*'model'/);
  assert.match(appSource, /id:\s*'appearance'/);
  assert.doesNotMatch(appSource, /id:\s*'library'/);
  assert.match(appSource, /className="settings-back"/);
  assert.doesNotMatch(appSource, /className="settings-sidebar-heading"/);
});

test('settings entry sits in the title-bar menu and uses a text label', () => {
  const menuStart = appSource.indexOf('<nav\n          ref={menuBarRef}');
  const menuEnd = appSource.indexOf('</nav>', menuStart);
  const titlebarMenu = appSource.slice(menuStart, menuEnd);
  assert.match(titlebarMenu, /className=\{`titlebar-settings-entry/);
  assert.match(titlebarMenu, /'设置'\s*:\s*'Settings'/);
  assert.doesNotMatch(appSource, /className="titlebar-settings"/);
});

test('settings uses one continuous work surface without the contextual rail', () => {
  assert.match(styles, /\.settings-workspace\s*\{[^}]*background:\s*var\(--paper\);[^}]*border-top-left-radius:/s);
  assert.doesNotMatch(styles, /settings-library/);
});

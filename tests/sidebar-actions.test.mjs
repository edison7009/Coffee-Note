import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('home navigation row exposes the shared library switch action', () => {
  assert.match(appSource, /<Sidebar[\s\S]*?onSwitchRoot=\{handleSwitchRoot\}/);
  assert.match(
    appSource,
    /<div className=\{`nav-home-row[^`]*`\}>[\s\S]*?<SidebarButton[\s\S]*?<button[^>]*className="nav-switch-root"[^>]*onClick=\{onSwitchRoot\}[^>]*aria-label=\{t\('menuSwitchRoot'\)\}/s,
  );
  assert.doesNotMatch(appSource, /className="nav-switch-root"[^>]*\stitle=/s);
  assert.doesNotMatch(appSource, /className="rail-global-action"/);
});

test('home row action uses the existing compact neutral icon treatment', () => {
  assert.match(
    css,
    /\.nav-switch-root\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  );
});

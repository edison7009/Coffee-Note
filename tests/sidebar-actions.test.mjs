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
  assert.match(css, /\.sidebar-scroll\s*\{[^}]*padding:\s*14px 12px 18px;/s);
});

test('home row action uses the existing compact neutral icon treatment', () => {
  assert.match(
    css,
    /\.nav-switch-root\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('composer exposes the catalog-backed skill picker and selected skill pill', () => {
  assert.match(appSource, /className=\{`composer-skill-trigger\$\{skillMenuOpen \? ' open' : ''\}`\}/);
  assert.match(appSource, /<Plus className="composer-skill-icon"/);
  assert.match(appSource, /className="composer-skill-pill"/);
  assert.match(appSource, /onClick=\{\(\) => onSelectedSkillChange\(null\)\}/);
  assert.match(appSource, /className="composer-skill-items"/);
  assert.doesNotMatch(appSource, /composer-skill-management|composer-skill-search|composer-skill-footer-action/);
});

test('skill categories reveal name and description entries on hover', () => {
  assert.match(appSource, /onMouseEnter=\{\(\) => \{[^}]*setActiveSkillGroupId\(group\.id\)/s);
  assert.match(appSource, /<strong>\{skill\.title\}<\/strong>/);
  assert.match(appSource, /<small>\{skill\.description\}<\/small>/);
  assert.match(appSource, /style=\{\{ top: `calc\(8px \+ \$\{activeSkillGroupIndex \* 36\}px\)` \}\}/);
  assert.match(cssSource, /\.composer-skill-popover\s*\{[^}]*bottom:\s*calc\(100% \+ 8px\)/s);
  assert.match(cssSource, /\.composer-skill-trigger\.open \.composer-skill-icon\s*\{[^}]*transform:\s*rotate\(45deg\)/s);
  assert.match(cssSource, /\.composer-skill-trigger\s*\{[^}]*height:\s*32px;/s);
  assert.match(cssSource, /\.composer\s*\{[^}]*padding:\s*4px 9px 9px;/s);
  assert.match(cssSource, /\.composer-skill-items\s*\{[^}]*left:\s*calc\(100% - 4px\)/s);
  assert.match(cssSource, /\.composer-skill-items\s*\{[^}]*width:\s*260px;[^}]*max-width:\s*32vw;/s);
  assert.doesNotMatch(cssSource, /\.composer-skill-management|\.composer-skill-search|\.composer-skill-footer-action/);
  assert.match(cssSource, /\.composer-preview-controls\s*\{[^}]*margin-left:\s*auto;/s);
  assert.doesNotMatch(cssSource, /\.composer-page-chip\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(cssSource, /\.composer-skill-trigger,\s*\.composer-skill-pill\s*\{[^}]*height:\s*32px;/s);
  assert.match(cssSource, /\.composer-skill-pill span\s*\{[^}]*line-height:\s*1;/s);
});

test('composer reads categories and skills from the shared catalog', () => {
  assert.match(appSource, /skillCatalog\.categories\.map\(\(group\)/);
  assert.match(appSource, /skillCatalog\.skills\.filter\(\(skill\) => skill\.categoryId === activeSkillGroup\?\.id\)/);
  assert.match(appSource, /skillId: selectedSkillId \|\| undefined/);
  assert.doesNotMatch(appSource, /expert-manager|cloudstudio-deploy/);
});

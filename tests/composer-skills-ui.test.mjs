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
  assert.match(appSource, /className="composer-skill-management"/);
  assert.doesNotMatch(appSource, /composer-skill-search|composer-skill-footer-action/);
});

test('skill categories reveal name and description entries on hover', () => {
  assert.match(appSource, /onMouseEnter=\{\(\) => \{[^}]*setActiveSkillGroupId\(group\.id\)/s);
  assert.match(appSource, /<strong>\{skill\.title\}<\/strong>/);
  assert.match(appSource, /<small>\{skill\.description\}<\/small>/);
  assert.match(appSource, /style=\{\{ bottom: `calc\(100% - \$\{42 \+ activeSkillGroupIndex \* 36\}px\)` \}\}/);
  assert.match(cssSource, /\.composer-skill-popover\s*\{[^}]*bottom:\s*calc\(100% \+ 8px\)/s);
  assert.match(cssSource, /\.composer-skill-trigger\.open \.composer-skill-icon\s*\{[^}]*transform:\s*rotate\(45deg\)/s);
  assert.match(cssSource, /\.composer-skill-trigger\s*\{[^}]*height:\s*32px;/s);
  assert.match(cssSource, /\.composer\s*\{[^}]*padding:\s*7px 9px 8px;/s);
  assert.match(cssSource, /\.composer-skill-items\s*\{[^}]*left:\s*calc\(100% - 4px\)/s);
  assert.match(cssSource, /\.composer-skill-items\s*\{[^}]*width:\s*260px;[^}]*max-width:\s*32vw;/s);
  assert.match(cssSource, /\.composer-skill-items\s*\{[^}]*max-height:\s*352px;[^}]*overflow-y:\s*auto;/s);
  assert.match(cssSource, /\.tier-scrollbar-slim\s*\{[^}]*width:\s*7px;/s);
  assert.match(cssSource, /\.tier-scrollbar-slim \.tier-scrollbar-slider\s*\{[^}]*width:\s*4px;/s);
  assert.match(appSource, /bindAutoHideScrollbar\(element, 450, true, 8\)/);
  assert.match(cssSource, /\.composer-skill-management\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s);
  assert.doesNotMatch(cssSource, /\.composer-skill-search|\.composer-skill-footer-action/);
  assert.match(cssSource, /\.composer-preview-controls\s*\{[^}]*margin-left:\s*auto;/s);
  assert.doesNotMatch(cssSource, /\.composer-context-pill\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(cssSource, /\.composer-skill-trigger,\s*\.composer-skill-pill\s*\{[^}]*height:\s*32px;/s);
  assert.match(cssSource, /\.composer-skill-pill\s*\{[^}]*height:\s*24px;/s);
  assert.match(cssSource, /\.composer-skill-pill span\s*\{[^}]*display:\s*flex;[^}]*height:\s*16px;[^}]*align-items:\s*center;[^}]*line-height:\s*16px;/s);
});

test('composer skill management opens the Skills settings page', () => {
  assert.match(appSource, /onOpenSkillSettings=\{\(\) => \{\s*setSettingsSection\('skills'\);\s*setSettingsOpen\(true\);/s);
  assert.match(appSource, /className="composer-skill-management"[\s\S]*setSkillMenuOpen\(false\);\s*onOpenSkillSettings\(\);/);
  assert.match(appSource, /locale === 'zh' \? '技能管理' : 'Manage skills'/);
  assert.match(appSource, /skillMenuOpen && !selectedSkill && \(/);
  assert.doesNotMatch(appSource, /skillMenuOpen && !selectedSkill && activeSkillGroup/);
  assert.match(appSource, /\{activeSkillGroup && \(\s*<div\s*ref=\{composerSkillItemsRef\}[\s\S]*?className="composer-skill-items"/s);
});

test('composer reads categories and skills from the shared catalog', () => {
  assert.match(appSource, /skillCatalog\.categories\.map\(\(group\)/);
  assert.match(appSource, /skillCatalog\.skills\.filter\(\s*\(skill\) => skill\.categoryId === activeSkillGroup\?\.id\s*&&\s*skill\.enabled,\s*\)/s);
  assert.match(appSource, /skillId: selectedSkillId \|\| undefined/);
  assert.doesNotMatch(appSource, /expert-manager|cloudstudio-deploy/);
});

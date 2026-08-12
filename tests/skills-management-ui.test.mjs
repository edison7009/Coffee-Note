import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api.ts', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../src/settings/SkillsSettings.tsx', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const rustSource = await readFile(new URL('../src-tauri/src/skills.rs', import.meta.url), 'utf8');
const agentSource = await readFile(new URL('../src-tauri/src/agent_loop.rs', import.meta.url), 'utf8');

test('settings includes a dedicated skills page backed by one shared catalog', () => {
  assert.match(appSource, /type SettingsSectionId = 'model' \| 'skills' \| 'transcription' \| 'appearance'/);
  assert.match(appSource, /<SkillsSettings/);
  assert.match(appSource, /listSkills\(\)/);
  assert.match(settingsSource, /技能管理/);
  assert.match(settingsSource, /catalog\.categories\.map/);
  assert.match(settingsSource, /visiblePlugins\.map/);
});

test('plugin source form only asks for Git address and category', () => {
  assert.match(settingsSource, /className="skills-editor skills-source-form"/);
  assert.match(settingsSource, /draft\.sourceUrl/);
  assert.match(settingsSource, /draft\.categoryId/);
  assert.match(settingsSource, /Git 仓库地址/);
  assert.match(settingsSource, /<SettingsSelect/);
  assert.doesNotMatch(settingsSource, /<select/);
  assert.doesNotMatch(settingsSource, /draft\.(title|description|instructions|version)/);
  assert.match(settingsSource, /编辑技能插件|Edit skill plugin/);
  assert.doesNotMatch(settingsSource, /modal-backdrop|aria-modal|title=|window\.confirm|plugin-dialog|askConfirmation/);
  assert.match(settingsSource, /安装技能后，可以完成更复杂、更具挑战的任务。/);
  assert.match(settingsSource, /Coffee Note 仅兼容 Codex 插件市场的技能安装方式。/);
  assert.match(cssSource, /\.skills-row\s*\{[^}]*grid-template-columns:\s*34px minmax\(0, 1fr\) auto;/s);
});

test('skill sources are cached once and metadata stays read only', () => {
  for (const command of [
    'list_skills',
    'add_skill_source',
    'update_skill_source',
    'delete_skill_source',
    'create_skill_category',
    'rename_skill_category',
    'delete_skill_category',
  ]) {
    assert.match(rustSource, new RegExp(`pub (?:async )?fn ${command}`));
  }
  assert.match(rustSource, /join\("SKILL\.md"\)/);
  assert.match(rustSource, /fn discover_package/);
  assert.match(rustSource, /fn package_manifest/);
  assert.match(rustSource, /fn is_valid_id/);
  assert.match(rustSource, /fn validate_git_url/);
  assert.doesNotMatch(rustSource, /write_skill_files|replace_skill_from_source/);
  assert.match(apiSource, /invoke<SkillCatalog>\('list_skills'\)/);
  assert.match(apiSource, /invoke<SkillCatalog>\('add_skill_source'/);
  assert.match(apiSource, /invoke<SkillCatalog>\('update_skill_source'/);
});

test('selected skill is loaded from its source and added to the request prompt', () => {
  assert.match(agentSource, /pub skill_id: Option<String>/);
  assert.match(agentSource, /pub skill_prompt: Option<String>/);
  assert.match(agentSource, /<selected_skill>/);
  assert.match(rustSource, /pub fn load_skill_prompt/);
});

test('every plugin row exposes read-only metadata with update and delete actions', () => {
  assert.match(settingsSource, /updateSkillFromSource\(plugin\.id\)/);
  assert.doesNotMatch(settingsSource, /className="skills-count"/);
  assert.doesNotMatch(cssSource, /\.skills-count\s*\{/);
  assert.match(settingsSource, /setUpdatedPluginNotice\(\{\s*pluginId: plugin\.id,/s);
  assert.match(
    settingsSource,
    /className="skills-row-actions">\s*\{updatedPluginNotice\?\.pluginId === plugin\.id[\s\S]*className="skills-row-notice"[\s\S]*onClick=\{\(\) => void refreshPlugin\(plugin\)\}/,
  );
  assert.match(cssSource, /\.skills-row-notice\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(settingsSource, /className="skills-version"/);
  assert.match(settingsSource, /更新中…/);
  assert.match(settingsSource, /<RefreshCw/);
  assert.match(settingsSource, /<Trash2/);
  assert.doesNotMatch(settingsSource, /startEditSkill|updateSkill\(/);
});

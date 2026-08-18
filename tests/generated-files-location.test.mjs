import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settings = readFileSync(
  new URL('../src/settings/GeneratedFilesSettings.tsx', import.meta.url),
  'utf8',
);
const generatedFiles = readFileSync(
  new URL('../src-tauri/src/generated_files.rs', import.meta.url),
  'utf8',
);
const tools = readFileSync(new URL('../src-tauri/src/agent_tools.rs', import.meta.url), 'utf8');

test('generated deliverables follow the current workspace and expose a General setting', () => {
  assert.doesNotMatch(generatedFiles, /dirs::desktop_dir\(\)/);
  assert.match(generatedFiles, /generated-files\.json/);
  assert.match(generatedFiles, /None => \(validate_directory\(workspace_root\.to_path_buf\(\)\)\?, true\)/);
  assert.match(generatedFiles, /uses_workspace_default/);
  assert.match(settings, /默认生成保存位置/);
  assert.match(settings, /当前工作区（默认）/);
  assert.match(settings, /chooseGeneratedFilesDirectory/);
  assert.match(settings, /saveGeneratedFilesDirectory\(null, workspaceRoot\)/);
  assert.match(app, /<GeneratedFilesSettings locale=\{locale\} workspaceRoot=\{workspaceRoot\} \/>/);
});

test('completed generation rows always render the full backend path', () => {
  assert.match(app, /generatedFileFromTool/);
  assert.match(app, /generatedFile\.path/);
  assert.match(app, /复制路径/);
  assert.match(app, /打开所在文件夹/);
  assert.match(app, /revealInFolder\(generatedFile\.path\)/);
});

test('document presentation and video tools use the configured output directory', () => {
  const outputLookups = tools.match(/generated_files::output_directory\(workspace_root\)/g) ?? [];
  assert.equal(outputLookups.length, 3);
  assert.match(tools, /create_presentation_in\(request, workspace_root, &output_root\)/);
  assert.match(tools, /create_video_in\(app, request, workspace_root, &output_root\)/);
  assert.match(tools, /create_document\(request, &output_root\)/);
});

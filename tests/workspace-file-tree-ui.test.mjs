import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

test('the workspace tree lists ordinary files instead of filtering to Markdown', () => {
  const listDirectory = backend.slice(
    backend.indexOf('fn list_directory('),
    backend.indexOf('fn create_folder(', backend.indexOf('fn list_directory(')),
  );
  assert.match(listDirectory, /if !is_dir && !path\.is_file\(\)/);
  assert.doesNotMatch(listDirectory, /if !is_dir && !is_markdown/);
  assert.match(listDirectory, /extension\.eq_ignore_ascii_case\("md"\)/);
  assert.match(listDirectory, /extension\.eq_ignore_ascii_case\("markdown"\)/);
});

test('visible and selected-file directories refresh when external files appear', () => {
  assert.match(app, /const entriesByDirRef = useRef<Record<string, DirectoryEntry\[\]>>\(\{\}\);/);
  assert.match(app, /const refreshPaths = new Set<string>\(\[''\]\);/);
  assert.match(app, /Object\.entries\(expandedRef\.current\)/);
  assert.match(app, /selectedContextPaths\.forEach\(\(filePath\) => refreshPaths\.add\(parentDirOf\(filePath\)\)\)/);
  assert.match(app, /refreshPaths\.forEach\(refreshDir\)/);
  assert.match(app, /window\.setInterval\(refreshLoadedDirectories, 2000\)/);
  assert.match(app, /window\.addEventListener\('focus', refreshLoadedDirectories\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
});

test('stale directory responses cannot overwrite a newly selected workspace', () => {
  assert.match(app, /const treeGenerationRef = useRef\(0\);/);
  assert.match(app, /const directoryRequestVersionRef = useRef\(new Map<string, number>\(\)\);/);
  assert.match(app, /const requestRoot = rootRef\.current;\s*const generation = treeGenerationRef\.current;/s);
  assert.match(
    app,
    /requestRoot !== rootRef\.current\s*\|\| generation !== treeGenerationRef\.current/s,
  );
  assert.match(app, /treeGenerationRef\.current = generation;/);
  assert.match(app, /root !== rootRef\.current\s*\|\| generation !== treeGenerationRef\.current/s);
  assert.match(app, /directoryRequestVersionRef\.current\.get\(dirPath\) !== requestVersion/);
});

test('single-click and multi-select both attach files to AI context', () => {
  assert.match(
    app,
    /const openLibraryTreeFile = \(path: string, title: string\) => \{[\s\S]*?openFileNote\(path, true, 'library'\);/,
  );
  assert.match(app, /if \(multiSelectActive\) \{\s*onToggleContextFile\(entry\.relativePath, title\);/s);
  assert.match(app, /contextPaths: selectedContextPaths\.length > 0/);
  assert.match(app, /\$\{firstTitle\} 等 \$\{selectedContextFiles\.length\} 个文件/);
  assert.match(app, /多选文件/);
});

test('deleted selected files are removed from the composer context', () => {
  assert.match(app, /const reconcileContextFiles = useCallback/);
  assert.match(app, /parentDirOf\(file\.path\) !== dirPath \|\| availableFiles\.has\(file\.path\)/);
  assert.match(app, /onDirectoryRefreshed\(dirPath, entries\)/);
  assert.match(app, /onDirectoryRefreshed=\{reconcileContextFiles\}/);
  assert.match(i18n, /部分已选文件已不存在，已从 AI 对话中移除。/);
});

test('non-Markdown files show a restrained unsupported-preview state', () => {
  assert.match(app, /function UnsupportedFileView\(/);
  assert.match(app, /filePreviewSupported && \(\s*<NoteView/s);
  assert.match(app, /!filePreviewSupported && \(\s*<UnsupportedFileView/s);
  assert.match(app, /if \(!isMarkdownFilePath\(filePath\)\) \{\s*setNoteMarkdown\(''\);\s*setNoteLoading\(false\);\s*return;/s);
  assert.match(i18n, /此文件无法在 TierNote 中预览。/);
  assert.match(i18n, /它已添加到下方 AI 对话/);
  assert.match(css, /\.unsupported-file-state\s*\{[^}]*min-height:\s*320px/s);
});

test('file context menus can attach files and open binaries in the system app', () => {
  assert.match(app, /menuAddToContext/);
  assert.match(app, /menuRemoveFromContext/);
  assert.match(app, /onToggleContext:\s*handleToggleContext/);
  assert.match(app, /onOpenExternally:\s*handleOpenExternally/);
  assert.match(app, /await openNote\(rootRef\.current, menu\.relativePath\)/);
  assert.match(i18n, /添加到 AI 对话/);
  assert.match(i18n, /使用系统应用打开/);
});

test('selected binary paths reach the agent without embedding binary contents', () => {
  assert.match(backend, /fn selected_workspace_files_context\(/);
  assert.match(backend, /SELECTED WORKSPACE FILES/);
  assert.match(backend, /Binary contents were not inserted into the prompt/);
  assert.match(backend, /unavailable; the file no longer exists or cannot be accessed/);
  assert.match(
    backend,
    /full_context\.push_str\(&selected_workspace_files_context\(\s*&knowledge_root,\s*&request\.context_paths,/s,
  );
});

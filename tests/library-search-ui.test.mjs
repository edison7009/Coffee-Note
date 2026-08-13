import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('library search stays local to the selected root and opens matching notes', () => {
  assert.match(appSource, /async function collectLibraryMarkdownFiles\(root: string\)/);
  assert.match(appSource, /entries = await listDirectory\(root, directory\)/);
  assert.match(appSource, /else if \(entry\.isMarkdown\)/);
  assert.match(appSource, /const content = await readNote\(root, file\.relativePath\)/);
  assert.match(appSource, /openFileNote\(relativePath, true, 'library'\)/);
  assert.doesNotMatch(appSource, /LibrarySearchDialog[\s\S]*?fetch\(/);
});

test('library search matches filenames, paths, and note content', () => {
  assert.match(appSource, /title\.includes\(clean\)/);
  assert.match(appSource, /path\.includes\(clean\)/);
  assert.match(appSource, /body\.includes\(clean\)/);
  assert.match(appSource, /\.slice\(0, 80\)/);
});

test('library search input follows desktop input and context-menu rules', () => {
  const searchDialog = appSource.slice(
    appSource.indexOf('function LibrarySearchDialog('),
    appSource.indexOf('function directoryDisplayName('),
  );
  assert.match(appSource, /<input[\s\S]*?type="search"[\s\S]*?placeholder=\{locale === 'zh' \? '搜索当前资料库'/s);
  assert.match(appSource, /<TextInputContextMenu locale=\{locale\} \/>/);
  assert.match(appSource, /const TEXT_INPUT_TYPES = new Set\(\['text', 'search'/);
  assert.match(css, /\.library-search-input-wrap\s*\{[^}]*background:\s*var\(--control-surface\);[^}]*border:\s*1px solid var\(--line\);/s);
  assert.match(css, /\.library-search-input-wrap input::placeholder\s*\{[^}]*font-weight:\s*400;/s);
  assert.doesNotMatch(searchDialog, /\stitle=/);
});

test('library search results use an unframed desktop list', () => {
  assert.match(css, /\.library-search-result\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
  assert.match(css, /\.library-search-result:hover,[\s\S]*?background:\s*var\(--control-hover\);/s);
  assert.match(css, /\.library-search-result strong\s*\{[^}]*font-size:\s*14px;/s);
  assert.match(css, /\.library-search-result small,[\s\S]*?font-size:\s*12px;/s);
});

test('library search results use the shared arrowless auto-hide scrollbar', () => {
  assert.match(appSource, /const resultsScrollRef = useAutoHideScrollbar<HTMLDivElement>\(\)/);
  assert.match(
    appSource,
    /<div ref=\{resultsScrollRef\} className="library-search-results auto-hide-scrollbar">/,
  );
  assert.match(css, /\.auto-hide-scrollbar::-webkit-scrollbar,[\s\S]*?width:\s*0 !important;/s);
  assert.match(css, /\.tier-scrollbar-slider\s*\{/);
});

test('library search keeps browsing rows compact and expands only for a query', () => {
  assert.match(appSource, /className=\{`library-search-result\$\{query\.trim\(\) \? ' has-query' : ''\}`\}/);
  assert.match(appSource, /\{query\.trim\(\) && \([\s\S]*?<small>/s);
  assert.doesNotMatch(appSource, /className="library-search-result-path"/);
  assert.match(appSource, /function searchResultDirectory\(relativePath: string\)/);
  assert.match(css, /\.library-search-result\s*\{[^}]*grid-template-columns:\s*18px minmax\(0, 1fr\) auto;[^}]*min-height:\s*42px;/s);
  assert.match(css, /\.library-search-result\.has-query\s*\{[^}]*min-height:\s*56px;/s);
});

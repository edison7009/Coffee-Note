import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const agentLoop = await readFile(new URL('../src-tauri/src/agent_loop.rs', import.meta.url), 'utf8');
const agentTools = await readFile(new URL('../src-tauri/src/agent_tools.rs', import.meta.url), 'utf8');
const backend = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

test('agent treats the selected directory as a general workspace', () => {
  assert.match(agentLoop, /general-purpose workspace agent/);
  assert.match(agentLoop, /Accept programming, debugging, writing/);
  assert.match(agentTools, /name: "list_workspace"/);
  assert.match(agentTools, /name: "read_workspace_file"/);
  assert.match(agentTools, /name: "write_workspace_file"/);
  assert.match(agentTools, /name: "replace_workspace_text"/);
  assert.doesNotMatch(agentTools, /\.unwrap_or\("inbox"\)/);
});

test('workspace UI never hides or bulk-deletes legacy note folders', () => {
  assert.doesNotMatch(appSource, /HIDDEN_ROOT_FOLDERS/);
  assert.doesNotMatch(appSource, /TRANSITIONAL_ROOT_FOLDERS/);
  assert.doesNotMatch(appSource, /onCleanup/);
});

test('quick capture saves to the selected workspace root without inbox metadata', () => {
  const capture = backend.slice(
    backend.indexOf('fn save_capture('),
    backend.indexOf('fn retrieve_context('),
  );
  assert.match(capture, /let mut path = root\.join/);
  assert.doesNotMatch(capture, /root\.join\("inbox"\)/);
  assert.doesNotMatch(capture, /status: inbox/);
});

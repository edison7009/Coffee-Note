import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeSource = await readFile(new URL('../src-tauri/src/dsh_runtime.rs', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const launcherSource = await readFile(new URL('../src-tauri/src/dsh_launcher.rs', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8');

test('Windows DSH startup re-enters through the hidden GUI launcher', () => {
  assert.match(runtimeSource, /const CREATE_NO_WINDOW:\s*u32\s*=\s*0x0800_0000;/);
  assert.match(runtimeSource, /\.arg\(dsh_launcher::SIDECAR_ARG\)/);
  assert.match(runtimeSource, /command\.creation_flags\(CREATE_NO_WINDOW\);/);
  assert.match(mainSource, /dsh_launcher::run_from_environment\(\)/);
  assert.match(launcherSource, /STARTF_USESTDHANDLES \| STARTF_USESHOWWINDOW/);
  assert.match(launcherSource, /startup\.wShowWindow = SW_HIDE as u16;/);
  assert.match(launcherSource, /CREATE_NO_WINDOW \| CREATE_SUSPENDED \| CREATE_UNICODE_ENVIRONMENT/);
  assert.match(launcherSource, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
});

test('the bundled DSH runtime prewarms once after launch and is shared with first send', () => {
  assert.match(runtimeSource, /static PREPARED_RUNTIME_ROOT:\s*OnceCell<PathBuf>/);
  assert.match(
    runtimeSource,
    /\.get_or_try_init\(\|\| async move \{[\s\S]*?resolve_runtime_root\(&app\)\.await[\s\S]*?\}\)/,
  );
  assert.match(appSource, /dsh_runtime::prepare_runtime\(dsh_app\)\.await/);
  assert.match(appSource, /DeepSeek Harness runtime prewarm failed/);
});

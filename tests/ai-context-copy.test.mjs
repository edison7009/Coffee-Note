import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('AI conversation context explains indexing of personal contexts and library files', () => {
  assert.match(appSource, /个人设定和目录内资料会被AI索引，更懂你的对话。/);
  assert.match(appSource, /Personal contexts and files in your library are indexed by AI/);
  assert.doesNotMatch(appSource, /把当前目标和相关资料交给 TierNote/);
});

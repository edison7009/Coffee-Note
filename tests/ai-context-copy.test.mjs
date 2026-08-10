import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('AI conversation context explains indexing of personal contexts and library files', () => {
  assert.match(i18nSource, /融合笔记、知识库与个人设定，这儿就是你的第二大脑/);
  assert.match(i18nSource, /Bring notes, knowledge, and personal settings together\. This is your second brain\./);
  assert.doesNotMatch(appSource, /把当前目标和相关资料交给 Coffee Note/);
});

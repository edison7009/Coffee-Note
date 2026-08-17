import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('AI chat card copy promotes creating copy, documents, PPTs, or videos', () => {
  assert.match(i18nSource, /创造新文案、生成文档、PPT或视频，帮你搞定！/);
  assert.match(i18nSource, /Create copy, documents, PPTs, or videos, done for you!/);
  assert.doesNotMatch(appSource, /把当前目标和相关资料交给 Coffee Note/);
});

test('media card English copy describes transcription rather than generic organizing', () => {
  assert.match(i18nSource, /collectCard:\s*'Media Transcription'/);
  assert.match(
    i18nSource,
    /collectCardSub:\s*'Transcribe short videos, audio, or files into editable text'/,
  );
  assert.doesNotMatch(i18nSource, /collectCard:\s*'Organize with AI'/);
});

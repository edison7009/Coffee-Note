import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const mediaManifest = await readFile(new URL('../src-tauri/builtin-plugins/tiernote-media/tiernote-plugin.json', import.meta.url), 'utf8');
const documentsManifest = await readFile(new URL('../src-tauri/builtin-plugins/tiernote-documents/tiernote-plugin.json', import.meta.url), 'utf8');
const presentationManifest = await readFile(new URL('../src-tauri/builtin-plugins/tiernote-presentation/tiernote-plugin.json', import.meta.url), 'utf8');
const videoManifest = await readFile(new URL('../src-tauri/builtin-plugins/tiernote-video/tiernote-plugin.json', import.meta.url), 'utf8');

test('note title actions select the matching built-in creation skill without sending', () => {
  assert.match(appSource, /const BUILTIN_DOCX_SKILL_ID = 'tiernote-document-create-docx'/);
  assert.match(appSource, /const BUILTIN_PDF_SKILL_ID = 'tiernote-document-create-pdf'/);
  assert.match(appSource, /const BUILTIN_PRESENTATION_SKILL_ID = 'tiernote-presentation-create'/);
  assert.match(appSource, /const BUILTIN_VIDEO_SKILL_ID = 'tiernote-video-create'/);
  assert.match(
    appSource,
    /onClick=\{\(\) => onSelectCreationSkill\(BUILTIN_DOCX_SKILL_ID\)\}/,
  );
  assert.match(
    appSource,
    /onClick=\{\(\) => onSelectCreationSkill\(BUILTIN_PDF_SKILL_ID\)\}/,
  );
  assert.match(
    appSource,
    /onClick=\{\(\) => onSelectCreationSkill\(BUILTIN_PRESENTATION_SKILL_ID\)\}/,
  );
  assert.match(
    appSource,
    /onClick=\{\(\) => onSelectCreationSkill\(BUILTIN_VIDEO_SKILL_ID\)\}/,
  );
  const shortcut = appSource.match(
    /const selectNoteCreationSkill = \(skillId: string\) => \{[\s\S]*?window\.requestAnimationFrame\(\(\) => chatComposerRef\.current\?\.focus\(\)\);\s*\};/,
  )?.[0] ?? '';
  assert.match(shortcut, /setSelectedSkillId\(skillId\)/);
  assert.doesNotMatch(shortcut, /handleSend|startAgentTurn|sendAgentMessage/);
});
test('mobile long image is removed instead of remaining as a disabled future action', () => {
  assert.doesNotMatch(appSource, /Smartphone|mobileLongImage|note-action-future/);
  assert.doesNotMatch(i18nSource, /mobileLongImage|手机长图|Mobile long image/);
  assert.doesNotMatch(cssSource, /note-action-future/);
});

test('English built-in skill labels distinguish every creation capability', () => {
  assert.match(appSource, /locale === 'en' \? skill\.titleEn \|\| skill\.title : skill\.title/);
  assert.match(mediaManifest, /"titleEn": "Media to text"/);
  assert.match(documentsManifest, /"titleEn": "Create DOCX"/);
  assert.match(documentsManifest, /"titleEn": "Create PDF"/);
  assert.match(presentationManifest, /"titleEn": "Create presentation"/);
  assert.match(videoManifest, /"titleEn": "Create video"/);
  assert.match(videoManifest, /"titleEn": "Cinematic storyboard director"/);
});

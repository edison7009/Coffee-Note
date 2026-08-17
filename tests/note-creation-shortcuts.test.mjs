import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18nSource = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

test('note title actions select the matching built-in creation skill without sending', () => {
  assert.match(appSource, /const BUILTIN_DOCX_SKILL_ID = 'coffee-note-document-create-docx'/);
  assert.match(appSource, /const BUILTIN_PDF_SKILL_ID = 'coffee-note-document-create-pdf'/);
  assert.match(appSource, /const BUILTIN_PRESENTATION_SKILL_ID = 'coffee-note-presentation-create'/);
  assert.match(appSource, /const BUILTIN_VIDEO_SKILL_ID = 'coffee-note-video-create'/);
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
  assert.match(appSource, /BUILTIN_MEDIA_SKILL_ID\) return 'Media to text'/);
  assert.match(appSource, /BUILTIN_DOCX_SKILL_ID\) return 'Create DOCX'/);
  assert.match(appSource, /BUILTIN_PDF_SKILL_ID\) return 'Create PDF'/);
  assert.match(appSource, /BUILTIN_PRESENTATION_SKILL_ID\) return 'Create presentation'/);
  assert.match(appSource, /BUILTIN_VIDEO_SKILL_ID\) return 'Create video'/);
});

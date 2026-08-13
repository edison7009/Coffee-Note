import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('AI transcript navigation indexes user questions without a persistent selected turn', () => {
  assert.match(appSource, /messages\.filter\(\(message\) => message\.role === 'user'\)/);
  assert.match(appSource, /jumpMessages\.length > 1/);
  assert.match(appSource, /data-jump-message-id=\{message\.role === 'user'/);
  assert.match(appSource, /onMouseMove=\{handleJumpPointerMove\}/);
  assert.match(appSource, /onClick=\{handleJumpRailClick\}/);
  assert.match(appSource, /onMouseLeave=\{\(\) => \{[\s\S]*setHoveredJumpMessageId\(null\)/);
  assert.match(appSource, /Math\.abs\(index - hoveredJumpIndex\)/);
  assert.doesNotMatch(appSource, /activeJumpMessageId/);
});

test('conversation jump bar uses a themed custom preview and proximity animation', () => {
  assert.match(appSource, /aria-label=\{locale === 'zh' \? '对话快速定位'/);
  assert.doesNotMatch(appSource, /conversation-jump-item[\s\S]{0,300}title=/);
  assert.match(appSource, /className="conversation-jump-preview"/);
  assert.match(appSource, /hoveredJumpMessage\.content\.replace/);
  assert.match(cssSource, /\.conversation-jump-bar\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(cssSource, /data-hover-distance='0'/);
  assert.match(cssSource, /data-hover-distance='1'/);
  assert.match(cssSource, /data-hover-distance='2'/);
  assert.match(cssSource, /\.conversation-jump-preview\s*\{[\s\S]*background:\s*var\(--secondary-surface\)/);
  assert.match(cssSource, /@media \(max-width: 820px\)[\s\S]*\.conversation-jump-bar\s*\{\s*display:\s*none;/);
});

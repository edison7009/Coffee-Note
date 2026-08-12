import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');

test('star functionality is fully removed', () => {
  assert.doesNotMatch(appSource, /favoriteItems/);
  assert.doesNotMatch(appSource, /toggleFavorite/);
  assert.doesNotMatch(appSource, /FAVORITES_SEED_FLAG/);
  assert.doesNotMatch(appSource, /setFavorites/);
  assert.doesNotMatch(i18nSource, /favorites: '星标'/);
  assert.doesNotMatch(styles, /favorite-list/);
});

test('right rail opens only for AI or editing and collapses otherwise', () => {
  assert.match(appSource, /const rightRailOpen = view === 'ai' \|\| railEditorTarget !== null/);
  assert.match(appSource, /'--right-rail-width': rightRailOpen \? `\$\{normalizedPaneSizes\.right\}px` : '0px'/);
  assert.match(appSource, /rightRailOpen \? '' : 'right-rail-collapsed'/);
});

test('right rail collapse animates the grid and hides the resizer', () => {
  assert.match(styles, /\.app-shell\s*\{[\s\S]*transition: grid-template-columns 260ms/);
  assert.match(styles, /\.app-shell\.panel-resizing\s*\{\s*transition: none;\s*\}/);
  assert.match(styles, /\.app-shell\.right-rail-collapsed \.pane-resizer-right\s*\{\s*display: none;\s*\}/);
});

test('workspace rail content is gone (no favorites/plan shortcuts in the rail)', () => {
  assert.doesNotMatch(appSource, /plan-shortcut-list/);
  assert.doesNotMatch(appSource, /source-list/);
  assert.doesNotMatch(appSource, /favoritesAndPlan/);
});

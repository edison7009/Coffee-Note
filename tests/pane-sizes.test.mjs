import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePaneSizes } from '../src/paneSizes.ts';

test('shrinks a persisted right pane to preserve the main workspace', () => {
  assert.deepEqual(normalizePaneSizes({ left: 248, right: 552 }, 1200), {
    left: 248,
    right: 392,
  });
});

test('keeps a wide right pane when the window has enough room', () => {
  assert.deepEqual(normalizePaneSizes({ left: 248, right: 552 }, 1500), {
    left: 248,
    right: 552,
  });
});

test('normalizes both pane ranges without constraining hidden mobile panes', () => {
  assert.deepEqual(normalizePaneSizes({ left: 500, right: 100 }, 1360), {
    left: 380,
    right: 270,
  });
  assert.deepEqual(normalizePaneSizes({ left: 500, right: 900 }, 1100), {
    left: 500,
    right: 900,
  });
});

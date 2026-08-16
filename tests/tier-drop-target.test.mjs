import assert from 'node:assert/strict';
import test from 'node:test';
import { getTierInsertionIndex } from '../src/tierDropTarget.ts';

const oneLine = [
  { index: 0, left: 100, top: 40, width: 80, height: 46 },
  { index: 1, left: 214, top: 40, width: 100, height: 46 },
  { index: 2, left: 348, top: 40, width: 90, height: 46 },
];

test('tier card centers continuously divide the full horizontal channel', () => {
  assert.equal(getTierInsertionIndex(20, 63, oneLine), 0);
  assert.equal(getTierInsertionIndex(197, 63, oneLine), 1);
  assert.equal(getTierInsertionIndex(331, 63, oneLine), 2);
  assert.equal(getTierInsertionIndex(700, 63, oneLine), 3);
});

test('hovering either half of a card chooses the adjacent insertion slot', () => {
  assert.equal(getTierInsertionIndex(230, 63, oneLine), 1);
  assert.equal(getTierInsertionIndex(290, 63, oneLine), 2);
});

test('wrapped tier rows are continuous vertically and preserve document order', () => {
  const wrapped = [
    ...oneLine,
    { index: 3, left: 100, top: 100, width: 90, height: 46 },
    { index: 4, left: 224, top: 100, width: 84, height: 46 },
  ];

  assert.equal(getTierInsertionIndex(700, 75, wrapped), 3);
  assert.equal(getTierInsertionIndex(20, 94, wrapped), 3);
  assert.equal(getTierInsertionIndex(700, 123, wrapped), 5);
});

test('an empty tier always inserts at its first position', () => {
  assert.equal(getTierInsertionIndex(500, 200, []), 0);
});

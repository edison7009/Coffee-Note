import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MY_INFO_RETRIEVAL,
  MY_INFO_SECTION_IDS,
  enabledMyInfoSections,
  normalizeMyInfoRetrieval,
  parseMyInfoRetrieval,
} from '../src/myInfoRetrieval.ts';

test('all five My Info sections are enabled by default', () => {
  assert.deepEqual(MY_INFO_SECTION_IDS, [
    'supplements',
    'exercise',
    'experience',
    'lessons',
    'sleep',
  ]);
  assert.deepEqual(enabledMyInfoSections(DEFAULT_MY_INFO_RETRIEVAL), MY_INFO_SECTION_IDS);
});

test('persisted values only disable explicit false section values', () => {
  const state = normalizeMyInfoRetrieval({ exercise: false, lessons: 0, unknown: false });

  assert.equal(state.exercise, false);
  assert.equal(state.lessons, true);
  assert.equal(state.supplements, true);
  assert.deepEqual(enabledMyInfoSections(state), [
    'supplements',
    'experience',
    'lessons',
    'sleep',
  ]);
});

test('malformed persisted values restore all five defaults', () => {
  assert.deepEqual(normalizeMyInfoRetrieval(null), DEFAULT_MY_INFO_RETRIEVAL);
  assert.deepEqual(normalizeMyInfoRetrieval(['exercise']), DEFAULT_MY_INFO_RETRIEVAL);
  assert.deepEqual(parseMyInfoRetrieval('{broken'), DEFAULT_MY_INFO_RETRIEVAL);
  assert.equal(parseMyInfoRetrieval('{"sleep":false}').sleep, false);
});

test('custom My Context paths persist independently and default to enabled', () => {
  const path = 'plans/writing-style.md';
  const state = normalizeMyInfoRetrieval({ [path]: false });
  assert.equal(state[path], false);
  assert.doesNotMatch(enabledMyInfoSections(state, [path]).join(','), /writing-style/);
  assert.match(enabledMyInfoSections(DEFAULT_MY_INFO_RETRIEVAL, [path]).join(','), /writing-style/);
});

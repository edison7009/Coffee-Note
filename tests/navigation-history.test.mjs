import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNavigationHistory,
  recordNavigation,
  stepBack,
  stepForward,
} from '../src/navigationHistory.ts';

const sameLocation = (left, right) =>
  left.view === right.view && left.filePath === right.filePath;

test('records a new location and clears stale forward history', () => {
  const home = { view: 'home' };
  const note = { view: 'file', filePath: 'notes/one.md' };
  const history = {
    back: [{ view: 'ai' }],
    forward: [{ view: 'plan' }],
  };

  assert.deepEqual(recordNavigation(history, home, note, sameLocation), {
    back: [{ view: 'ai' }, home],
    forward: [],
  });
});

test('does not record navigation to the current location', () => {
  const home = { view: 'home' };
  const history = createNavigationHistory();

  assert.equal(recordNavigation(history, home, home, sameLocation), history);
});

test('back and forward move the current location between stacks', () => {
  const home = { view: 'home' };
  const note = { view: 'file', filePath: 'notes/one.md' };
  const plan = { view: 'plan' };
  const history = { back: [home, note], forward: [] };

  const backResult = stepBack(history, plan);
  assert.deepEqual(backResult, {
    target: note,
    history: { back: [home], forward: [plan] },
  });

  assert.deepEqual(stepForward(backResult.history, note), {
    target: plan,
    history: { back: [home, note], forward: [] },
  });
});

test('back and forward return no target when their stack is empty', () => {
  const home = { view: 'home' };
  const history = createNavigationHistory();

  assert.deepEqual(stepBack(history, home), { target: null, history });
  assert.deepEqual(stepForward(history, home), { target: null, history });
});

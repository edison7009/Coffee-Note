import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('center content reserves symmetric scrollbar gutters', () => {
  assert.match(
    styles,
    /\.content-scroll\s*\{[^}]*scrollbar-gutter:\s*stable both-edges;/s,
  );
});

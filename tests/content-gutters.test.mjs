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

test('conversation rail tightens only the edge beside the center scrollbar', () => {
  assert.match(
    styles,
    /\.rail-header\s*\{\s*min-height:\s*0;\s*padding:\s*10px 12px 10px 8px;/s,
  );
  assert.match(
    styles,
    /\.rail-scroll\s*\{\s*padding:\s*0 12px 10px 8px;/s,
  );
});

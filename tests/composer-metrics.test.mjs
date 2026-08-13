import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('composer usage reads as grouped metrics instead of fixed columns', () => {
  assert.match(app, /composer-metric-token-group/);
  assert.match(app, /formatCompactTokens\(usage\.promptTokens\)/);
  assert.match(app, /formatCompactTokens\(usage\.completionTokens\)/);
  assert.match(styles, /\.composer-metrics\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/s);
  assert.match(styles, /\.composer-metric-group \+ \.composer-metric-group::before\s*\{[^}]*content:\s*'\|';/s);
  assert.match(styles, /@container \(max-width:\s*520px\)[\s\S]*grid-template-columns:\s*max-content max-content;/);
  assert.match(styles, /\.composer-metric-token-group::before,[\s\S]*display:\s*none;/);
});

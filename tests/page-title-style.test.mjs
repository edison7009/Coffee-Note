import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('desktop page titles stay fixed when the window is resized', () => {
  assert.match(
    styles,
    /\.hero h1,[\s\S]*?\.note-header h1 \{[\s\S]*?font-size:\s*30px;/,
  );
  assert.match(
    styles,
    /:lang\(zh\) \.home-view \.hero h1,[\s\S]*?:lang\(en\) \.home-view \.hero h1 \{\s*font-size:\s*30px;/,
  );
  assert.doesNotMatch(styles, /font-size:\s*[^;]*(?:vw|cqw|cqmin|vmin)/);
});

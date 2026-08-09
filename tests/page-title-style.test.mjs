import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('desktop page titles stay within the 28 to 32 pixel design range', () => {
  assert.match(
    styles,
    /\.hero h1,[\s\S]*?\.note-header h1 \{[\s\S]*?font-size:\s*clamp\(28px, 2\.4vw, 32px\);/,
  );
  assert.match(
    styles,
    /:lang\(zh\) \.home-view \.hero h1,[\s\S]*?:lang\(en\) \.home-view \.hero h1 \{\s*font-size:\s*clamp\(28px, 2\.4vw, 32px\);/,
  );
});

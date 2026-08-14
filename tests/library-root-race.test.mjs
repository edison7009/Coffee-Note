import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('switching libraries invalidates older asynchronous library work immediately', () => {
  assert.match(appSource, /const libraryGenerationRef = useRef\(0\);/);
  assert.match(
    appSource,
    /libraryGenerationRef\.current \+= 1;\s*libraryRootRef\.current = selected;\s*setLoadingLibrary\(true\);\s*setKnowledgeRoot\(selected\);/s,
  );
});

test('agent requests use the latest selected library as their work directory', () => {
  assert.match(
    appSource,
    /knowledgeRoot: libraryRootRef\.current \|\| library\.root/,
  );
  assert.doesNotMatch(appSource, /knowledgeRoot: library\.root/);
});

test('tier mutations cannot publish an old library snapshot after a root switch', () => {
  assert.match(
    appSource,
    /const generation = libraryGenerationRef\.current;\s*tierMoveQueueRef\.current = tierMoveQueueRef\.current[\s\S]*?await moveTierItem\(root, itemId, targetTier, targetIndex\);\s*if \(generation !== libraryGenerationRef\.current\) return;[\s\S]*?const snapshot = await loadLibrary\(root \|\| undefined, locale\);\s*if \(generation !== libraryGenerationRef\.current\) return;\s*setLibrary\(snapshot\);/s,
  );
  assert.match(
    appSource,
    /await setNoteTier\(root, relativePath, tier\);\s*if \(generation !== libraryGenerationRef\.current\) return;/s,
  );
});

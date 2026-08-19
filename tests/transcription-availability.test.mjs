import assert from 'node:assert/strict';
import test from 'node:test';

import { transcriptionAvailability } from '../src/transcriptionAvailability.ts';

function config(overrides = {}) {
  return {
    activeProvider: 'cloud',
    providers: {
      cloud: {
        providerId: 'cloud',
        protocol: 'openai-compatible',
        endpoint: 'https://example.com/audio/transcriptions',
        model: 'speech-model',
        apiKey: 'secret',
      },
    },
    activeRuntime: 'native',
    activeModel: 'fast',
    ...overrides,
  };
}

function resource(kind, id, installed = true, runtimeId = 'native') {
  return { kind, id, runtimeId, installed, downloading: false, bytes: installed ? 1 : 0 };
}

test('no transcription configuration exposes no usable mode', () => {
  assert.deepEqual(transcriptionAvailability(null, []), { api: false, local: false });
});

test('cloud transcription requires endpoint, model, and API key', () => {
  assert.equal(transcriptionAvailability(config(), []).api, true);
  for (const field of ['endpoint', 'model', 'apiKey']) {
    const incomplete = config({
      providers: {
        cloud: { ...config().providers.cloud, [field]: '' },
      },
    });
    assert.equal(transcriptionAvailability(incomplete, []).api, false, field);
  }
});

test('local transcription requires both the selected runtime and model to be installed', () => {
  const runtime = resource('runtime', 'native');
  const model = resource('model', 'fast');

  assert.equal(transcriptionAvailability(config(), [runtime]).local, false);
  assert.equal(transcriptionAvailability(config(), [model]).local, false);
  assert.equal(transcriptionAvailability(config(), [runtime, model]).local, true);
});

test('local transcription rejects incomplete, uninstalled, and stale selections', () => {
  const runtime = resource('runtime', 'native');
  const model = resource('model', 'fast');

  assert.equal(transcriptionAvailability(config({ activeRuntime: '' }), [runtime, model]).local, false);
  assert.equal(transcriptionAvailability(config({ activeModel: '' }), [runtime, model]).local, false);
  assert.equal(transcriptionAvailability(config(), [resource('runtime', 'native', false), model]).local, false);
  assert.equal(transcriptionAvailability(config(), [runtime, resource('model', 'fast', false)]).local, false);
  assert.equal(transcriptionAvailability(config(), [runtime, resource('model', 'fast', true, 'cuda')]).local, false);
  assert.equal(transcriptionAvailability(config({ activeModel: 'missing' }), [runtime, model]).local, false);
});

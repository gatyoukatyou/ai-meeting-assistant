import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScript } from '../helpers/load-script.mjs';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const PROJECT_ROOT = resolve(__dirname, '../..');

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createJsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    }
  };
}

function loadModelRegistry(fetchImpl) {
  const window = {};
  const localStorage = createStorage();
  const sandbox = loadScript('js/model-registry.js', {
    fetch: fetchImpl,
    localStorage,
    window
  });
  return sandbox.ModelRegistry;
}

function assertGeminiRequestUsesHeaderAuth(call, apiKey) {
  const url = new URL(call.url);
  assert.equal(url.searchParams.has('key'), false);
  assert.equal(call.url.includes(apiKey), false);
  assert.equal(call.options.headers['x-goog-api-key'], apiKey);
}

describe('Gemini header-only API key authentication', () => {
  it('keeps Gemini API keys out of URL query strings in protected source paths', () => {
    for (const file of ['js/app.js', 'js/config.js', 'js/model-registry.js']) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      assert.equal(source.includes('?key='), false, `${file} must not append Gemini API keys to URLs`);
      assert.equal(source.includes("['header', 'query']"), false, `${file} must not restore query auth fallback`);
      assert.equal(source.includes('header → query'), false, `${file} must not document query auth fallback`);
      assert.equal(source.includes('header → ?key'), false, `${file} must not document query auth fallback`);
    }
  });

  it('fetches Gemini model lists with x-goog-api-key and no key query parameter', async () => {
    const apiKey = 'gemini-secret-key';
    const calls = [];
    const ModelRegistry = loadModelRegistry(async (url, options = {}) => {
      calls.push({ url, options });
      return createJsonResponse(200, {
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent']
          }
        ]
      });
    });

    const models = await ModelRegistry.fetchModels('gemini', apiKey);

    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'gemini-2.5-flash');
    assert.equal(calls.length, 1);
    assertGeminiRequestUsesHeaderAuth(calls[0], apiKey);
  });

  it('keeps Gemini model list version fallback header-only', async () => {
    const apiKey = 'gemini-secret-key';
    const calls = [];
    const ModelRegistry = loadModelRegistry(async (url, options = {}) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return createJsonResponse(500, {});
      }
      return createJsonResponse(200, {
        models: [
          {
            name: 'models/gemini-2.5-pro',
            displayName: 'Gemini 2.5 Pro',
            supportedGenerationMethods: ['generateContent']
          }
        ]
      });
    });

    const models = await ModelRegistry.fetchModels('gemini', apiKey);

    assert.equal(models.length, 1);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/v1\/models$/);
    assert.match(calls[1].url, /\/v1beta\/models$/);
    calls.forEach(call => assertGeminiRequestUsesHeaderAuth(call, apiKey));
  });

  it('probes Gemini models with x-goog-api-key and no key query parameter', async () => {
    const apiKey = 'gemini-secret-key';
    const calls = [];
    const ModelRegistry = loadModelRegistry(async (url, options = {}) => {
      calls.push({ url, options });
      return createJsonResponse(200, {});
    });

    const status = await ModelRegistry.probeModel('gemini', 'models/gemini-2.5-flash', apiKey);

    assert.equal(status, 'working');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/models\/gemini-2\.5-flash:generateContent$/);
    assertGeminiRequestUsesHeaderAuth(calls[0], apiKey);
  });

  it('keeps Gemini probe version fallback header-only', async () => {
    const apiKey = 'gemini-secret-key';
    const calls = [];
    const ModelRegistry = loadModelRegistry(async (url, options = {}) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return createJsonResponse(404, { error: { message: 'model not found' } });
      }
      return createJsonResponse(200, {});
    });

    const status = await ModelRegistry.probeModel('gemini', 'gemini-2.5-flash', apiKey);

    assert.equal(status, 'working');
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/v1\/models\/gemini-2\.5-flash:generateContent$/);
    assert.match(calls[1].url, /\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
    calls.forEach(call => assertGeminiRequestUsesHeaderAuth(call, apiKey));
  });
});

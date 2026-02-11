import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

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

describe('ModelRegistryCacheStore', () => {
  it('reads, writes, and clears cache data', () => {
    const localStorage = createStorage();
    const { ModelRegistryCacheStore } = loadScript('js/stores/model-registry-cache-store.js', {
      localStorage
    });

    assert.equal(ModelRegistryCacheStore.read(), null);
    ModelRegistryCacheStore.write('{"version":2}');
    assert.equal(ModelRegistryCacheStore.read(), '{"version":2}');
    ModelRegistryCacheStore.clear();
    assert.equal(ModelRegistryCacheStore.read(), null);
  });
});

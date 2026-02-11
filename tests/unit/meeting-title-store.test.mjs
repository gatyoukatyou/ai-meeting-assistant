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

describe('MeetingTitleStore', () => {
  it('gets, sets, and clears title in localStorage', () => {
    const localStorage = createStorage();
    const { MeetingTitleStore } = loadScript('js/stores/meeting-title-store.js', {
      localStorage
    });

    assert.equal(MeetingTitleStore.get(), '');
    MeetingTitleStore.set('Weekly Sync');
    assert.equal(MeetingTitleStore.get(), 'Weekly Sync');
    MeetingTitleStore.clear();
    assert.equal(MeetingTitleStore.get(), '');
  });
});

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

function createContext(localData = {}, sessionData = {}) {
  const localStorage = createStorage(localData);
  const sessionStorage = createStorage(sessionData);
  const { MeetingContextStore } = loadScript('js/stores/meeting-context-store.js', {
    localStorage,
    sessionStorage
  });
  return { MeetingContextStore, localStorage, sessionStorage };
}

describe('MeetingContextStore', () => {
  it('stores in sessionStorage when persist=false', () => {
    const { MeetingContextStore, localStorage, sessionStorage } = createContext();
    MeetingContextStore.saveRaw('{"goal":"a"}', false);

    assert.equal(sessionStorage.getItem('_meetingContext'), '{"goal":"a"}');
    assert.equal(localStorage.getItem('_meetingContext'), null);
  });

  it('stores in localStorage when persist=true', () => {
    const { MeetingContextStore, localStorage, sessionStorage } = createContext();
    MeetingContextStore.saveRaw('{"goal":"b"}', true);

    assert.equal(localStorage.getItem('_meetingContext'), '{"goal":"b"}');
    assert.equal(sessionStorage.getItem('_meetingContext'), null);
  });

  it('migrates legacy key into canonical key', () => {
    const { MeetingContextStore, sessionStorage } = createContext(
      {},
      { __meetingContext: '{"goal":"legacy"}' }
    );
    const raw = MeetingContextStore.readRaw(false);

    assert.equal(raw, '{"goal":"legacy"}');
    assert.equal(sessionStorage.getItem('_meetingContext'), '{"goal":"legacy"}');
    assert.equal(sessionStorage.getItem('__meetingContext'), null);
  });

  it('clears both storages', () => {
    const { MeetingContextStore, localStorage, sessionStorage } = createContext(
      { _meetingContext: '{"goal":"x"}' },
      { _meetingContext: '{"goal":"y"}' }
    );
    MeetingContextStore.clear(true);

    assert.equal(localStorage.getItem('_meetingContext'), null);
    assert.equal(sessionStorage.getItem('_meetingContext'), null);
  });
});

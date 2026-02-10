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
    },
    clear() {
      store.clear();
    }
  };
}

function createSecureStorageContext({
  isStandalone = false,
  isWindowControlsOverlay = false,
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
  localData = {},
  sessionData = {}
} = {}) {
  const localStorage = createStorage(localData);
  const sessionStorage = createStorage(sessionData);
  const window = {
    matchMedia(query) {
      if (query === '(display-mode: standalone)') {
        return { matches: isStandalone };
      }
      if (query === '(display-mode: window-controls-overlay)') {
        return { matches: isWindowControlsOverlay };
      }
      return { matches: false };
    }
  };
  const navigator = { userAgent };

  const { SecureStorage } = loadScript('js/secure-storage.js', {
    window,
    navigator,
    localStorage,
    sessionStorage
  });

  return { SecureStorage, localStorage, sessionStorage };
}

describe('SecureStorage persistApiKeys policy', () => {
  it('uses sessionStorage by default', () => {
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      isStandalone: true
    });

    SecureStorage.setApiKey('openai', 'session-key');

    assert.equal(sessionStorage.getItem('_ak_openai'), 'session-key');
    assert.equal(localStorage.getItem('_ak_openai'), null);
  });

  it('stores keys in localStorage when persistApiKeys is enabled in desktop app mode', () => {
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      isStandalone: true
    });

    SecureStorage.setPersistApiKeys(true);
    SecureStorage.setApiKey('openai', 'persisted-key');

    assert.equal(localStorage.getItem('_ak_openai'), 'persisted-key');
    assert.equal(sessionStorage.getItem('_ak_openai'), null);
  });

  it('does not allow persistApiKeys on non-standalone browser tabs', () => {
    const { SecureStorage, localStorage } = createSecureStorageContext();

    SecureStorage.setPersistApiKeys(true);

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), false);
    assert.equal(SecureStorage.isPersistApiKeysEnabled(), false);
    assert.equal(localStorage.getItem('_opt_persistApiKeys'), 'false');
  });

  it('does not read localStorage keys in unsupported contexts even if option is true', () => {
    const { SecureStorage } = createSecureStorageContext({
      localData: {
        _opt_persistApiKeys: 'true',
        _ak_openai: 'persisted-key'
      }
    });

    assert.equal(SecureStorage.getApiKey('openai'), '');
  });

  it('rejects persistent key mode on mobile user agents', () => {
    const { SecureStorage } = createSecureStorageContext({
      isStandalone: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), false);
  });

  it('includes persistApiKeys option in export payload', () => {
    const { SecureStorage } = createSecureStorageContext({
      isStandalone: true
    });

    SecureStorage.setPersistApiKeys(true);
    const exported = SecureStorage.exportAll();

    assert.equal(exported.options.persistApiKeys, true);
  });
});

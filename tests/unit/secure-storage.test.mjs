import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function createStorage(initial = {}, { throwOnSetItem = false } = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (throwOnSetItem) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
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
  // iOS Safariのみ存在するプロパティ。ホーム画面Web Appで true、通常タブで false、
  // iOS以外では undefined（= プロパティ自体なし）を再現する
  iosNavigatorStandalone = undefined,
  localData = {},
  sessionData = {},
  localThrowsOnSetItem = false,
  sessionThrowsOnSetItem = false
} = {}) {
  const localStorage = createStorage(localData, { throwOnSetItem: localThrowsOnSetItem });
  const sessionStorage = createStorage(sessionData, { throwOnSetItem: sessionThrowsOnSetItem });
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
  if (iosNavigatorStandalone !== undefined) {
    navigator.standalone = iosNavigatorStandalone;
  }

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

  it('supports persistence in a mobile standalone PWA', () => {
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      isStandalone: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_9 like Mac OS X)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), true);

    SecureStorage.setPersistApiKeys(true);
    SecureStorage.setApiKey('deepgram', 'persisted-key');

    assert.equal(localStorage.getItem('_ak_deepgram'), 'persisted-key');
    assert.equal(sessionStorage.getItem('_ak_deepgram'), null);
  });

  it('supports persistence in an iOS home-screen web app even when display-mode does not match', () => {
    // iPhone XR / iOS 18.7 実機: display-mode: standalone に一致しないが navigator.standalone は true
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      isStandalone: false,
      iosNavigatorStandalone: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_9 like Mac OS X)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), true);

    SecureStorage.setPersistApiKeys(true);
    SecureStorage.setApiKey('deepgram', 'persisted-key');

    assert.equal(localStorage.getItem('_ak_deepgram'), 'persisted-key');
    assert.equal(sessionStorage.getItem('_ak_deepgram'), null);
  });

  it('does not support persistence in an iOS Safari browser tab', () => {
    const { SecureStorage } = createSecureStorageContext({
      iosNavigatorStandalone: false,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_9 like Mac OS X)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), false);
  });

  it('does not support persistence in a mobile browser tab', () => {
    const { SecureStorage } = createSecureStorageContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), false);
  });

  it('keeps desktop standalone persistence behavior unchanged', () => {
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      isStandalone: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), true);

    SecureStorage.setPersistApiKeys(true);
    SecureStorage.setApiKey('openai', 'persisted-key');

    assert.equal(localStorage.getItem('_ak_openai'), 'persisted-key');
    assert.equal(sessionStorage.getItem('_ak_openai'), null);
  });

  it('keeps desktop window-controls-overlay persistence behavior unchanged', () => {
    const { SecureStorage } = createSecureStorageContext({
      isWindowControlsOverlay: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    });

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), true);
  });

  it('keeps preference but disables effective persistApiKeys on non-standalone browser tabs', () => {
    const { SecureStorage, localStorage } = createSecureStorageContext();

    SecureStorage.setPersistApiKeys(true);

    assert.equal(SecureStorage.isPersistentApiKeysSupported(), false);
    assert.equal(SecureStorage.isPersistApiKeysEnabled(), false);
    assert.equal(localStorage.getItem('_opt_persistApiKeys'), 'true');
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

  it('includes persistApiKeys option in export payload', () => {
    const { SecureStorage } = createSecureStorageContext({
      isStandalone: true
    });

    SecureStorage.setPersistApiKeys(true);
    SecureStorage.setApiKey('deepgram', 'must-not-be-exported');
    const exported = SecureStorage.exportAll();

    assert.equal(exported.options.persistApiKeys, true);
    assert.equal(JSON.stringify(exported).includes('must-not-be-exported'), false);
  });
});

describe('SecureStorage degrades gracefully on storage write failures', () => {
  it('setApiKey does not throw when the target storage.setItem throws (quota/private mode)', () => {
    const { SecureStorage } = createSecureStorageContext({
      sessionThrowsOnSetItem: true
    });

    assert.doesNotThrow(() => {
      SecureStorage.setApiKey('openai', 'some-key');
    });
  });

  it('keeps the secondary API key when the target storage write fails', () => {
    const { SecureStorage, localStorage, sessionStorage } = createSecureStorageContext({
      localData: { _ak_openai: 'existing-key' },
      sessionThrowsOnSetItem: true
    });

    SecureStorage.setApiKey('openai', 'new-key');

    assert.equal(sessionStorage.getItem('_ak_openai'), null);
    assert.equal(localStorage.getItem('_ak_openai'), 'existing-key');
  });

  it('setApiKey does not throw when the persistent (localStorage) target throws', () => {
    // Preset the persist option directly (rather than via setPersistApiKeys)
    // so the write failure under test is isolated to setApiKey itself.
    const { SecureStorage } = createSecureStorageContext({
      isStandalone: true,
      localData: { _opt_persistApiKeys: 'true' },
      localThrowsOnSetItem: true
    });

    assert.equal(SecureStorage.isPersistApiKeysEnabled(), true);
    assert.doesNotThrow(() => {
      SecureStorage.setApiKey('openai', 'some-key');
    });
  });

  it('setModel does not throw when localStorage.setItem throws', () => {
    const { SecureStorage } = createSecureStorageContext({
      localThrowsOnSetItem: true
    });

    assert.doesNotThrow(() => {
      SecureStorage.setModel('gemini', 'gemini-pro');
    });
  });

  it('setOption does not throw when localStorage.setItem throws, and getOption falls back to the default', () => {
    const { SecureStorage } = createSecureStorageContext({
      localThrowsOnSetItem: true
    });

    assert.doesNotThrow(() => {
      SecureStorage.setOption('costLimit', 500);
    });
    assert.equal(SecureStorage.getOption('costLimit', 100), 100);
  });
});

const MeetingContextStore = (function () {
  'use strict';

  const STORAGE_KEY = '_meetingContext';
  const LEGACY_STORAGE_KEY = '__meetingContext';

  function getStorages(persist) {
    return {
      primary: persist ? localStorage : sessionStorage,
      secondary: persist ? sessionStorage : localStorage
    };
  }

  function findEntry(storage) {
    const primary = storage.getItem(STORAGE_KEY);
    if (primary) return { key: STORAGE_KEY, value: primary };
    const legacy = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return { key: LEGACY_STORAGE_KEY, value: legacy };
    return null;
  }

  function clearKeys(storage) {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(LEGACY_STORAGE_KEY);
  }

  // Returns canonical _meetingContext value and migrates legacy/secondary entries.
  function readRaw(persist) {
    const storages = getStorages(Boolean(persist));
    const primaryEntry = findEntry(storages.primary);
    const secondaryEntry = findEntry(storages.secondary);
    let didSetPrimary = false;

    if (!primaryEntry && secondaryEntry) {
      storages.primary.setItem(STORAGE_KEY, secondaryEntry.value);
      didSetPrimary = true;
    }
    if (primaryEntry && primaryEntry.key !== STORAGE_KEY) {
      storages.primary.setItem(STORAGE_KEY, primaryEntry.value);
      didSetPrimary = true;
    }

    clearKeys(storages.secondary);
    if (didSetPrimary) {
      storages.primary.removeItem(LEGACY_STORAGE_KEY);
    }
    return storages.primary.getItem(STORAGE_KEY);
  }

  function saveRaw(rawValue, persist) {
    const storages = getStorages(Boolean(persist));
    if (!rawValue) {
      clearKeys(storages.primary);
      clearKeys(storages.secondary);
      return;
    }
    storages.primary.setItem(STORAGE_KEY, rawValue);
    storages.primary.removeItem(LEGACY_STORAGE_KEY);
    clearKeys(storages.secondary);
  }

  function clear(persist) {
    const storages = getStorages(Boolean(persist));
    clearKeys(storages.primary);
    clearKeys(storages.secondary);
  }

  return {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    readRaw,
    saveRaw,
    clear
  };
})();

if (typeof window !== 'undefined') {
  window.MeetingContextStore = MeetingContextStore;
}

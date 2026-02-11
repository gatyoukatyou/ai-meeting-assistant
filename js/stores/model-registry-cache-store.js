const ModelRegistryCacheStore = (function () {
  'use strict';

  const STORAGE_KEY = '_model_registry';

  function read() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function write(rawValue) {
    localStorage.setItem(STORAGE_KEY, rawValue);
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    STORAGE_KEY,
    read,
    write,
    clear
  };
})();

if (typeof window !== 'undefined') {
  window.ModelRegistryCacheStore = ModelRegistryCacheStore;
}

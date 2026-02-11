const MeetingTitleStore = (function () {
  'use strict';

  const STORAGE_KEY = '_meetingTitle';

  function get() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function set(value) {
    localStorage.setItem(STORAGE_KEY, value || '');
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    STORAGE_KEY,
    get,
    set,
    clear
  };
})();

if (typeof window !== 'undefined') {
  window.MeetingTitleStore = MeetingTitleStore;
}

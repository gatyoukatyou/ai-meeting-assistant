(function() {
  const params = new URLSearchParams(window.location.search);
  const enabled = (typeof window.DEBUG_LOGS === 'boolean')
    ? window.DEBUG_LOGS
    : (params.has('debug') || params.get('debug') === '1' || params.get('debug') === 'true');

  window.DEBUG_LOGS = enabled;
  window.debugLog = function(...args) {
    if (window.DEBUG_LOGS) console.log(...args);
  };
  window.debugWarn = function(...args) {
    if (window.DEBUG_LOGS) console.warn(...args);
  };
  window.debugInfo = function(...args) {
    if (window.DEBUG_LOGS) console.info(...args);
  };
})();

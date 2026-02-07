// Pure sanitizing/string helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var sanitizeErrorLog = SanitizeUtils.sanitizeErrorLog).
const SanitizeUtils = (function () {
  'use strict';

  /**
   * Sanitize error logs to remove potential API key leaks
   * @param {*} str - input (coerced to string if not already)
   * @returns {string}
   */
  function sanitizeErrorLog(str) {
    if (typeof str !== 'string') return String(str);
    // Common API key patterns: sk-..., AIza..., dg_..., etc.
    return str
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***REDACTED***')
      .replace(/AIza[a-zA-Z0-9_-]{30,}/g, 'AIza***REDACTED***')
      .replace(/dg_[a-zA-Z0-9_-]{20,}/g, 'dg_***REDACTED***')
      .replace(/[a-f0-9]{32,}/gi, '***HASH_REDACTED***');
  }

  /**
   * Truncate text with ellipsis
   * @param {string} text - input text
   * @param {number} [limit=160] - max character count
   * @returns {string}
   */
  function truncateText(text, limit = 160) {
    if (!text) return '';
    const trimmed = text.trim();
    if (trimmed.length <= limit) return trimmed;
    return `${trimmed.slice(0, limit)}\u2026`;
  }

  return { sanitizeErrorLog, truncateText };
})();

if (typeof window !== 'undefined') {
  window.SanitizeUtils = SanitizeUtils;
}

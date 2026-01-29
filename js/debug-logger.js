/**
 * Debug Logger Utility
 *
 * Issue #47: secret/PII を含む console ログをデフォルト無効化
 * - デフォルトで本文・prompt・抽出テキスト等の機微情報をconsoleに出さない
 * - ?debug パラメータがある場合のみ、メタ情報を出力
 * - 本文は debug 有効時でも出力しない（長さやチャンク数のみ）
 */

(function() {
  'use strict';

  // Check if debug mode is enabled via URL parameter
  var urlParams = new URLSearchParams(window.location.search);
  var isDebugEnabled = urlParams.has('debug');

  /**
   * Debug logger that only outputs when ?debug is present
   * @param {string} prefix - Log prefix (e.g., '[Deepgram]')
   * @param {string} message - Log message (metadata only, no PII)
   * @param {...any} args - Additional arguments (metadata only)
   */
  function debugLog(prefix, message) {
    if (!isDebugEnabled) return;

    var args = Array.prototype.slice.call(arguments, 2);
    if (args.length > 0) {
      console.log.apply(console, [prefix + ' ' + message].concat(args));
    } else {
      console.log(prefix + ' ' + message);
    }
  }

  /**
   * Always log (for critical errors/warnings)
   */
  function alwaysLog(prefix, message) {
    var args = Array.prototype.slice.call(arguments, 2);
    if (args.length > 0) {
      console.log.apply(console, [prefix + ' ' + message].concat(args));
    } else {
      console.log(prefix + ' ' + message);
    }
  }

  /**
   * Error log (always outputs)
   */
  function errorLog(prefix, message) {
    var args = Array.prototype.slice.call(arguments, 2);
    if (args.length > 0) {
      console.error.apply(console, [prefix + ' ' + message].concat(args));
    } else {
      console.error(prefix + ' ' + message);
    }
  }

  /**
   * Create a sanitized metadata object for logging
   * Removes any potentially sensitive content, keeping only metrics
   * @param {Object} data - Object to sanitize
   * @returns {Object} - Sanitized object with only safe metadata
   */
  function sanitizeForLog(data) {
    if (!data || typeof data !== 'object') return data;

    var safe = {};
    for (var key in data) {
      if (!data.hasOwnProperty(key)) continue;

      // Skip potentially sensitive keys
      var lowerKey = key.toLowerCase();
      if (lowerKey.includes('text') ||
          lowerKey.includes('transcript') ||
          lowerKey.includes('prompt') ||
          lowerKey.includes('content') ||
          lowerKey.includes('message') ||
          lowerKey.includes('data') ||
          lowerKey.includes('buffer')) {
        // For text fields, only log the length
        if (typeof data[key] === 'string') {
          safe[key + 'Length'] = data[key].length;
        } else if (Array.isArray(data[key])) {
          safe[key + 'Count'] = data[key].length;
        }
        continue;
      }

      // Copy safe values
      safe[key] = data[key];
    }
    return safe;
  }

  // Export to window
  window.DebugLogger = {
    isEnabled: isDebugEnabled,
    log: debugLog,
    always: alwaysLog,
    error: errorLog,
    sanitize: sanitizeForLog
  };
})();

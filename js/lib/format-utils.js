// Pure formatting helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var formatCost = FormatUtils.formatCost).
const FormatUtils = (function () {
  'use strict';

  function formatCost(yen) {
    if (yen < 1) {
      return `¥${yen.toFixed(2)}`;
    }
    return `¥${Math.round(yen).toLocaleString()}`;
  }

  function formatNumber(num) {
    return num.toLocaleString();
  }

  function sanitizeFileName(name) {
    if (!name) return 'meeting';
    return name.replace(/[<>:"/\\|?*\n\r]+/g, '').trim() || 'meeting';
  }

  function deepCopy(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch (e) {
        // structuredCloneが失敗した場合はJSONフォールバック
      }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  return { formatCost, formatNumber, sanitizeFileName, deepCopy };
})();

if (typeof window !== 'undefined') {
  window.FormatUtils = FormatUtils;
}

const RecordingDurationLimitService = (function () {
  'use strict';

  // 切り忘れによるSTT課金の垂れ流しを防ぐガード（0 = 無制限）
  const DEFAULT_MAX_RECORDING_MINUTES = 120;
  const CHECK_INTERVAL_MS = 10000;

  function normalizeMaxMinutes(value) {
    // null/undefined/空文字は未設定として既定値に倒す（Number(null) === 0 で
    // 無制限扱いになるのを防ぐ。0 = 無制限は明示指定のみ有効）
    if (value === null || value === undefined || value === '') {
      return DEFAULT_MAX_RECORDING_MINUTES;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return DEFAULT_MAX_RECORDING_MINUTES;
    }
    return Math.floor(num);
  }

  function isLimitEnabled(maxMinutes) {
    return normalizeMaxMinutes(maxMinutes) > 0;
  }

  function shouldAutoStop(activeMs, maxMinutes) {
    const limit = normalizeMaxMinutes(maxMinutes);
    if (limit <= 0) return false;
    if (!Number.isFinite(activeMs) || activeMs <= 0) return false;
    return activeMs >= limit * 60000;
  }

  return {
    DEFAULT_MAX_RECORDING_MINUTES,
    CHECK_INTERVAL_MS,
    normalizeMaxMinutes,
    isLimitEnabled,
    shouldAutoStop
  };
})();

if (typeof window !== 'undefined') {
  window.RecordingDurationLimitService = RecordingDurationLimitService;
}

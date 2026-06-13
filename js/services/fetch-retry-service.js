const FetchRetryService = (function () {
  'use strict';

  const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
  const DEFAULT_MAX_ATTEMPTS = 3;
  const MAX_RETRY_AFTER_MS = 8000;

  function isRetryableStatus(status) {
    return RETRYABLE_STATUS_CODES.has(status);
  }

  function parseRetryAfterMs(value, nowMs) {
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }

    const retryAt = Date.parse(value);
    if (Number.isNaN(retryAt)) return null;

    const delay = retryAt - (Number.isFinite(nowMs) ? nowMs : Date.now());
    return Math.min(Math.max(delay, 0), MAX_RETRY_AFTER_MS);
  }

  function getRetryAfterMs(response, nowMs) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') return null;
    return parseRetryAfterMs(headers.get('Retry-After'), nowMs);
  }

  function getBackoffDelayMs(attemptIndex) {
    return Math.pow(2, attemptIndex) * 1000;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithRetry(url, options, settings) {
    const config = settings || {};
    const maxAttempts = Number.isFinite(config.maxAttempts) && config.maxAttempts > 0
      ? Math.floor(config.maxAttempts)
      : DEFAULT_MAX_ATTEMPTS;
    const fetchImpl = config.fetchImpl || fetch;
    const sleepImpl = config.sleepImpl || sleep;
    const nowImpl = config.nowImpl || Date.now;
    const logger = Object.prototype.hasOwnProperty.call(config, 'logger')
      ? config.logger
      : console;
    let lastError;

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
      try {
        if (options && options.signal && options.signal.aborted) {
          const err = new Error('Request aborted');
          err.name = 'AbortError';
          throw err;
        }

        const response = await fetchImpl(url, options);
        if (!response || !isRetryableStatus(response.status) || attemptIndex >= maxAttempts - 1) {
          return response;
        }

        const retryAfterMs = getRetryAfterMs(response, nowImpl());
        const delay = retryAfterMs != null ? retryAfterMs : getBackoffDelayMs(attemptIndex);
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`HTTP ${response.status}; retrying API call (${attemptIndex + 1}/${maxAttempts})`);
        }
        await sleepImpl(delay);
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error;
        }

        lastError = error;
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`API呼び出し失敗 (${attemptIndex + 1}/${maxAttempts}):`, error);
        }

        if (attemptIndex < maxAttempts - 1) {
          await sleepImpl(getBackoffDelayMs(attemptIndex));
        }
      }
    }

    throw lastError;
  }

  return {
    RETRYABLE_STATUS_CODES,
    MAX_RETRY_AFTER_MS,
    isRetryableStatus,
    parseRetryAfterMs,
    getRetryAfterMs,
    getBackoffDelayMs,
    fetchWithRetry
  };
})();

if (typeof window !== 'undefined') {
  window.FetchRetryService = FetchRetryService;
}

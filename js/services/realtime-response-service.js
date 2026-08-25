const RealtimeResponseService = (function () {
  'use strict';

  const RESPONSE_ARRAY_KEYS = ['summary', 'opinion', 'idea', 'consult', 'custom', 'realtime'];

  function copyArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function normalizeUsageSnapshot(usage) {
    if (!usage || typeof usage !== 'object') return null;
    const fields = [
      'totalTokens',
      'inputTokens',
      'outputTokens',
      'inputTextTokens',
      'inputAudioTokens',
      'cachedTokens',
      'cachedTextTokens',
      'cachedAudioTokens',
      'outputTextTokens',
      'outputAudioTokens'
    ];
    const snapshot = {};
    fields.forEach(field => {
      const value = Number(usage[field]);
      if (Number.isFinite(value) && value >= 0) snapshot[field] = value;
    });
    if (usage.estimate && typeof usage.estimate === 'object') {
      snapshot.estimate = {
        available: usage.estimate.available === true,
        usd: Number.isFinite(Number(usage.estimate.usd)) ? Number(usage.estimate.usd) : null,
        jpy: Number.isFinite(Number(usage.estimate.jpy)) ? Number(usage.estimate.jpy) : null
      };
    }
    return snapshot;
  }

  function appendAssistantResponse(aiResponses, { text, timestamp, usage } = {}) {
    const content = typeof text === 'string' ? text.trim() : '';
    if (!content) return aiResponses || {};

    const current = aiResponses && typeof aiResponses === 'object' ? aiResponses : {};
    const next = { ...current };
    RESPONSE_ARRAY_KEYS.forEach(key => {
      next[key] = copyArray(current[key]);
    });
    if (typeof current.minutes !== 'string') next.minutes = '';
    next.realtime.push({
      timestamp: typeof timestamp === 'string' ? timestamp : '',
      content,
      usage: normalizeUsageSnapshot(usage)
    });
    return next;
  }

  return Object.freeze({
    appendAssistantResponse,
    normalizeUsageSnapshot
  });
})();

if (typeof window !== 'undefined') {
  window.RealtimeResponseService = RealtimeResponseService;
}

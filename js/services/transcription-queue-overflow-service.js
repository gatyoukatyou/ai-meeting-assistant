const TranscriptionQueueOverflowService = (function () {
  'use strict';

  const DEFAULT_MAX_QUEUE_LENGTH = 3;
  const DEFAULT_NOTIFICATION_COOLDOWN_MS = 15000;

  function createInitialState() {
    return {
      discardedChunks: 0,
      lastDiscardedAt: null,
      lastDiscardedBlobId: null,
      lastDiscardedSize: 0,
      lastWarningAt: 0
    };
  }

  function normalizeMaxQueueLength(maxQueueLength) {
    if (!Number.isFinite(maxQueueLength) || maxQueueLength < 1) {
      return DEFAULT_MAX_QUEUE_LENGTH;
    }
    return Math.floor(maxQueueLength);
  }

  function snapshotChunk(chunk) {
    return {
      id: chunk && chunk._debugId ? chunk._debugId : 'unknown',
      size: chunk && Number.isFinite(chunk.size) ? chunk.size : 0,
      duration: chunk && Number.isFinite(chunk._duration) ? chunk._duration : null,
      enqueueTime: chunk && Number.isFinite(chunk._enqueueTime) ? chunk._enqueueTime : null
    };
  }

  function discardOverflow(queue, maxQueueLength) {
    const limit = normalizeMaxQueueLength(maxQueueLength);
    const discarded = [];
    if (!Array.isArray(queue)) {
      return { discarded, discardedCount: 0, queueLength: 0, maxQueueLength: limit };
    }

    while (queue.length > limit) {
      discarded.push(snapshotChunk(queue.shift()));
    }

    return {
      discarded,
      discardedCount: discarded.length,
      queueLength: queue.length,
      maxQueueLength: limit
    };
  }

  function recordDiscardedChunks(state, discarded, now) {
    const current = state || createInitialState();
    const items = Array.isArray(discarded) ? discarded : [];
    if (items.length === 0) return current;

    const last = items[items.length - 1];
    return {
      discardedChunks: (Number(current.discardedChunks) || 0) + items.length,
      lastDiscardedAt: Number.isFinite(now) ? now : Date.now(),
      lastDiscardedBlobId: last.id || 'unknown',
      lastDiscardedSize: Number.isFinite(last.size) ? last.size : 0,
      lastWarningAt: Number(current.lastWarningAt) || 0
    };
  }

  function shouldNotify(state, now, cooldownMs) {
    const current = state || createInitialState();
    const timestamp = Number.isFinite(now) ? now : Date.now();
    const cooldown = Number.isFinite(cooldownMs) ? cooldownMs : DEFAULT_NOTIFICATION_COOLDOWN_MS;
    return !current.lastWarningAt || timestamp - current.lastWarningAt >= cooldown;
  }

  function markNotified(state, now) {
    const current = state || createInitialState();
    return {
      ...current,
      lastWarningAt: Number.isFinite(now) ? now : Date.now()
    };
  }

  function buildDiscardMessage(state, language) {
    const current = state || createInitialState();
    const count = Number(current.discardedChunks) || 0;
    if (language === 'en') {
      return `Transcription is delayed. ${count} audio chunk(s) were discarded.`;
    }
    return `文字起こし処理が遅延しています。音声チャンク ${count} 件を破棄しました。`;
  }

  return {
    DEFAULT_MAX_QUEUE_LENGTH,
    DEFAULT_NOTIFICATION_COOLDOWN_MS,
    createInitialState,
    discardOverflow,
    recordDiscardedChunks,
    shouldNotify,
    markNotified,
    buildDiscardMessage
  };
})();

if (typeof window !== 'undefined') {
  window.TranscriptionQueueOverflowService = TranscriptionQueueOverflowService;
}

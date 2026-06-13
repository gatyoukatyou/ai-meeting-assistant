import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function loadService() {
  return loadScript('js/services/transcription-queue-overflow-service.js').TranscriptionQueueOverflowService;
}

describe('TranscriptionQueueOverflowService', () => {
  it('discards oldest chunks until the queue is within the max length', () => {
    const service = loadService();
    const queue = [
      { _debugId: 'blob-1', size: 1000, _duration: 1, _enqueueTime: 10 },
      { _debugId: 'blob-2', size: 2000, _duration: 2, _enqueueTime: 20 },
      { _debugId: 'blob-3', size: 3000, _duration: 3, _enqueueTime: 30 },
      { _debugId: 'blob-4', size: 4000, _duration: 4, _enqueueTime: 40 }
    ];

    const result = service.discardOverflow(queue, 3);

    assert.equal(result.discardedCount, 1);
    assert.equal(result.discarded[0].id, 'blob-1');
    assert.deepEqual(queue.map((item) => item._debugId), ['blob-2', 'blob-3', 'blob-4']);
    assert.equal(result.queueLength, 3);
  });

  it('records discarded chunk totals and last discarded metadata', () => {
    const service = loadService();
    const state = service.recordDiscardedChunks(
      service.createInitialState(),
      [
        { id: 'blob-1', size: 1000 },
        { id: 'blob-2', size: 2000 }
      ],
      12345
    );

    assert.equal(state.discardedChunks, 2);
    assert.equal(state.lastDiscardedAt, 12345);
    assert.equal(state.lastDiscardedBlobId, 'blob-2');
    assert.equal(state.lastDiscardedSize, 2000);
  });

  it('throttles repeated warning notifications', () => {
    const service = loadService();
    const state = service.markNotified(service.createInitialState(), 1000);

    assert.equal(service.shouldNotify(state, 2000, 15000), false);
    assert.equal(service.shouldNotify(state, 17000, 15000), true);
  });

  it('builds a user-visible discarded count message', () => {
    const service = loadService();
    const state = {
      ...service.createInitialState(),
      discardedChunks: 3
    };

    assert.match(service.buildDiscardMessage(state, 'ja'), /3 件を破棄/);
    assert.match(service.buildDiscardMessage(state, 'en'), /3 audio chunk\(s\) were discarded/);
  });
});

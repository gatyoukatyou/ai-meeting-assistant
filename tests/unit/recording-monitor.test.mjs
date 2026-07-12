import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function loadRecordingMonitor() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const document = {
    visibilityState: 'visible',
    addEventListener(event, callback) {
      documentListeners.set(event, callback);
    },
    removeEventListener(event) {
      documentListeners.delete(event);
    }
  };
  const window = {
    addEventListener(event, callback) {
      windowListeners.set(event, callback);
    },
    removeEventListener(event) {
      windowListeners.delete(event);
    }
  };
  loadScript('js/audio/recording_monitor.js', { document, window });
  return { RecordingMonitor: window.RecordingMonitor, documentListeners, windowListeners };
}

describe('RecordingMonitor', () => {
  it('requests pending data without stopping the recorder', () => {
    const { RecordingMonitor } = loadRecordingMonitor();
    const calls = { requestData: 0, stop: 0 };
    const monitor = new RecordingMonitor();
    monitor.start({
      mediaRecorder: {
        state: 'recording',
        requestData() {
          calls.requestData += 1;
        },
        stop() {
          calls.stop += 1;
        }
      }
    });

    assert.equal(monitor.requestPendingData(), true);
    assert.deepEqual(calls, { requestData: 1, stop: 0 });
    monitor.stop();
  });

  it('clears track handlers and lifecycle listeners when monitoring stops', () => {
    const { RecordingMonitor, documentListeners, windowListeners } = loadRecordingMonitor();
    const track = { kind: 'audio', readyState: 'live' };
    const monitor = new RecordingMonitor();
    monitor.start({
      mediaStream: {
        getTracks() {
          return [track];
        }
      }
    });

    assert.equal(typeof track.onended, 'function');
    assert.equal(documentListeners.has('visibilitychange'), true);
    assert.equal(windowListeners.has('pagehide'), true);

    monitor.stop();

    assert.equal(track.onended, null);
    assert.equal(track.onmute, null);
    assert.equal(track.onunmute, null);
    assert.equal(documentListeners.size, 0);
    assert.equal(windowListeners.size, 0);
  });
});

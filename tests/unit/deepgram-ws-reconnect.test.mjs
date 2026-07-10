import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

/**
 * Fake WebSocket capturing constructions, sends, and close calls.
 * Provides _open()/_close() helpers to drive the provider's lifecycle handlers.
 */
class FakeWebSocket {
  constructor(url, protocols) {
    FakeWebSocket.instances.push(this);
    this.url = url;
    this.protocols = protocols;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.closeCalls = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(data) {
    this.sent.push(data);
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = FakeWebSocket.CLOSED;
  }

  // Test helpers
  _open() {
    this.readyState = FakeWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  _fireClose(code) {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code });
  }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

const CONNECT_TIMEOUT_DELAY = 10000;

/**
 * Build a fresh sandboxed provider with a controllable timer harness and a
 * fake WebSocket. Reconnect timers use delay < CONNECT_TIMEOUT_DELAY; the
 * connection timeout uses exactly CONNECT_TIMEOUT_DELAY.
 */
function createProvider() {
  FakeWebSocket.instances = [];

  const timers = new Map();
  let nextId = 1;
  const fakeSetTimeout = (fn, delay) => {
    const id = nextId++;
    timers.set(id, { fn, delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };

  // Return the queued reconnect timer callbacks (excludes the 10s connect timeout)
  const pendingReconnectTimers = () =>
    [...timers.values()].filter((t) => t.delay < CONNECT_TIMEOUT_DELAY);

  // Fire all pending reconnect timers (mirrors the browser clock advancing)
  const fireReconnectTimers = () => {
    for (const [id, t] of [...timers]) {
      if (t.delay < CONNECT_TIMEOUT_DELAY) {
        timers.delete(id);
        t.fn();
      }
    }
  };

  const SecureStorage = {
    getApiKey() {
      return 'test-deepgram-key';
    },
    getModel() {
      return 'nova-3-general';
    }
  };
  const DebugLogger = { log() {}, error() {} };
  const window = {};

  loadScript('js/stt/providers/deepgram_ws.js', {
    window,
    SecureStorage,
    DebugLogger,
    WebSocket: FakeWebSocket,
    URL,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    console: { error() {}, log() {} }
  });

  const provider = new window.DeepgramWSProvider({ apiKey: 'test-deepgram-key' });

  return {
    provider,
    timers,
    pendingReconnectTimers,
    fireReconnectTimers
  };
}

// Start the provider and drive the socket to the open/connected state.
async function startConnected(provider) {
  const p = provider.start();
  const ws = FakeWebSocket.instances.at(-1);
  ws._open();
  await p;
  return ws;
}

describe('DeepgramWSProvider reconnect zombie fix', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  it('schedules a reconnect on a non-1000 close and re-invokes start() when the timer fires', async () => {
    const { provider, pendingReconnectTimers, fireReconnectTimers } = createProvider();

    const ws = await startConnected(provider);
    assert.equal(FakeWebSocket.instances.length, 1);

    // Abnormal close -> should schedule a reconnect timer
    ws._fireClose(1011);
    assert.equal(pendingReconnectTimers().length, 1, 'a reconnect timer should be queued');

    // Firing the timer should re-invoke start() -> a new socket is created
    fireReconnectTimers();
    assert.equal(FakeWebSocket.instances.length, 2, 'start() should have been re-invoked');
  });

  it('stop() before the reconnect timer fires cancels it (start() NOT re-invoked)', async () => {
    const { provider, pendingReconnectTimers, fireReconnectTimers } = createProvider();

    const ws = await startConnected(provider);
    ws._fireClose(1011);
    assert.equal(pendingReconnectTimers().length, 1);

    await provider.stop();
    assert.equal(pendingReconnectTimers().length, 0, 'stop() should clear the reconnect timer');

    // Even if the clock advances, nothing should fire.
    fireReconnectTimers();
    assert.equal(FakeWebSocket.instances.length, 1, 'no new socket after stop()');
  });

  it('_stopped guard prevents reconnect when a stray timer fires after stop()', async () => {
    const { provider, timers } = createProvider();

    const ws = await startConnected(provider);
    ws._fireClose(1011);

    // Capture the reconnect callback before stop() clears the timer,
    // simulating a timer that already fired / is mid-flight during stop().
    const reconnectCb = [...timers.values()].find(
      (t) => t.delay < CONNECT_TIMEOUT_DELAY
    ).fn;

    await provider.stop();

    // Manually invoke the stray callback -> the _stopped guard must bail.
    reconnectCb();
    assert.equal(FakeWebSocket.instances.length, 1, 'guard must block reconnect after stop()');
  });

  it('does not schedule a reconnect on a normal (code 1000) close', async () => {
    const { provider, pendingReconnectTimers, fireReconnectTimers } = createProvider();

    const ws = await startConnected(provider);
    ws._fireClose(1000);

    assert.equal(pendingReconnectTimers().length, 0, 'normal close must not schedule a reconnect');
    fireReconnectTimers();
    assert.equal(FakeWebSocket.instances.length, 1, 'no reconnect for normal close');
  });
});

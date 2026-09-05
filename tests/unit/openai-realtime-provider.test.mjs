import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

/**
 * Fake WebSocket capturing constructions, sends, and close calls.
 * Mirrors tests/unit/deepgram-ws-reconnect.test.mjs.
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

function base64ToInt16Array(base64) {
  // Buffer shares Node's pool; slice to a fresh aligned ArrayBuffer before
  // reading it as Int16 to avoid misaligned byte offsets.
  const binary = Buffer.from(base64, 'base64');
  const aligned = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  return new Int16Array(aligned);
}

/**
 * Build a sandboxed provider with fake fetch (session creation), fake
 * WebSocket, and controllable timers.
 */
function createProvider({ fetchImpl } = {}) {
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
  const pendingReconnectTimers = () =>
    [...timers.values()].filter((t) => t.delay < CONNECT_TIMEOUT_DELAY);
  const fireReconnectTimers = () => {
    for (const [id, t] of [...timers]) {
      if (t.delay < CONNECT_TIMEOUT_DELAY) {
        timers.delete(id);
        t.fn();
      }
    }
  };

  const calls = { fetch: [] };
  const defaultFetch = async (url, options) => {
    calls.fetch.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ client_secret: { value: 'ek_test', expires_at: 0 } })
    };
  };

  const DebugLogger = { log() {}, error() {} };
  const window = {};

  loadScript('js/stt/providers/openai_realtime.js', {
    window,
    DebugLogger,
    WebSocket: FakeWebSocket,
    fetch: fetchImpl || defaultFetch,
    btoa,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    console: { error() {}, log() {} }
  });

  const provider = new window.OpenAIRealtimeProvider({
    apiKey: 'test-openai-key',
    model: 'gpt-4o-transcribe',
    language: 'ja'
  });

  return { provider, calls, pendingReconnectTimers, fireReconnectTimers };
}

// Start the provider: mock the session REST call, then open the socket.
// The WS is created after an async session-creation step, so poll briefly.
async function startConnected(provider) {
  const p = provider.start();
  let ws = null;
  for (let i = 0; i < 50 && !(ws = FakeWebSocket.instances.at(-1)); i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  if (!ws) throw new Error('WebSocket was never created');
  ws._open();
  await p;
  return ws;
}

describe('OpenAIRealtimeProvider', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  it('creates a client secret and connects with subprotocol auth', async () => {
    const { provider, calls } = createProvider();

    const ws = await startConnected(provider);

    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.fetch[0].url, 'https://api.openai.com/v1/realtime/client_secrets');
    assert.equal(calls.fetch[0].options.headers.Authorization, 'Bearer test-openai-key');
    const session = JSON.parse(calls.fetch[0].options.body).session;
    assert.equal(session.type, 'transcription');
    assert.deepEqual(session.audio.input.format, { type: 'audio/pcm', rate: 24000 });
    assert.equal(session.audio.input.transcription.model, 'gpt-4o-transcribe');
    assert.equal(session.audio.input.transcription.language, 'ja');
    assert.equal(session.audio.input.turn_detection.type, 'server_vad');

    assert.equal(provider.isConnected, true);
    assert.equal(ws.url, 'wss://api.openai.com/v1/realtime?intent=transcription');
    assert.equal(JSON.stringify(ws.protocols), JSON.stringify(['realtime', 'openai-insecure-api-key.ek_test']));
  });

  it('sends session.update config on open', async () => {
    const { provider } = createProvider();
    const ws = await startConnected(provider);

    const updates = ws.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.type === 'session.update');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].session.type, 'transcription');
    assert.equal(updates[0].session.audio.input.transcription.model, 'gpt-4o-transcribe');
    assert.equal(updates[0].session.audio.input.turn_detection.type, 'server_vad');
  });

  it('sends audio as base64 input_audio_buffer.append events', async () => {
    const { provider } = createProvider();
    const ws = await startConnected(provider);

    const pcm = new Int16Array([1, -1, 32767, -32768]);
    provider.sendAudioData(pcm);

    const appends = ws.sent.map((s) => JSON.parse(s)).filter((m) => m.type === 'input_audio_buffer.append');
    assert.equal(appends.length, 1);
    const decoded = base64ToInt16Array(appends[0].audio);
    assert.deepEqual(Array.from(decoded), [1, -1, 32767, -32768]);
  });

  it('emits partials for deltas and finals for completed transcripts', async () => {
    const { provider } = createProvider();
    await startConnected(provider);

    const received = [];
    provider.setOnTranscript((text, isFinal) => received.push({ text, isFinal }));

    provider.handleMessage(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'こんにちは'
    }));
    provider.handleMessage(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.delta',
      delta: '、会議を始めます'
    }));
    provider.handleMessage(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'こんにちは、会議を始めます。'
    }));

    assert.equal(received[0].isFinal, false);
    assert.equal(received[0].text, 'こんにちは');
    assert.equal(received[1].text, 'こんにちは、会議を始めます');
    assert.equal(received[2].isFinal, true);
    assert.equal(received[2].text, 'こんにちは、会議を始めます。');
  });

  it('surfaces server error events through onError', async () => {
    const { provider } = createProvider();
    await startConnected(provider);

    const errors = [];
    provider.setOnError((e) => errors.push(e));
    provider.handleMessage(JSON.stringify({
      type: 'error',
      error: { message: 'quota exceeded' }
    }));

    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'quota exceeded');
  });

  it('falls back to gpt-4o-transcribe for realtime-incompatible models', () => {
    const { provider } = createProvider();
    // whisper-1 is batch-only and must not be used with the Realtime API
    const p = new provider.constructor({ apiKey: 'k', model: 'whisper-1' });
    assert.equal(p.model, 'gpt-4o-transcribe');
  });

  it('propagates session creation failures as errors', async () => {
    const failingFetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) });
    const { provider } = createProvider({ fetchImpl: failingFetch });

    await assert.rejects(provider.start(), /Realtime session error \(HTTP 401\): invalid key/);
    assert.equal(FakeWebSocket.instances.length, 0, 'no WS attempt when session creation fails');
  });

  it('does not schedule a reconnect on a normal (code 1000) close', async () => {
    const { provider, pendingReconnectTimers } = createProvider();

    const ws = await startConnected(provider);
    ws._fireClose(1000);

    assert.equal(pendingReconnectTimers().length, 0, 'normal close must not schedule a reconnect');
  });

  it('stop() cancels pending reconnects (no zombie sockets)', async () => {
    const { provider, pendingReconnectTimers, fireReconnectTimers } = createProvider();

    const ws = await startConnected(provider);
    ws._fireClose(1011);
    assert.equal(pendingReconnectTimers().length, 1);

    await provider.stop();
    fireReconnectTimers();
    assert.equal(FakeWebSocket.instances.length, 1, 'no new socket after stop()');
  });
});

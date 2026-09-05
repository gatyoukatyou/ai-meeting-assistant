import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScript } from '../helpers/load-script.mjs';

const { RealtimeUsageService } = loadScript('js/services/realtime-usage-service.js');
const { RealtimeVoiceTest } = loadScript('js/realtime-voice.js', { RealtimeUsageService });

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    emit(name, value) {
      (listeners.get(name) || []).forEach(handler => handler(value));
    }
  };
}

function createStream(track) {
  return {
    active: true,
    getAudioTracks: () => [track],
    getTracks: () => [track]
  };
}

function createAudio() {
  return {
    autoplay: false,
    playsInline: false,
    dataset: {},
    srcObject: null,
    setAttribute() {},
    play: () => Promise.resolve(),
    pause() {}
  };
}

function createWebRtcFakes() {
  const peers = [];
  class FakePeerConnection {
    constructor() {
      this.events = eventTarget();
      this.connectionState = 'connected';
      this.closed = false;
      this.addedTracks = [];
      peers.push(this);
    }

    addEventListener(name, handler) {
      this.events.addEventListener(name, handler);
    }

    addTrack(track, stream) {
      this.addedTracks.push({ track, stream });
    }

    createDataChannel() {
      this.dataChannel = eventTarget();
      this.dataChannel.readyState = 'open';
      this.dataChannel.sent = [];
      this.dataChannel.closed = false;
      this.dataChannel.send = message => this.dataChannel.sent.push(message);
      this.dataChannel.close = () => {
        this.dataChannel.closed = true;
      };
      return this.dataChannel;
    }

    async createOffer() {
      return { type: 'offer', sdp: 'v=0\r\nmock-offer' };
    }

    async setLocalDescription(description) {
      this.localDescription = description;
    }

    async setRemoteDescription(description) {
      this.remoteDescription = description;
    }

    close() {
      this.closed = true;
      this.connectionState = 'closed';
    }
  }
  return { FakePeerConnection, peers };
}

function createFetchMock() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/realtime/client-secret') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ value: 'ek_mock_only' }) };
    }
    return { ok: true, status: 200, text: async () => 'v=0\r\nmock-answer' };
  };
  return { fetchImpl, calls };
}

test('uses a shared microphone stream, prevents double start, handles AI events, and releases WebRTC resources', async () => {
  const track = {
    kind: 'audio',
    readyState: 'live',
    stopCount: 0,
    stop() {
      this.stopCount += 1;
    }
  };
  const sharedStream = createStream(track);
  const audio = createAudio();
  const { FakePeerConnection, peers } = createWebRtcFakes();
  const { fetchImpl, calls } = createFetchMock();
  const states = [];
  const assistantTexts = [];
  const usageUpdates = [];
  let getUserMediaCalls = 0;
  const controller = RealtimeVoiceTest.create({
    RealtimeUsageService,
    RTCPeerConnection: FakePeerConnection,
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return sharedStream;
      }
    },
    fetchImpl,
    audioElement: audio,
    preserveAudioElement: true,
    sharedStreamProvider: () => sharedStream,
    onStateChange: state => states.push(state),
    onAssistantText: text => assistantTexts.push(text),
    onUsage: usage => usageUpdates.push(usage)
  });

  await Promise.all([controller.start(), controller.start()]);

  assert.equal(controller.getState(), RealtimeVoiceTest.STATES.CONNECTED);
  assert.equal(getUserMediaCalls, 0);
  assert.equal(calls.length, 2);
  assert.equal(peers.length, 1);
  assert.equal(peers[0].addedTracks.length, 1);
  assert.equal(JSON.parse(peers[0].dataChannel.sent[0]).type, 'session.update');
  assert.equal(JSON.parse(peers[0].dataChannel.sent[0]).session.output_modalities[0], 'audio');

  peers[0].dataChannel.emit('message', { data: JSON.stringify({ type: 'response.created' }) });
  peers[0].dataChannel.emit('message', {
    data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: '日本語の' })
  });
  peers[0].dataChannel.emit('message', {
    data: JSON.stringify({
      type: 'response.output_audio_transcript.done',
      transcript: '日本語の回答'
    })
  });
  peers[0].dataChannel.emit('message', {
    data: JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '利用者の発言'
    })
  });
  peers[0].dataChannel.emit('message', {
    data: JSON.stringify({
      type: 'response.done',
      response: {
        usage: {
          total_tokens: 20,
          input_tokens: 12,
          output_tokens: 8,
          input_token_details: { audio_tokens: 12 },
          output_token_details: { audio_tokens: 8 }
        }
      }
    })
  });

  assert.equal(controller.getState(), RealtimeVoiceTest.STATES.CONNECTED);
  assert.deepEqual(assistantTexts, ['日本語の回答']);
  assert.equal(usageUpdates.length, 1);
  assert.equal(usageUpdates[0].totalTokens, 20);
  assert.equal(states.includes(RealtimeVoiceTest.STATES.RESPONDING), true);

  await controller.stop('test');
  assert.equal(controller.getState(), RealtimeVoiceTest.STATES.ENDED);
  assert.equal(track.stopCount, 0);
  assert.equal(peers[0].closed, true);
  assert.equal(peers[0].dataChannel.closed, true);
  assert.equal(audio.srcObject, null);
});

test('stops a microphone stream acquired only for the Realtime test', async () => {
  const track = {
    kind: 'audio',
    readyState: 'live',
    stopCount: 0,
    stop() {
      this.stopCount += 1;
    }
  };
  const ownedStream = createStream(track);
  const { FakePeerConnection } = createWebRtcFakes();
  const { fetchImpl } = createFetchMock();
  const controller = RealtimeVoiceTest.create({
    RTCPeerConnection: FakePeerConnection,
    mediaDevices: { getUserMedia: async () => ownedStream },
    fetchImpl,
    createAudioElement: createAudio,
    sharedStreamProvider: () => null
  });

  await controller.start();
  await controller.stop('test');

  assert.equal(track.stopCount, 1);
  assert.equal(controller.usesSharedStream(), false);
});

test('builds fresh instructions at start via instructionsProvider (meeting context)', async () => {
  const track = { kind: 'audio', readyState: 'live', stopCount: 0, stop() { this.stopCount += 1; } };
  const { FakePeerConnection, peers } = createWebRtcFakes();
  const { fetchImpl } = createFetchMock();
  let builtCount = 0;
  const controller = RealtimeVoiceTest.create({
    RTCPeerConnection: FakePeerConnection,
    mediaDevices: { getUserMedia: async () => createStream({ readyState: 'live', stopCount: 0, stop() {} }) },
    fetchImpl,
    createAudioElement: createAudio,
    sharedStreamProvider: () => null,
    instructionsProvider: () => {
      builtCount += 1;
      return `${RealtimeVoiceTest.DEFAULT_INSTRUCTIONS}\n\n# 会議コンテキスト\n直近の文字起こし:\n[10:00] 会議内容のサンプル`;
    }
  });

  await controller.start();
  const sent = JSON.parse(peers[0].dataChannel.sent[0]);
  assert.equal(sent.type, 'session.update');
  assert.match(sent.session.instructions, /# 会議コンテキスト/);
  assert.match(sent.session.instructions, /\[10:00\] 会議内容のサンプル/);
  assert.equal(builtCount, 1);

  await controller.stop('test');
});

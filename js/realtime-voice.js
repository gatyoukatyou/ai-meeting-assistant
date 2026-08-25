const RealtimeVoiceTest = (function () {
  'use strict';

  const STATES = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RESPONDING: 'responding',
    ENDED: 'ended',
    ERROR: 'error'
  });

  const ACTIVE_STATES = new Set([STATES.CONNECTING, STATES.CONNECTED, STATES.RESPONDING]);
  const DEFAULT_MODEL = 'gpt-realtime-2.1';
  const DEFAULT_TOKEN_ENDPOINT = '/api/realtime/client-secret';
  const DEFAULT_CALLS_ENDPOINT = 'https://api.openai.com/v1/realtime/calls';
  const DEFAULT_INSTRUCTIONS =
    '日本語で短く自然に回答してください。会議の音声アシスタントとして、回答は30秒以内を目安にしてください。';

  class RealtimeVoiceError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'RealtimeVoiceError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function getRoot() {
    return typeof window !== 'undefined' ? window : globalThis;
  }

  function isUsableStream(stream) {
    if (!stream || typeof stream.getAudioTracks !== 'function') return false;
    return stream.getAudioTracks().some(track => track && track.readyState !== 'ended');
  }

  function bindEvent(target, eventName, handler) {
    if (!target) return;
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(eventName, handler);
    } else {
      target[`on${eventName}`] = handler;
    }
  }

  function parseJson(value) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function mapHttpError(status) {
    if (status === 401 || status === 403) return 'authentication';
    if (status === 429) return 'rate_limit';
    if (status >= 500 || status === 408) return 'temporary_server';
    return 'invalid_request';
  }

  function makeError(code, fallbackMessage, cause) {
    return new RealtimeVoiceError(code, fallbackMessage, cause);
  }

  class Controller {
    constructor(options = {}) {
      const root = getRoot();
      this.model = options.model || DEFAULT_MODEL;
      this.tokenEndpoint = options.tokenEndpoint || DEFAULT_TOKEN_ENDPOINT;
      this.callsEndpoint = options.callsEndpoint || DEFAULT_CALLS_ENDPOINT;
      this.instructions = options.instructions || DEFAULT_INSTRUCTIONS;
      this.fetchImpl =
        options.fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
      this.mediaDevices = options.mediaDevices || root.navigator?.mediaDevices;
      this.RTCPeerConnection = options.RTCPeerConnection || root.RTCPeerConnection;
      this.document = options.document || root.document;
      this.sharedStreamProvider = options.sharedStreamProvider || (() => null);
      this.createAudioElement =
        options.createAudioElement || (() => this.document?.createElement('audio'));
      this.preserveAudioElement = options.preserveAudioElement === true;
      this.onStateChange = options.onStateChange || (() => {});
      this.onAssistantText = options.onAssistantText || (() => {});
      this.onUsage = options.onUsage || (() => {});
      this.onError = options.onError || (() => {});
      this.state = STATES.IDLE;
      this.pc = null;
      this.dataChannel = null;
      this.audioElement = options.audioElement || null;
      this.ownsAudioElement = !this.audioElement;
      this.microphoneStream = null;
      this.ownsMicrophoneStream = false;
      this.startPromise = null;
      this.stopPromise = null;
      this.intentionalStop = false;
      this.responseTextBuffer = '';
      this.responseTextCommitted = false;
      this.responseCount = 0;
      this.usage = RealtimeUsageService.createEmptyUsage();
      this.sessionUpdateSent = false;
    }

    getState() {
      return this.state;
    }

    isActive() {
      return ACTIVE_STATES.has(this.state);
    }

    usesSharedStream() {
      return Boolean(this.microphoneStream && !this.ownsMicrophoneStream);
    }

    getUsage() {
      return { ...this.usage, responseCount: this.responseCount };
    }

    _setState(nextState, details = {}) {
      this.state = nextState;
      this.onStateChange(nextState, details);
    }

    async start() {
      if (this.startPromise) return this.startPromise;
      if (this.isActive()) {
        throw makeError('already_active', 'Realtime voice test is already active.');
      }
      this.startPromise = this._start();
      try {
        return await this.startPromise;
      } finally {
        this.startPromise = null;
      }
    }

    async _start() {
      this.intentionalStop = false;
      this.responseTextBuffer = '';
      this.responseTextCommitted = false;
      this.responseCount = 0;
      this.usage = RealtimeUsageService.createEmptyUsage();
      this._setState(STATES.CONNECTING);

      try {
        const sharedStream = this.sharedStreamProvider();
        if (isUsableStream(sharedStream)) {
          this.microphoneStream = sharedStream;
          this.ownsMicrophoneStream = false;
        } else {
          if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== 'function') {
            throw makeError('unsupported', 'This browser cannot access a microphone.');
          }
          this.microphoneStream = await this.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          this.ownsMicrophoneStream = true;
        }

        const token = await this._fetchClientSecret();
        if (typeof this.RTCPeerConnection !== 'function') {
          throw makeError('unsupported', 'This browser does not support WebRTC.');
        }

        this.pc = new this.RTCPeerConnection();
        this._setupRemoteAudio();
        this._setupPeerConnectionEvents();

        const tracks = this.microphoneStream.getAudioTracks();
        if (!tracks.length)
          throw makeError('microphone', 'No microphone audio track is available.');
        tracks.forEach(track => this.pc.addTrack(track, this.microphoneStream));

        this.dataChannel = this.pc.createDataChannel('oai-events');
        this._setupDataChannelEvents();

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        const answerSdp = await this._postOffer(offer?.sdp, token);
        await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
        await this._waitForDataChannelOpen();
        this._sendSessionUpdate();

        if (this.state === STATES.CONNECTING) this._setState(STATES.CONNECTED);
        return true;
      } catch (error) {
        const normalized =
          error instanceof RealtimeVoiceError
            ? error
            : makeError('connection', 'Realtime voice connection failed.', error);
        await this._cleanupResources();
        this._setState(STATES.ERROR, { error: normalized });
        this.onError(normalized);
        throw normalized;
      }
    }

    async _fetchClientSecret() {
      if (!this.fetchImpl) throw makeError('network', 'Network access is unavailable.');
      let response;
      try {
        response = await this.fetchImpl(this.tokenEndpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: '{}'
        });
      } catch (error) {
        throw makeError('network', 'The local Realtime server could not be reached.', error);
      }

      const payload = parseJson(await response.text());
      if (!response.ok) {
        const code = payload?.error?.code || mapHttpError(response.status);
        throw makeError(code, 'The local Realtime server rejected the request.');
      }
      if (!payload || typeof payload.value !== 'string' || payload.value.length === 0) {
        throw makeError(
          'token_response',
          'The local Realtime server returned an invalid client secret response.'
        );
      }
      return payload.value;
    }

    async _postOffer(sdp, token) {
      if (!sdp || typeof sdp !== 'string')
        throw makeError('connection', 'The browser did not create an SDP offer.');
      let response;
      try {
        response = await this.fetchImpl(this.callsEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/sdp',
            Accept: 'application/sdp'
          },
          body: sdp
        });
      } catch (error) {
        throw makeError('network', 'The Realtime API could not be reached.', error);
      }
      const answerSdp = await response.text();
      if (!response.ok || !answerSdp.trim()) {
        throw makeError(
          mapHttpError(response.status),
          'The Realtime WebRTC connection was rejected.'
        );
      }
      return answerSdp;
    }

    _setupRemoteAudio() {
      if (!this.audioElement) {
        this.audioElement = this.createAudioElement();
        if (!this.audioElement) throw makeError('audio', 'An audio element could not be created.');
        this.ownsAudioElement = !this.preserveAudioElement;
        this.audioElement.autoplay = true;
        this.audioElement.playsInline = true;
        this.audioElement.setAttribute?.('playsinline', '');
        this.audioElement.setAttribute?.('aria-label', 'Realtime AI audio');
        if (!this.audioElement.dataset) this.audioElement.dataset = {};
        this.audioElement.dataset.realtimeAudio = 'true';
        if (this.document?.body && !this.audioElement.parentNode) {
          this.audioElement.className = 'realtime-audio-output';
          this.document.body.appendChild(this.audioElement);
        }
      }
      this.pc.ontrack = event => {
        const stream = event?.streams?.[0];
        if (stream) {
          this.audioElement.srcObject = stream;
          const playPromise = this.audioElement.play?.();
          playPromise?.catch?.(() => {});
        }
      };
    }

    _setupPeerConnectionEvents() {
      bindEvent(this.pc, 'connectionstatechange', () => {
        const connectionState = this.pc?.connectionState;
        if (connectionState === 'failed') {
          this._failFromConnection('connection');
        } else if (connectionState === 'closed' && !this.intentionalStop) {
          this._failFromConnection('connection');
        }
      });
    }

    _setupDataChannelEvents() {
      bindEvent(this.dataChannel, 'open', () => {
        this._sendSessionUpdate();
        if (this.state === STATES.CONNECTING) this._setState(STATES.CONNECTED);
      });
      bindEvent(this.dataChannel, 'message', event => this._handleDataChannelMessage(event?.data));
      bindEvent(this.dataChannel, 'error', () => this._failFromConnection('connection'));
      bindEvent(this.dataChannel, 'close', () => {
        if (!this.intentionalStop && this.isActive()) this._failFromConnection('connection');
      });
    }

    _sendSessionUpdate() {
      if (this.sessionUpdateSent) return true;
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') return false;
      const event = {
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions: this.instructions,
          output_modalities: ['audio'],
          audio: { output: { voice: 'marin' } }
        }
      };
      try {
        this.dataChannel.send(JSON.stringify(event));
        this.sessionUpdateSent = true;
        return true;
      } catch (error) {
        this._failFromConnection('connection', error);
        return false;
      }
    }

    async _waitForDataChannelOpen(timeoutMs = 10000) {
      if (!this.dataChannel)
        throw makeError('connection', 'The Realtime data channel was not created.');
      if (this.dataChannel.readyState === 'open') return;
      await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(makeError('connection', 'The Realtime data channel did not open in time.'));
        }, timeoutMs);
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        bindEvent(this.dataChannel, 'open', finish);
        bindEvent(this.dataChannel, 'error', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(makeError('connection', 'The Realtime data channel failed to open.'));
        });
      });
    }

    _handleDataChannelMessage(rawData) {
      const event = parseJson(rawData);
      if (!event || typeof event.type !== 'string') return;

      if (event.type === 'error') {
        const code = event.error?.code === 'rate_limit_exceeded' ? 'rate_limit' : 'realtime_error';
        this._failFromConnection(code);
        return;
      }

      if (
        event.type === 'response.created' ||
        event.type === 'response.output_audio.delta' ||
        event.type === 'response.audio.delta'
      ) {
        if (this.state !== STATES.RESPONDING) this._setState(STATES.RESPONDING);
      }

      const transcriptMatch = event.type.match(
        /^response\.(?:output_)?audio_transcript\.(delta|done)$/
      );
      if (transcriptMatch) {
        if (transcriptMatch[1] === 'delta') {
          if (typeof event.delta === 'string') this.responseTextBuffer += event.delta;
        } else {
          this._commitAssistantText(event.transcript || this.responseTextBuffer);
        }
      }

      if (event.type === 'response.done') {
        if (event.response?.usage) {
          this.usage = RealtimeUsageService.addUsage(this.usage, event.response.usage);
          this.onUsage(this.getUsage());
        }
        if (!this.responseTextCommitted) {
          this._commitAssistantText(this._extractResponseText(event.response));
        }
        this.responseTextBuffer = '';
        this.responseTextCommitted = false;
        if (this.isActive()) this._setState(STATES.CONNECTED);
      }
      // Input transcription events are intentionally ignored: only AI output is
      // copied to the existing timeline, preventing a second user transcript.
    }

    _extractResponseText(response) {
      if (!response || !Array.isArray(response.output)) return this.responseTextBuffer;
      const parts = [];
      response.output.forEach(item => {
        (Array.isArray(item?.content) ? item.content : []).forEach(content => {
          if (typeof content?.transcript === 'string') parts.push(content.transcript);
          else if (typeof content?.text === 'string') parts.push(content.text);
        });
      });
      return parts.join(' ').trim() || this.responseTextBuffer;
    }

    _commitAssistantText(text) {
      const content = typeof text === 'string' ? text.trim() : '';
      if (!content || this.responseTextCommitted) return;
      this.responseTextCommitted = true;
      this.responseCount += 1;
      this.onAssistantText(content, this.getUsage());
    }

    _failFromConnection(code, cause) {
      if (this.intentionalStop || !this.isActive()) return;
      const error = makeError(code, 'The Realtime session ended unexpectedly.', cause);
      this._cleanupResources().finally(() => {
        this._setState(STATES.ERROR, { error });
        this.onError(error);
      });
    }

    async stop(reason = 'user') {
      if (this.stopPromise) return this.stopPromise;
      if (!this.isActive() && !this.pc && !this.dataChannel && !this.audioElement) {
        if (this.state === STATES.IDLE) this._setState(STATES.ENDED, { reason });
        return false;
      }
      this.stopPromise = (async () => {
        this.intentionalStop = true;
        await this._cleanupResources();
        this._setState(STATES.ENDED, { reason });
        return true;
      })();
      try {
        return await this.stopPromise;
      } finally {
        this.stopPromise = null;
      }
    }

    async _cleanupResources() {
      const dataChannel = this.dataChannel;
      const pc = this.pc;
      const stream = this.microphoneStream;
      const audioElement = this.audioElement;
      this.dataChannel = null;
      this.pc = null;
      this.microphoneStream = null;
      this.audioElement = null;
      this.sessionUpdateSent = false;

      try {
        dataChannel?.close?.();
      } catch (_) {
        /* Cleanup is best effort. */
      }
      try {
        pc?.close?.();
      } catch (_) {
        /* Cleanup is best effort. */
      }
      if (this.ownsMicrophoneStream && stream) {
        stream.getTracks?.().forEach(track => {
          try {
            track.stop?.();
          } catch (_) {
            /* Cleanup is best effort. */
          }
        });
      }
      this.ownsMicrophoneStream = false;
      if (audioElement) {
        try {
          audioElement.pause?.();
          audioElement.srcObject = null;
          if (this.ownsAudioElement) audioElement.remove?.();
        } catch (_) {
          /* Cleanup is best effort. */
        }
      }
      this.ownsAudioElement = false;
    }
  }

  return Object.freeze({
    STATES,
    DEFAULT_MODEL,
    RealtimeVoiceError,
    create(options) {
      return new Controller(options);
    }
  });
})();

if (typeof window !== 'undefined') {
  window.RealtimeVoiceTest = RealtimeVoiceTest;
}

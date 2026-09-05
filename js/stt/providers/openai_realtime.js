/**
 * OpenAI Realtime Transcribe STT Provider (WebSocket)
 *
 * OpenAI Realtime API の transcription-only セッションで真のリアルタイム文字起こし
 *
 * 認証フロー（ブラウザ BYOK）:
 * 1. POST /v1/realtime/transcription_sessions（実APIキー）で一時トークン(client_secret)を発行
 * 2. wss://api.openai.com/v1/realtime?intent=transcription へ
 *    subprotocol ["realtime", "openai-insecure-api-key.<ephemeral>"] で接続
 *
 * 音声: PCM16 mono 24kHz（Realtime API 要件）→ sendAudioData で base64 化して送信
 * サンプルレート側の対応は app.js 側の PCMStreamProcessor 設定（24kHz）で行う
 */

class OpenAIRealtimeProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey || (typeof SecureStorage !== 'undefined' ? SecureStorage.getApiKey('openai') : null);
    const requestedModel = config.model || (typeof SecureStorage !== 'undefined' ? SecureStorage.getModel('openai') : null);
    // whisper-1 は Realtime API 非対応（バッチ専用）。互換モデルは既定へフォールバック
    const supportedModels = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'];
    this.model = supportedModels.includes(requestedModel) ? requestedModel : 'gpt-4o-transcribe';
    this.language = config.language || 'ja';

    this.ws = null;
    this.onTranscript = null;
    this.onError = null;
    this.onStatusChange = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this._connectTimer = null;
    this._reconnectTimer = null;
    this._stopped = false;
  }

  // イベントハンドラ設定
  setOnTranscript(callback) { this.onTranscript = callback; }
  setOnError(callback) { this.onError = callback; }
  setOnStatusChange(callback) { this.onStatusChange = callback; }

  /**
   * 一時トークンを発行してWebSocket接続を開始
   */
  async start() {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // 停止フラグをリセット（新規開始）
    this._stopped = false;

    const ephemeralKey = await this._createTranscriptionSession();
    return this._connect(ephemeralKey);
  }

  /**
   * transcription session を作成し一時トークンを取得
   */
  async _createTranscriptionSession() {
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/realtime/transcription_sessions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: this.model,
            language: this.language === 'auto' ? undefined : this.language
          },
          turn_detection: { type: 'server_vad' }
        })
      });
    } catch (error) {
      throw new Error('Failed to create realtime transcription session: ' + (error && error.message || 'network error'));
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error && (await response.json()).error.message || ''; } catch (_) { /* ignore */ }
      throw new Error('Realtime session error (HTTP ' + response.status + ')' + (detail ? ': ' + detail : ''));
    }
    const data = await response.json();
    const secret = data && data.client_secret && data.client_secret.value;
    if (!secret) {
      throw new Error('Realtime session response missing client_secret');
    }
    return secret;
  }

  /**
   * WebSocket接続（subprotocol認証）
   */
  _connect(ephemeralKey) {
    const provider = this;
    return new Promise((resolve, reject) => {
      provider.updateStatus('connecting');

      const wsUrl = 'wss://api.openai.com/v1/realtime?intent=transcription';
      DebugLogger.log('[OpenAIRealtime]', 'Connecting to Realtime API...');

      const ws = new WebSocket(wsUrl, ['realtime', 'openai-insecure-api-key.' + ephemeralKey]);
      provider.ws = ws;

      if (provider._connectTimer) {
        clearTimeout(provider._connectTimer);
        provider._connectTimer = null;
      }

      ws.onopen = () => {
        if (provider._connectTimer) {
          clearTimeout(provider._connectTimer);
          provider._connectTimer = null;
        }
        if (provider._stopped) {
          DebugLogger.log('[OpenAIRealtime]', 'Opened after stop, closing immediately');
          try { ws.close(1000, 'Stopped during connect'); } catch (e) { /* ignore */ }
          resolve();
          return;
        }
        DebugLogger.log('[OpenAIRealtime]', 'WebSocket connected');
        provider.isConnected = true;
        provider.reconnectAttempts = 0;
        provider.updateStatus('connected');
        provider._sendSessionConfig();
        resolve();
      };

      ws.onmessage = (event) => {
        provider.handleMessage(event.data);
      };

      ws.onerror = () => {
        DebugLogger.error('[OpenAIRealtime]', 'WebSocket error');
        provider.emitError(new Error('WebSocket connection error'));
      };

      ws.onclose = (event) => {
        if (provider._connectTimer) {
          clearTimeout(provider._connectTimer);
          provider._connectTimer = null;
        }
        DebugLogger.log('[OpenAIRealtime]', 'WebSocket closed:', event.code);
        provider.isConnected = false;

        if (!provider._stopped && event.code !== 1000 && provider.reconnectAttempts < provider.maxReconnectAttempts) {
          provider.reconnectAttempts++;
          DebugLogger.log('[OpenAIRealtime]', 'Attempting reconnect (' + provider.reconnectAttempts + '/' + provider.maxReconnectAttempts + ')');
          provider.updateStatus('reconnecting');
          provider._reconnectTimer = setTimeout(() => {
            provider._reconnectTimer = null;
            if (provider._stopped) return;
            provider.start().catch(provider.emitError.bind(provider));
          }, 1000 * provider.reconnectAttempts);
        } else {
          provider.updateStatus('disconnected');
        }
      };

      provider._connectTimer = setTimeout(() => {
        if (provider.ws !== ws) return;
        if (!provider.isConnected && ws.readyState === WebSocket.CONNECTING) {
          DebugLogger.log('[OpenAIRealtime]', 'Connection timeout, closing...');
          try { ws.close(); } catch (e) { /* ignore */ }
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * セッション設定を送信（一時トークンに紐づく設定と二重だが冪等）
   */
  _sendSessionConfig() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: this.model,
            language: this.language === 'auto' ? undefined : this.language
          },
          turn_detection: { type: 'server_vad' }
        }
      }));
    } catch (e) {
      // 設定送信失敗は致命的でない（セッション作成時に設定済み）
      DebugLogger.error('[OpenAIRealtime]', 'session.update failed:', e && e.message);
    }
  }

  /**
   * WebSocket接続を停止
   */
  async stop() {
    this._stopped = true;

    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (e) {
        // Ignore close errors
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.updateStatus('stopped');
    DebugLogger.log('[OpenAIRealtime]', 'Provider stopped');
  }

  /**
   * 音声データを送信（PCM16 24kHz → base64）
   * @param {Int16Array|ArrayBuffer} pcmData
   */
  sendAudioData(pcmData) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    // 入力をInt16Arrayとして正規化（realmをまたぐinstanceofに依存しない）し、
    // buffer全体ではなく実際の範囲のみをbase64化する
    const view = pcmData instanceof Int16Array ? pcmData : new Int16Array(pcmData);
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    const audio = this._arrayBufferToBase64(buffer);
    try {
      this.ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    } catch (e) {
      // 送信エラーは無視（onclose で再接続処理される）
    }
  }

  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  /**
   * サーバーイベントを処理
   */
  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      DebugLogger.error('[OpenAIRealtime]', 'Failed to parse message');
      return;
    }

    switch (message.type) {
      case 'conversation.item.input_audio_transcription.delta': {
        const delta = message.delta || '';
        if (delta) {
          this._partialText = (this._partialText || '') + delta;
          this.emitTranscript(this._partialText, false);
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (message.transcript || '').trim();
        this._partialText = '';
        if (text) {
          this.emitTranscript(text, true);
        }
        break;
      }
      case 'error': {
        DebugLogger.error('[OpenAIRealtime]', 'Error from server:', message.error && message.error.message || 'unknown');
        this.emitError(new Error(message.error && message.error.message || 'Realtime API error'));
        break;
      }
      default:
        // session.created / session.updated / input_audio_buffer 系は無視
        break;
    }
  }

  // ステータス更新
  updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  // エラー通知
  emitError(error) {
    DebugLogger.error('[OpenAIRealtime]', 'Error:', error.message || 'unknown');
    if (this.onError) {
      this.onError(error);
    }
  }

  // 文字起こし結果通知
  emitTranscript(text, isFinal = true) {
    if (this.onTranscript && text) {
      this.onTranscript(text, isFinal);
    }
  }

  /**
   * プロバイダー情報を取得
   */
  getInfo() {
    return {
      id: 'openai_realtime',
      type: 'streaming',
      name: 'OpenAI Realtime Transcribe',
      model: this.model,
      isConnected: this.isConnected
    };
  }
}

// グローバルに公開
window.OpenAIRealtimeProvider = OpenAIRealtimeProvider;

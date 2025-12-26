/**
 * Deepgram Realtime STT Provider (WebSocket)
 *
 * 真のリアルタイム文字起こし
 * WebSocket経由でPCMストリームを送信
 */

class DeepgramWSProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey || SecureStorage.getApiKey('deepgram');
    this.model = config.model || SecureStorage.getModel('deepgram') || 'nova-2';
    this.language = config.language || 'ja';

    this.ws = null;
    this.onTranscript = null;
    this.onError = null;
    this.onStatusChange = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  // イベントハンドラ設定
  setOnTranscript(callback) { this.onTranscript = callback; }
  setOnError(callback) { this.onError = callback; }
  setOnStatusChange(callback) { this.onStatusChange = callback; }

  /**
   * WebSocket接続を開始
   */
  async start() {
    if (!this.apiKey) {
      throw new Error('Deepgram API key is required');
    }

    return new Promise((resolve, reject) => {
      this.updateStatus('connecting');

      // Deepgram WebSocket URL
      const wsUrl = new URL('wss://api.deepgram.com/v1/listen');
      wsUrl.searchParams.set('model', this.model);
      wsUrl.searchParams.set('language', this.language);
      wsUrl.searchParams.set('encoding', 'linear16');
      wsUrl.searchParams.set('sample_rate', '16000');
      wsUrl.searchParams.set('channels', '1');
      wsUrl.searchParams.set('punctuate', 'true');
      wsUrl.searchParams.set('interim_results', 'true');

      console.log('[Deepgram] Connecting to:', wsUrl.toString());

      this.ws = new WebSocket(wsUrl.toString(), ['token', this.apiKey]);

      this.ws.onopen = () => {
        console.log('[Deepgram] WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Deepgram] WebSocket error:', error);
        this.emitError(new Error('WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        console.log('[Deepgram] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;

        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[Deepgram] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.updateStatus('reconnecting');
          setTimeout(() => this.start().catch(console.error), 1000 * this.reconnectAttempts);
        } else {
          this.updateStatus('disconnected');
        }
      };

      // 接続タイムアウト
      setTimeout(() => {
        if (!this.isConnected) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * WebSocket接続を停止
   */
  async stop() {
    if (this.ws) {
      // 正常終了を通知
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    this.isConnected = false;
    this.updateStatus('stopped');
    console.log('[Deepgram] Provider stopped');
  }

  /**
   * 音声データを送信
   * @param {Int16Array|ArrayBuffer} pcmData - PCM16データ
   */
  sendAudioData(pcmData) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // ArrayBufferに変換
    const buffer = pcmData instanceof Int16Array ? pcmData.buffer : pcmData;
    this.ws.send(buffer);
  }

  /**
   * WebSocketメッセージを処理
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === 'Results') {
        var transcript = '';
        if (message.channel && message.channel.alternatives &&
            message.channel.alternatives[0] && message.channel.alternatives[0].transcript) {
          transcript = message.channel.alternatives[0].transcript;
        }
        const isFinal = message.is_final || false;

        if (transcript) {
          console.log(`[Deepgram] ${isFinal ? 'Final' : 'Partial'}:`, transcript);
          this.emitTranscript(transcript, isFinal);
        }
      } else if (message.type === 'Metadata') {
        console.log('[Deepgram] Metadata:', message);
      } else if (message.type === 'Error') {
        console.error('[Deepgram] Error from server:', message);
        this.emitError(new Error(message.message || 'Unknown error'));
      }
    } catch (e) {
      console.error('[Deepgram] Failed to parse message:', e);
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
    console.error('[Deepgram] Error:', error);
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
      id: 'deepgram_realtime',
      type: 'streaming',
      name: 'Deepgram Realtime',
      model: this.model,
      isConnected: this.isConnected
    };
  }
}

// グローバルに公開
window.DeepgramWSProvider = DeepgramWSProvider;

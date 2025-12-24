/**
 * Google Cloud STT Provider (WebSocket via Backend Proxy)
 *
 * 真のリアルタイム文字起こし
 * バックエンドプロキシ経由でGCP Speech-to-Text APIに接続
 *
 * Note: GCP STTはgRPCが必要なため、ブラウザから直接接続できない。
 * バックエンドサーバーでgRPC接続を中継する必要がある。
 */

class GCPProxyWSProvider {
  constructor(config) {
    this.config = config;
    this.proxyUrl = config.proxyUrl || SecureStorage.getOption('gcpProxyUrl', '');
    this.authToken = config.authToken || SecureStorage.getOption('gcpProxyToken', '');
    this.language = config.language || 'ja-JP';

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
    if (!this.proxyUrl) {
      throw new Error('GCP proxy URL is required. Please configure a backend server.');
    }

    // URLの検証
    try {
      const url = new URL(this.proxyUrl);
      if (!url.protocol.startsWith('ws')) {
        throw new Error('Proxy URL must use WebSocket protocol (ws:// or wss://)');
      }
    } catch (e) {
      throw new Error(`Invalid proxy URL: ${e.message}`);
    }

    return new Promise((resolve, reject) => {
      this.updateStatus('connecting');

      // プロキシURLにパラメータを追加
      const wsUrl = new URL(this.proxyUrl);
      wsUrl.searchParams.set('language', this.language);
      wsUrl.searchParams.set('encoding', 'LINEAR16');
      wsUrl.searchParams.set('sampleRate', '16000');

      if (this.authToken) {
        wsUrl.searchParams.set('token', this.authToken);
      }

      console.log('[GCP Proxy] Connecting to:', wsUrl.toString());

      this.ws = new WebSocket(wsUrl.toString());

      this.ws.onopen = () => {
        console.log('[GCP Proxy] WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[GCP Proxy] WebSocket error:', error);
        this.emitError(new Error('WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        console.log('[GCP Proxy] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;

        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[GCP Proxy] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
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
      // 終了メッセージを送信
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      }
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    this.isConnected = false;
    this.updateStatus('stopped');
    console.log('[GCP Proxy] Provider stopped');
  }

  /**
   * 音声データを送信
   * @param {Int16Array|ArrayBuffer} pcmData - PCM16データ
   */
  sendAudioData(pcmData) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // ArrayBufferとして送信
    const buffer = pcmData instanceof Int16Array ? pcmData.buffer : pcmData;
    this.ws.send(buffer);
  }

  /**
   * WebSocketメッセージを処理
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      // プロキシサーバーからのメッセージ形式に合わせて処理
      if (message.type === 'transcript') {
        const transcript = message.text || message.transcript || '';
        const isFinal = message.isFinal || message.is_final || false;

        if (transcript) {
          console.log(`[GCP Proxy] ${isFinal ? 'Final' : 'Partial'}:`, transcript);
          this.emitTranscript(transcript, isFinal);
        }
      } else if (message.type === 'error') {
        console.error('[GCP Proxy] Error from server:', message.error);
        this.emitError(new Error(message.error));
      } else if (message.type === 'connected') {
        console.log('[GCP Proxy] Backend connected to GCP');
      } else if (message.type === 'status') {
        console.log('[GCP Proxy] Status:', message.status);
      }
    } catch (e) {
      console.error('[GCP Proxy] Failed to parse message:', e);
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
    console.error('[GCP Proxy] Error:', error);
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
      id: 'gcp_stt_proxy',
      type: 'streaming',
      name: 'Google Cloud STT (Proxy)',
      proxyUrl: this.proxyUrl,
      isConnected: this.isConnected
    };
  }
}

// グローバルに公開
window.GCPProxyWSProvider = GCPProxyWSProvider;

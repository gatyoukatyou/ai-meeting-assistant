/**
 * AssemblyAI Realtime STT Provider (WebSocket)
 *
 * 真のリアルタイム文字起こし
 * WebSocket経由でPCMストリームを送信
 */

class AssemblyAIWSProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey || SecureStorage.getApiKey('assemblyai');
    this.language = config.language || 'ja';

    this.ws = null;
    this.sessionToken = null;
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
   * セッショントークンを取得
   */
  async getSessionToken() {
    console.log('[AssemblyAI] Getting session token...');

    const response = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expires_in: 3600 // 1時間
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get session token: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  }

  /**
   * WebSocket接続を開始
   */
  async start() {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key is required');
    }

    this.updateStatus('connecting');

    try {
      // セッショントークンを取得
      this.sessionToken = await this.getSessionToken();
      console.log('[AssemblyAI] Session token obtained');
    } catch (error) {
      this.updateStatus('error');
      throw new Error(`Failed to get session token: ${error.message}`);
    }

    return new Promise((resolve, reject) => {
      // AssemblyAI WebSocket URL
      const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.sessionToken}`;

      console.log('[AssemblyAI] Connecting to WebSocket...');

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[AssemblyAI] WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[AssemblyAI] WebSocket error:', error);
        this.emitError(new Error('WebSocket connection error'));
      };

      this.ws.onclose = (event) => {
        console.log('[AssemblyAI] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;

        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[AssemblyAI] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
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
        this.ws.send(JSON.stringify({ terminate_session: true }));
      }
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    this.isConnected = false;
    this.sessionToken = null;
    this.updateStatus('stopped');
    console.log('[AssemblyAI] Provider stopped');
  }

  /**
   * 音声データを送信
   * @param {Int16Array|ArrayBuffer} pcmData - PCM16データ
   */
  sendAudioData(pcmData) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // PCMデータをBase64エンコード
    const buffer = pcmData instanceof Int16Array ? pcmData.buffer : pcmData;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    // AssemblyAI形式で送信
    this.ws.send(JSON.stringify({ audio_data: base64Audio }));
  }

  /**
   * WebSocketメッセージを処理
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.message_type === 'PartialTranscript') {
        const transcript = message.text || '';
        if (transcript) {
          console.log('[AssemblyAI] Partial:', transcript);
          this.emitTranscript(transcript, false);
        }
      } else if (message.message_type === 'FinalTranscript') {
        const transcript = message.text || '';
        if (transcript) {
          console.log('[AssemblyAI] Final:', transcript);
          this.emitTranscript(transcript, true);
        }
      } else if (message.message_type === 'SessionBegins') {
        console.log('[AssemblyAI] Session started:', message.session_id);
      } else if (message.message_type === 'SessionTerminated') {
        console.log('[AssemblyAI] Session terminated');
      } else if (message.error) {
        console.error('[AssemblyAI] Error from server:', message.error);
        this.emitError(new Error(message.error));
      }
    } catch (e) {
      console.error('[AssemblyAI] Failed to parse message:', e);
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
    console.error('[AssemblyAI] Error:', error);
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
      id: 'assemblyai_realtime',
      type: 'streaming',
      name: 'AssemblyAI Realtime',
      isConnected: this.isConnected
    };
  }
}

// グローバルに公開
window.AssemblyAIWSProvider = AssemblyAIWSProvider;

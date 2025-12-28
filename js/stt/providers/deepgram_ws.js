/**
 * Deepgram Realtime STT Provider (WebSocket)
 *
 * 真のリアルタイム文字起こし
 * WebSocket経由でPCMストリームを送信
 *
 * 断片化防止:
 * - is_finalをそのまま確定扱いせず、UtteranceEndまでバッファリング
 * - vad_eventsでSpeechStarted/UtteranceEndを受信
 */

class DeepgramWSProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey || SecureStorage.getApiKey('deepgram');
    this.model = config.model || SecureStorage.getModel('deepgram') || 'nova-3-general';
    this.language = config.language || 'ja';

    this.ws = null;
    this.onTranscript = null;
    this.onError = null;
    this.onStatusChange = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this._connectTimer = null;

    // Utteranceバッファリング（断片化防止）
    this._finalBuffer = '';        // is_final=trueの断片を蓄積
    this._partialBuffer = '';      // 最新のpartialを保持（interim表示用）
    this._isSpeaking = false;      // 発話中フラグ
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

    // バッファをリセット
    this._finalBuffer = '';
    this._partialBuffer = '';
    this._isSpeaking = false;

    return new Promise((resolve, reject) => {
      this.updateStatus('connecting');

      // Deepgram WebSocket URL (token is passed via subprotocol, NOT in URL)
      const wsUrl = new URL('wss://api.deepgram.com/v1/listen');
      wsUrl.searchParams.set('model', this.model);
      wsUrl.searchParams.set('language', this.language);
      wsUrl.searchParams.set('encoding', 'linear16');
      wsUrl.searchParams.set('sample_rate', '16000');
      wsUrl.searchParams.set('channels', '1');
      wsUrl.searchParams.set('punctuate', 'true');
      wsUrl.searchParams.set('interim_results', 'true');
      // 発話区切り設定（断片化防止）
      wsUrl.searchParams.set('endpointing', '1000');       // 1秒無音で発話区切り
      wsUrl.searchParams.set('utterance_end_ms', '1500');  // 発話終了後1.5秒待機
      wsUrl.searchParams.set('smart_format', 'true');      // 日本語向け書式
      // VADイベント（SpeechStarted/UtteranceEnd）を有効化
      wsUrl.searchParams.set('vad_events', 'true');

      console.log('[Deepgram] Connecting to Deepgram API...');

      // Browser auth: pass token via WebSocket subprotocol (Deepgram official method)
      const ws = new WebSocket(wsUrl.toString(), ['token', this.apiKey]);
      this.ws = ws;

      // Clear any existing timer
      if (this._connectTimer) {
        clearTimeout(this._connectTimer);
        this._connectTimer = null;
      }

      ws.onopen = () => {
        // Clear timeout on successful connection
        if (this._connectTimer) {
          clearTimeout(this._connectTimer);
          this._connectTimer = null;
        }
        console.log('[Deepgram] WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        resolve();
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = (error) => {
        console.error('[Deepgram] WebSocket error:', error);
        this.emitError(new Error('WebSocket connection error'));
      };

      ws.onclose = (event) => {
        // Clear timeout on close
        if (this._connectTimer) {
          clearTimeout(this._connectTimer);
          this._connectTimer = null;
        }
        console.log('[Deepgram] WebSocket closed:', event.code, event.reason);
        this.isConnected = false;

        // 残っているバッファがあればフラッシュ
        this._flushFinalBuffer();

        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[Deepgram] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.updateStatus('reconnecting');
          setTimeout(() => this.start().catch(console.error), 1000 * this.reconnectAttempts);
        } else {
          this.updateStatus('disconnected');
        }
      };

      // Connection timeout with proper guard
      this._connectTimer = setTimeout(() => {
        // Guard: only act if this is still the current connection attempt
        if (this.ws !== ws) return;

        if (!this.isConnected && ws.readyState === WebSocket.CONNECTING) {
          console.log('[Deepgram] Connection timeout, closing...');
          try {
            ws.close();
          } catch (e) {
            // Ignore close errors
          }
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * WebSocket接続を停止
   */
  async stop() {
    // Clear connection timer
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }

    // 残っているバッファをフラッシュ
    this._flushFinalBuffer();

    if (this.ws) {
      // 正常終了を通知
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch (e) {
          // Ignore send errors during shutdown
        }
      }
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (e) {
        // Ignore close errors
      }
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

      // VADイベント: SpeechStarted
      if (message.type === 'SpeechStarted') {
        console.log('[Deepgram] SpeechStarted');
        this._isSpeaking = true;
        // 新しい発話開始時はバッファをクリア（必要に応じて）
        // this._finalBuffer = '';
        return;
      }

      // VADイベント: UtteranceEnd（発話終了）
      if (message.type === 'UtteranceEnd') {
        console.log('[Deepgram] UtteranceEnd - flushing buffer:', this._finalBuffer);
        this._isSpeaking = false;
        // UtteranceEndで蓄積したfinalBufferを確定として出力
        this._flushFinalBuffer();
        return;
      }

      // 通常の文字起こし結果
      if (message.type === 'Results') {
        var transcript = '';
        if (message.channel && message.channel.alternatives &&
            message.channel.alternatives[0] && message.channel.alternatives[0].transcript) {
          transcript = message.channel.alternatives[0].transcript;
        }
        const isFinal = message.is_final || false;
        const speechFinal = message.speech_final || false;

        if (transcript) {
          if (isFinal) {
            // is_final=trueの断片はバッファに蓄積
            this._finalBuffer += transcript;
            console.log(`[Deepgram] Final (buffered):`, transcript, '| Total:', this._finalBuffer);

            // Partialとして表示（確定前のプレビュー）
            this.emitTranscript(this._finalBuffer, false);

            // speech_final=trueなら即座にフラッシュ（UtteranceEndの代わり）
            if (speechFinal) {
              console.log('[Deepgram] speech_final=true - flushing buffer');
              this._flushFinalBuffer();
            }
          } else {
            // Partialはバッファ+現在のpartialを表示
            this._partialBuffer = transcript;
            const displayText = this._finalBuffer + transcript;
            console.log(`[Deepgram] Partial:`, transcript);
            this.emitTranscript(displayText, false);
          }
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

  /**
   * finalBufferをフラッシュして確定出力
   */
  _flushFinalBuffer() {
    if (this._finalBuffer.trim()) {
      console.log('[Deepgram] Emitting final:', this._finalBuffer);
      this.emitTranscript(this._finalBuffer.trim(), true);
    }
    this._finalBuffer = '';
    this._partialBuffer = '';
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

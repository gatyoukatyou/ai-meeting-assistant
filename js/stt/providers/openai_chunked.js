/**
 * OpenAI Whisper STT Provider (Chunked/HTTP)
 *
 * 擬似リアルタイム文字起こし
 * 音声Blobを一定間隔でHTTP経由で送信
 */

class OpenAIChunkedProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey || SecureStorage.getApiKey('openai');
    this.model = config.model || SecureStorage.getModel('openai') || 'whisper-1';
    this.language = config.language || 'ja';

    this.onTranscript = null;
    this.onError = null;
    this.onStatusChange = null;
    this.isActive = false;
  }

  // イベントハンドラ設定
  setOnTranscript(callback) { this.onTranscript = callback; }
  setOnError(callback) { this.onError = callback; }
  setOnStatusChange(callback) { this.onStatusChange = callback; }

  /**
   * プロバイダーを開始
   */
  async start() {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.isActive = true;
    this.updateStatus('ready');
    console.log('[OpenAI STT] Provider started');
  }

  /**
   * プロバイダーを停止
   */
  async stop() {
    this.isActive = false;
    this.updateStatus('stopped');
    console.log('[OpenAI STT] Provider stopped');
  }

  /**
   * 音声Blobを文字起こし
   * @param {Blob} audioBlob - 音声データ
   * @returns {Promise<string>} 文字起こし結果
   */
  async transcribeBlob(audioBlob) {
    if (!this.isActive) {
      throw new Error('Provider is not active');
    }

    console.log('[OpenAI STT] Transcribing blob:', {
      size: audioBlob.size,
      type: audioBlob.type,
      model: this.model
    });

    this.updateStatus('transcribing');

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', this.model);
      formData.append('language', this.language);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const text = data.text || '';

      this.updateStatus('ready');

      // 文字起こし結果を通知
      if (text.trim()) {
        this.emitTranscript(text.trim(), true);
      }

      return text.trim();
    } catch (error) {
      this.updateStatus('error');
      this.emitError(error);
      throw error;
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
    console.error('[OpenAI STT] Error:', error);
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
      id: 'openai_stt',
      type: 'chunked',
      name: 'OpenAI Whisper',
      model: this.model,
      isActive: this.isActive
    };
  }
}

// グローバルに公開
window.OpenAIChunkedProvider = OpenAIChunkedProvider;

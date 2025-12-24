/**
 * PCM Audio Stream Processor
 *
 * マイク入力をPCM16 mono 16kHz形式でストリーミング
 * WebSocket系STTプロバイダーで使用
 */

class PCMStreamProcessor {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.bufferSize = options.bufferSize || 4096;
    this.sendInterval = options.sendInterval || 100; // ms

    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.audioWorklet = null;
    this.isProcessing = false;

    this.onAudioData = null;  // (Int16Array) => void
    this.onError = null;      // (Error) => void

    this.audioBuffer = [];
    this.sendIntervalId = null;
  }

  /**
   * イベントハンドラ設定
   */
  setOnAudioData(callback) { this.onAudioData = callback; }
  setOnError(callback) { this.onError = callback; }

  /**
   * ストリーミングを開始
   */
  async start() {
    if (this.isProcessing) {
      console.warn('[PCM] Already processing');
      return;
    }

    try {
      // マイクアクセスを取得
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // AudioContextを作成
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      // 入力ソースを作成
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessorを使用（AudioWorkletは複雑なため）
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        this.bufferSize,
        1,  // 入力チャンネル数
        1   // 出力チャンネル数
      );

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isProcessing) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Float32をInt16に変換
        const pcm16 = this.float32ToInt16(inputData);
        this.audioBuffer.push(pcm16);
      };

      // 接続
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      // 定期的にバッファを送信
      this.sendIntervalId = setInterval(() => {
        this.flushBuffer();
      }, this.sendInterval);

      this.isProcessing = true;
      console.log('[PCM] Stream started');

    } catch (error) {
      console.error('[PCM] Failed to start:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  /**
   * ストリーミングを停止
   */
  async stop() {
    this.isProcessing = false;

    if (this.sendIntervalId) {
      clearInterval(this.sendIntervalId);
      this.sendIntervalId = null;
    }

    // 残りのバッファを送信
    this.flushBuffer();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.audioBuffer = [];
    console.log('[PCM] Stream stopped');
  }

  /**
   * バッファをフラッシュして送信
   */
  flushBuffer() {
    if (this.audioBuffer.length === 0) return;

    // すべてのバッファを結合
    const totalLength = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Int16Array(totalLength);

    let offset = 0;
    for (const chunk of this.audioBuffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    this.audioBuffer = [];

    // コールバックで送信
    if (this.onAudioData && combined.length > 0) {
      this.onAudioData(combined);
    }
  }

  /**
   * Float32配列をInt16配列に変換
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // クリッピング
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      // Int16に変換
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * 処理中かどうか
   */
  isActive() {
    return this.isProcessing;
  }
}

/**
 * リサンプラー（異なるサンプルレート間の変換）
 */
class AudioResampler {
  constructor(fromRate, toRate) {
    this.fromRate = fromRate;
    this.toRate = toRate;
    this.ratio = toRate / fromRate;
  }

  /**
   * リサンプル（線形補間）
   */
  resample(inputArray) {
    if (this.fromRate === this.toRate) {
      return inputArray;
    }

    const outputLength = Math.ceil(inputArray.length * this.ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / this.ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputArray.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      output[i] = inputArray[srcIndexFloor] * (1 - fraction) +
                  inputArray[srcIndexCeil] * fraction;
    }

    return output;
  }
}

// グローバルに公開
window.PCMStreamProcessor = PCMStreamProcessor;
window.AudioResampler = AudioResampler;

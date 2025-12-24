/**
 * STT Provider Factory
 *
 * 文字起こし（STT）プロバイダーの抽象化レイヤー
 * chunked系（HTTP）とstreaming系（WebSocket）の両方をサポート
 */

// プロバイダータイプ
const STT_PROVIDER_TYPES = {
  CHUNKED: 'chunked',    // HTTP経由でBlobを送信（擬似リアルタイム）
  STREAMING: 'streaming' // WebSocket経由でPCMストリーム送信（真のリアルタイム）
};

// プロバイダー設定
const STT_PROVIDERS = {
  'openai_stt': {
    type: STT_PROVIDER_TYPES.CHUNKED,
    name: 'OpenAI Whisper',
    module: './providers/openai_chunked.js'
  },
  'deepgram_realtime': {
    type: STT_PROVIDER_TYPES.STREAMING,
    name: 'Deepgram Realtime',
    module: './providers/deepgram_ws.js'
  },
  'assemblyai_realtime': {
    type: STT_PROVIDER_TYPES.STREAMING,
    name: 'AssemblyAI Realtime',
    module: './providers/assemblyai_ws.js'
  },
  'gcp_stt_proxy': {
    type: STT_PROVIDER_TYPES.STREAMING,
    name: 'Google Cloud STT (Proxy)',
    module: './providers/gcp_proxy_ws.js'
  }
};

/**
 * STTプロバイダーのベースクラス
 */
class STTProviderBase {
  constructor(config) {
    this.config = config;
    this.onTranscript = null;      // (text, isFinal) => void
    this.onError = null;           // (error) => void
    this.onStatusChange = null;    // (status) => void
    this.isConnected = false;
  }

  // 抽象メソッド - サブクラスで実装必須
  async start() { throw new Error('Not implemented'); }
  async stop() { throw new Error('Not implemented'); }

  // chunked系用
  async transcribeBlob(blob) { throw new Error('Not implemented for this provider'); }

  // streaming系用
  sendAudioData(pcmData) { throw new Error('Not implemented for this provider'); }

  // イベントハンドラ設定
  setOnTranscript(callback) { this.onTranscript = callback; }
  setOnError(callback) { this.onError = callback; }
  setOnStatusChange(callback) { this.onStatusChange = callback; }

  // ステータス更新
  updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  // エラー通知
  emitError(error) {
    console.error(`[${this.constructor.name}] Error:`, error);
    if (this.onError) {
      this.onError(error);
    }
  }

  // 文字起こし結果通知
  emitTranscript(text, isFinal = true) {
    if (this.onTranscript && text && text.trim()) {
      this.onTranscript(text.trim(), isFinal);
    }
  }
}

/**
 * STTプロバイダーを作成
 * @param {string} providerId - プロバイダーID (e.g., 'openai_stt', 'deepgram_realtime')
 * @param {object} config - プロバイダー設定
 * @returns {STTProviderBase} プロバイダーインスタンス
 */
function createSTTProvider(providerId, config = {}) {
  const providerInfo = STT_PROVIDERS[providerId];
  if (!providerInfo) {
    throw new Error(`Unknown STT provider: ${providerId}`);
  }

  console.log(`[STT] Creating provider: ${providerInfo.name} (${providerInfo.type})`);

  // プロバイダー固有の設定をマージ
  const fullConfig = {
    ...config,
    providerId,
    providerType: providerInfo.type,
    providerName: providerInfo.name
  };

  // プロバイダータイプに応じてインスタンス生成
  // Note: 実際のプロバイダークラスは別ファイルで定義
  // ここではファクトリーパターンのインターフェースのみ定義
  return {
    providerId,
    providerType: providerInfo.type,
    providerName: providerInfo.name,
    config: fullConfig,

    // プロバイダー情報を返す
    getInfo() {
      return {
        id: providerId,
        type: providerInfo.type,
        name: providerInfo.name,
        isChunked: providerInfo.type === STT_PROVIDER_TYPES.CHUNKED,
        isStreaming: providerInfo.type === STT_PROVIDER_TYPES.STREAMING
      };
    }
  };
}

/**
 * プロバイダータイプを取得
 */
function getProviderType(providerId) {
  const info = STT_PROVIDERS[providerId];
  return info ? info.type : null;
}

/**
 * プロバイダーがchunked系かどうか
 */
function isChunkedProvider(providerId) {
  return getProviderType(providerId) === STT_PROVIDER_TYPES.CHUNKED;
}

/**
 * プロバイダーがstreaming系かどうか
 */
function isStreamingProvider(providerId) {
  return getProviderType(providerId) === STT_PROVIDER_TYPES.STREAMING;
}

/**
 * 利用可能なプロバイダー一覧を取得
 */
function getAvailableProviders() {
  return Object.entries(STT_PROVIDERS).map(([id, info]) => ({
    id,
    name: info.name,
    type: info.type
  }));
}

// エクスポート（グローバルに公開）
window.STTProviders = {
  TYPES: STT_PROVIDER_TYPES,
  PROVIDERS: STT_PROVIDERS,
  STTProviderBase,
  createSTTProvider,
  getProviderType,
  isChunkedProvider,
  isStreamingProvider,
  getAvailableProviders
};

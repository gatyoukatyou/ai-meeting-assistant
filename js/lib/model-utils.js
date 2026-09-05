// Pure model-related helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var getDefaultModel = ModelUtils.getDefaultModel).
const ModelUtils = (function () {
  'use strict';

  /**
   * STTプロバイダの表示名を返す
   * @param {string} provider - プロバイダID
   * @returns {string}
   */
  function getProviderDisplayName(provider) {
    var names = {
      openai_stt: 'OpenAI Transcribe',
      deepgram_realtime: 'Deepgram Realtime',
      openai_realtime: 'OpenAI Realtime Transcribe'
    };
    return names[provider] || provider;
  }

  /**
   * Geminiモデル名から "models/" プレフィックスを除去
   * @param {string} model - モデル名
   * @returns {string}
   */
  function normalizeGeminiModelId(model) {
    if (
      typeof ProviderCatalog !== 'undefined' &&
      typeof ProviderCatalog.normalizeGeminiModelId === 'function'
    ) {
      return ProviderCatalog.normalizeGeminiModelId(model);
    }
    if (!model) return model;
    if (model.startsWith('models/')) {
      return model.slice(7);
    }
    return model;
  }

  /**
   * プロバイダのデフォルトモデルを返す
   * @param {string} provider - プロバイダ名
   * @returns {string|undefined}
   */
  function getDefaultModel(provider) {
    if (
      typeof ProviderCatalog !== 'undefined' &&
      typeof ProviderCatalog.getDefaultModel === 'function'
    ) {
      return ProviderCatalog.getDefaultModel(provider);
    }
    var defaults = {
      gemini: 'gemini-3.6-flash',
      claude: 'claude-sonnet-5',
      openai: 'gpt-5.6-terra',
      openai_llm: 'gpt-5.6-terra',
      groq: 'openai/gpt-oss-120b',
      deepseek: 'deepseek-v4-flash'
    };
    return defaults[provider];
  }

  /**
   * モデル未検出・非対応・廃止エラーかどうかを判定
   * @param {{message?: string, status?: number}} error
   * @returns {boolean}
   */
  function isModelNotFoundOrDeprecatedError(error) {
    var msg = (error.message || '').toLowerCase();
    return (
      msg.includes('not found') ||
      msg.includes('not supported') ||
      msg.includes('does not exist') ||
      msg.includes('model not available') ||
      msg.includes('invalid model') ||
      msg.includes('decommissioned') ||
      msg.includes('no longer supported') ||
      msg.includes('deprecated') ||
      error.status === 404
    );
  }

  /**
   * モデル廃止エラーかどうかを判定
   * @param {{message?: string}} error
   * @returns {boolean}
   */
  function isModelDeprecatedError(error) {
    var msg = (error.message || '').toLowerCase();
    return (
      msg.includes('decommissioned') ||
      msg.includes('no longer supported') ||
      msg.includes('deprecated') ||
      msg.includes('model not found') ||
      msg.includes('does not exist')
    );
  }

  /**
   * レート制限またはサーバーエラーかどうかを判定
   * @param {{status?: number}} error
   * @returns {boolean}
   */
  function isRateLimitOrServerError(error) {
    return Boolean(
      error && (
        error.retryable === true ||
        error.category === 'network' ||
        error.status === 429 ||
        (error.status >= 500 && error.status < 600)
      )
    );
  }

  // プロバイダーごとの代替モデルリスト（優先順）
  var ALTERNATIVE_MODELS = {
    groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']
  };

  /**
   * 代替モデルリストを取得（現在のモデルを除外）
   * @param {string} provider - プロバイダ名
   * @param {string} currentModel - 現在のモデル名
   * @returns {string[]}
   */
  function getAlternativeModels(provider, currentModel) {
    var alts = ALTERNATIVE_MODELS[provider] || [];
    return alts.filter(function (m) {
      return m !== currentModel;
    });
  }

  /**
   * フォールバック用モデルを取得（リクエストモデルと同じなら null を返す）
   * @param {string} provider - プロバイダ名
   * @param {string} requestedModel - リクエストしたモデル名
   * @returns {string|null}
   */
  function getFallbackModel(provider, requestedModel) {
    var fallbacks = {
      gemini: 'gemini-3.5-flash-lite',
      claude: 'claude-haiku-4-5-20251001',
      openai: 'gpt-5.6-luna',
      openai_llm: 'gpt-5.6-luna',
      groq: 'openai/gpt-oss-20b'
    };
    var fb = fallbacks[provider];
    // フォールバックが同じモデルなら再試行しない
    if (!fb || fb === requestedModel) return null;
    return fb;
  }

  return {
    getProviderDisplayName,
    normalizeGeminiModelId,
    getDefaultModel,
    isModelNotFoundOrDeprecatedError,
    isModelDeprecatedError,
    isRateLimitOrServerError,
    getAlternativeModels,
    getFallbackModel
  };
})();

if (typeof window !== 'undefined') {
  window.ModelUtils = ModelUtils;
}

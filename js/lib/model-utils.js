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
      openai_stt: 'OpenAI Whisper',
      deepgram_realtime: 'Deepgram Realtime'
    };
    return names[provider] || provider;
  }

  /**
   * Geminiモデル名から "models/" プレフィックスを除去
   * @param {string} model - モデル名
   * @returns {string}
   */
  function normalizeGeminiModelId(model) {
    if (!model) return model;
    if (model.startsWith('models/')) {
      return model.slice(7); // "models/".length === 7
    }
    return model;
  }

  /**
   * プロバイダのデフォルトモデルを返す
   * @param {string} provider - プロバイダ名
   * @returns {string|undefined}
   */
  function getDefaultModel(provider) {
    var defaults = {
      gemini: 'gemini-2.5-flash',
      claude: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o',
      openai_llm: 'gpt-4o',
      groq: 'llama-3.3-70b-versatile'
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
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  }

  // プロバイダーごとの代替モデルリスト（優先順）
  var ALTERNATIVE_MODELS = {
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
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
      gemini: 'gemini-2.5-flash',
      claude: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o',
      openai_llm: 'gpt-4o',
      groq: 'llama-3.3-70b-versatile'
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

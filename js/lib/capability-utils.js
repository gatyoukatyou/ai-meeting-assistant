// Pure capability helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var getCapabilities = CapabilityUtils.getCapabilities).
const CapabilityUtils = (function () {
  'use strict';
  var LLM_PROVIDER_PRIORITY =
    (typeof ProviderCatalog !== 'undefined' && typeof ProviderCatalog.getLlmProviderPriority === 'function')
      ? ProviderCatalog.getLlmProviderPriority()
      : ['claude', 'openai_llm', 'gemini', 'groq'];

  /**
   * プロバイダとモデルの能力を判定する
   * @param {string} provider - プロバイダ名 (anthropic, gemini, openai, groq)
   * @param {string} model - モデル名
   * @returns {{supportsReasoningControl: boolean, supportsNativeDocs: boolean, supportsVisionImages: boolean}}
   */
  function getCapabilities(provider, model) {
    return {
      supportsReasoningControl:
        (provider === 'anthropic' && isReasoningCapableModel(model)) ||
        (provider === 'openai' && isOpenAiReasoningCapableModel(model)),
      supportsNativeDocs: provider === 'gemini',
      supportsVisionImages: false // 将来拡張用
    };
  }

  function normalizeModelForCapabilityMatch(model) {
    if (!model) return '';
    var normalized = String(model).trim().toLowerCase();
    if (normalized.startsWith('models/')) {
      normalized = normalized.slice(7);
    }
    if (normalized.indexOf('/') !== -1) {
      normalized = normalized.split('/').pop();
    }
    return normalized;
  }

  /**
   * アプリ内プロバイダIDを capability 判定用IDへ正規化
   * @param {string} provider
   * @returns {string}
   */
  function normalizeCapabilityProvider(provider) {
    if (!provider) return '';
    if (
      typeof ProviderCatalog !== 'undefined' &&
      typeof ProviderCatalog.normalizeCapabilityProviderId === 'function'
    ) {
      return ProviderCatalog.normalizeCapabilityProviderId(provider);
    }
    if (provider === 'claude') return 'anthropic';
    if (provider === 'openai_llm') return 'openai';
    return provider;
  }

  /**
   * 実際に利用されるLLMプロバイダを決定
   * @param {string} priority - llmPriority設定値
   * @param {(provider:string)=>boolean} hasApiKey - プロバイダのキー有無判定
   * @returns {string|null}
   */
  function resolveEffectiveLlmProvider(priority, hasApiKey) {
    if (typeof hasApiKey !== 'function') return null;

    if (priority && priority !== 'auto' && hasApiKey(priority)) {
      return priority;
    }

    for (var i = 0; i < LLM_PROVIDER_PRIORITY.length; i++) {
      var provider = LLM_PROVIDER_PRIORITY[i];
      if (hasApiKey(provider)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Anthropicのthinking系パラメータを受け付けるモデルか判定
   * @param {string} model - モデル名
   * @returns {boolean}
   */
  function isReasoningCapableModel(model) {
    const normalizedModel = normalizeModelForCapabilityMatch(model);
    if (!normalizedModel) return false;
    // Extended thinking対応モデル
    const reasoningModels = [
      'claude-sonnet-4',
      'claude-opus-4',
      'claude-3-7-sonnet' // claude-3.7-sonnet系も対応
    ];
    return reasoningModels.some((m) => normalizedModel.includes(m));
  }

  /**
   * OpenAIのreasoning_effortパラメータを受け付けるモデルか判定
   * - o-series (o1/o3/o4...)
   * - gpt-5 系
   * @param {string} model - モデル名
   * @returns {boolean}
   */
  function isOpenAiReasoningCapableModel(model) {
    const normalizedModel = normalizeModelForCapabilityMatch(model);
    if (!normalizedModel) return false;
    return /^o\d/.test(normalizedModel) || normalizedModel.startsWith('gpt-5');
  }

  return {
    getCapabilities,
    normalizeCapabilityProvider,
    resolveEffectiveLlmProvider,
    isReasoningCapableModel,
    isOpenAiReasoningCapableModel
  };
})();

if (typeof window !== 'undefined') {
  window.CapabilityUtils = CapabilityUtils;
}

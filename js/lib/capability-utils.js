// Pure capability helpers — no DOM / i18n / global-state dependencies.
// Consumed by app.js via thin aliases (e.g. var getCapabilities = CapabilityUtils.getCapabilities).
const CapabilityUtils = (function () {
  'use strict';

  /**
   * プロバイダとモデルの能力を判定する
   * @param {string} provider - プロバイダ名 (anthropic, gemini, openai, groq)
   * @param {string} model - モデル名
   * @returns {{supportsReasoningControl: boolean, supportsNativeDocs: boolean, supportsVisionImages: boolean}}
   */
  function getCapabilities(provider, model) {
    return {
      supportsReasoningControl:
        provider === 'anthropic' && isReasoningCapableModel(model),
      supportsNativeDocs: provider === 'gemini',
      supportsVisionImages: false // 将来拡張用
    };
  }

  /**
   * Anthropicのthinking系パラメータを受け付けるモデルか判定
   * @param {string} model - モデル名
   * @returns {boolean}
   */
  function isReasoningCapableModel(model) {
    if (!model) return false;
    // Extended thinking対応モデル
    const reasoningModels = [
      'claude-sonnet-4',
      'claude-opus-4',
      'claude-3-7-sonnet' // claude-3.7-sonnet系も対応
    ];
    return reasoningModels.some((m) => model.includes(m));
  }

  return { getCapabilities, isReasoningCapableModel };
})();

if (typeof window !== 'undefined') {
  window.CapabilityUtils = CapabilityUtils;
}

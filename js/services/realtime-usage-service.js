const RealtimeUsageService = (function () {
  'use strict';

  const MODEL = 'gpt-realtime-2.1';
  const PRICING = Object.freeze({
    model: MODEL,
    sourceDate: '2026-08-25',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-2.1',
    usdToJpy: 150,
    usdPerMillion: Object.freeze({
      textInput: 4,
      textCachedInput: 0.4,
      textOutput: 24,
      audioInput: 32,
      audioCachedInput: 0.4,
      audioOutput: 64
    })
  });

  const TOKEN_FIELDS = [
    'totalTokens',
    'inputTokens',
    'outputTokens',
    'inputTextTokens',
    'inputAudioTokens',
    'inputImageTokens',
    'cachedTokens',
    'cachedTextTokens',
    'cachedAudioTokens',
    'cachedImageTokens',
    'outputTextTokens',
    'outputAudioTokens'
  ];

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function readValue(source, snakeKey, camelKey) {
    if (source && source[snakeKey] !== undefined) return nonNegativeNumber(source[snakeKey]);
    if (source && source[camelKey] !== undefined) return nonNegativeNumber(source[camelKey]);
    return 0;
  }

  function normalizeUsage(usage) {
    const source = usage && typeof usage === 'object' ? usage : {};
    const inputDetails = source.input_token_details || {};
    const outputDetails = source.output_token_details || {};
    const cachedDetails = inputDetails.cached_tokens_details || {};

    const hasTokenDetails =
      source.hasTokenDetails !== undefined
        ? Boolean(source.hasTokenDetails)
        : Boolean(
            source.input_token_details ||
            source.output_token_details ||
            source.inputTextTokens !== undefined ||
            source.outputTextTokens !== undefined
          );

    return {
      totalTokens: readValue(source, 'total_tokens', 'totalTokens'),
      inputTokens: readValue(source, 'input_tokens', 'inputTokens'),
      outputTokens: readValue(source, 'output_tokens', 'outputTokens'),
      inputTextTokens:
        source.inputTextTokens !== undefined
          ? nonNegativeNumber(source.inputTextTokens)
          : nonNegativeNumber(inputDetails.text_tokens),
      inputAudioTokens:
        source.inputAudioTokens !== undefined
          ? nonNegativeNumber(source.inputAudioTokens)
          : nonNegativeNumber(inputDetails.audio_tokens),
      inputImageTokens:
        source.inputImageTokens !== undefined
          ? nonNegativeNumber(source.inputImageTokens)
          : nonNegativeNumber(inputDetails.image_tokens),
      cachedTokens:
        source.cachedTokens !== undefined
          ? nonNegativeNumber(source.cachedTokens)
          : nonNegativeNumber(inputDetails.cached_tokens || source.cached_tokens),
      cachedTextTokens:
        source.cachedTextTokens !== undefined
          ? nonNegativeNumber(source.cachedTextTokens)
          : nonNegativeNumber(cachedDetails.text_tokens),
      cachedAudioTokens:
        source.cachedAudioTokens !== undefined
          ? nonNegativeNumber(source.cachedAudioTokens)
          : nonNegativeNumber(cachedDetails.audio_tokens),
      cachedImageTokens:
        source.cachedImageTokens !== undefined
          ? nonNegativeNumber(source.cachedImageTokens)
          : nonNegativeNumber(cachedDetails.image_tokens),
      outputTextTokens:
        source.outputTextTokens !== undefined
          ? nonNegativeNumber(source.outputTextTokens)
          : nonNegativeNumber(outputDetails.text_tokens),
      outputAudioTokens:
        source.outputAudioTokens !== undefined
          ? nonNegativeNumber(source.outputAudioTokens)
          : nonNegativeNumber(outputDetails.audio_tokens),
      hasTokenDetails
    };
  }

  function estimateCost(usage) {
    const normalized = normalizeUsage(usage);
    if (!normalized.hasTokenDetails) {
      return {
        available: false,
        usd: null,
        jpy: null,
        pricing: PRICING
      };
    }

    const cachedTextTokens = Math.min(normalized.inputTextTokens, normalized.cachedTextTokens);
    const cachedAudioTokens = Math.min(normalized.inputAudioTokens, normalized.cachedAudioTokens);
    const uncachedTextTokens = Math.max(0, normalized.inputTextTokens - cachedTextTokens);
    const uncachedAudioTokens = Math.max(0, normalized.inputAudioTokens - cachedAudioTokens);
    const rates = PRICING.usdPerMillion;

    const usd =
      (uncachedTextTokens * rates.textInput +
        cachedTextTokens * rates.textCachedInput +
        normalized.outputTextTokens * rates.textOutput +
        uncachedAudioTokens * rates.audioInput +
        cachedAudioTokens * rates.audioCachedInput +
        normalized.outputAudioTokens * rates.audioOutput) /
      1_000_000;

    return {
      available: true,
      usd,
      jpy: usd * PRICING.usdToJpy,
      pricing: PRICING
    };
  }

  function withEstimate(usage) {
    const normalized = normalizeUsage(usage);
    return {
      ...normalized,
      estimate: estimateCost(normalized)
    };
  }

  function createEmptyUsage() {
    return withEstimate({});
  }

  function addUsage(previous, next) {
    const left = normalizeUsage(previous);
    const right = normalizeUsage(next);
    const merged = {};
    TOKEN_FIELDS.forEach(field => {
      merged[field] = left[field] + right[field];
    });
    merged.hasTokenDetails = left.hasTokenDetails || right.hasTokenDetails;
    return withEstimate(merged);
  }

  function formatTokens(value) {
    return Math.round(nonNegativeNumber(value)).toLocaleString('ja-JP');
  }

  function formatEstimate(usage) {
    const cost = usage && usage.estimate ? usage.estimate : estimateCost(usage);
    if (!cost.available) return '算出不可';
    return `約¥${cost.jpy.toFixed(2)}（$${cost.usd.toFixed(4)}）`;
  }

  return Object.freeze({
    MODEL,
    PRICING,
    normalizeUsage,
    estimateCost,
    withEstimate,
    createEmptyUsage,
    addUsage,
    formatTokens,
    formatEstimate
  });
})();

if (typeof window !== 'undefined') {
  window.RealtimeUsageService = RealtimeUsageService;
}

// Provider and model catalog. Keep this file side-effect free: settings UI,
// API clients, model registry, and cost estimation all consume this metadata.
// Official information verified: 2026-08-01 (see docs/API_MODEL_SUPPORT.md).
const ProviderCatalog = (function () {
  'use strict';

  var VERIFIED_AT = '2026-08-01';
  var LLM_PROVIDER_IDS = ['gemini', 'claude', 'openai_llm', 'groq', 'deepseek', 'local_llm'];
  var LLM_PROVIDER_PRIORITY = ['gemini', 'openai_llm', 'claude', 'groq', 'deepseek', 'local_llm'];
  var LLM_PROVIDER_IDS_WITH_LEGACY = LLM_PROVIDER_IDS.concat(['openai']);
  var STT_PROVIDER_IDS = ['openai_stt', 'deepgram_realtime'];
  var KEYLESS_LLM_PROVIDER_IDS = ['local_llm'];
  var API_KEY_PROVIDER_IDS = LLM_PROVIDER_IDS
    .filter(function (id) { return KEYLESS_LLM_PROVIDER_IDS.indexOf(id) === -1; })
    .concat(['openai', 'deepgram']);
  var LOCAL_LLM_BASE_URL_PRESETS = [
    { id: 'ollama', label: 'Ollama (localhost:11434)', baseUrl: 'http://localhost:11434/v1' },
    { id: 'ollama-loopback-ip', label: 'Ollama (127.0.0.1:11434)', baseUrl: 'http://127.0.0.1:11434/v1' },
    { id: 'lmstudio', label: 'LM Studio (localhost:1234)', baseUrl: 'http://localhost:1234/v1' },
    { id: 'lmstudio-loopback-ip', label: 'LM Studio (127.0.0.1:1234)', baseUrl: 'http://127.0.0.1:1234/v1' }
  ];

  function model(id, displayName, tier, pricing, extra) {
    return Object.assign({
      id: id,
      displayName: displayName,
      tier: tier,
      lifecycle: 'stable',
      deprecated: false,
      pricing: pricing || null
    }, extra || {});
  }

  var PROVIDER_DEFINITIONS = {
    gemini: {
      id: 'gemini', kind: 'llm', apiKind: 'gemini', displayName: 'Google Gemini',
      apiBaseUrl: 'https://generativelanguage.googleapis.com', apiKeyProviderId: 'gemini',
      apiKeyStorageId: 'gemini', modelProviderId: 'gemini', defaultModel: 'gemini-3.6-flash',
      recommendedModel: 'gemini-3.6-flash', canListModels: true,
      reasoningPolicy: { summary: 'minimal', advice: 'high', parameter: 'thinkingConfig.thinkingLevel' },
      docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
      pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
      privacyUrl: 'https://ai.google.dev/gemini-api/terms', verifiedAt: VERIFIED_AT,
      models: [
        model('gemini-3.6-flash', 'Gemini 3.6 Flash — 標準・高精度', 'standard', { input: 1.5, output: 7.5 }, { contextTokens: 1000000, maxOutputTokens: 64000 }),
        model('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite — 低コスト', 'low-cost', { input: 0.3, output: 2.5 }, { contextTokens: 1000000, maxOutputTokens: 64000 }),
        model('gemini-2.5-flash', 'Gemini 2.5 Flash — 旧設定互換', 'legacy', { input: 0.3, output: 2.5 }, { lifecycle: 'legacy' })
      ]
    },
    claude: {
      id: 'claude', kind: 'llm', apiKind: 'anthropic', displayName: 'Anthropic Claude',
      apiBaseUrl: 'https://api.anthropic.com/v1', apiKeyProviderId: 'claude',
      apiKeyStorageId: 'claude', modelProviderId: 'claude', defaultModel: 'claude-sonnet-5',
      recommendedModel: 'claude-sonnet-5', canListModels: true,
      reasoningPolicy: { summary: 'disabled', advice: 'adaptive-high', parameter: 'thinking/output_config.effort' },
      docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
      pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
      privacyUrl: 'https://privacy.anthropic.com/', verifiedAt: VERIFIED_AT,
      models: [
        model('claude-sonnet-5', 'Claude Sonnet 5 — 標準・高品質', 'standard', { input: 2, output: 10 }, { contextTokens: 1000000, maxOutputTokens: 128000, adaptiveThinking: true, pricingNote: 'Introductory price through 2026-08-31' }),
        model('claude-haiku-4-5-20251001', 'Claude Haiku 4.5 — 低コスト', 'low-cost', { input: 1, output: 5 }, { contextTokens: 200000, maxOutputTokens: 64000, adaptiveThinking: false })
      ]
    },
    openai_llm: {
      id: 'openai_llm', kind: 'llm', apiKind: 'openai-compatible', displayName: 'OpenAI',
      apiBaseUrl: 'https://api.openai.com/v1', chatCompletionsPath: '/chat/completions',
      authorization: { header: 'Authorization', prefix: 'Bearer ' },
      usageFields: { input: 'prompt_tokens', output: 'completion_tokens' },
      errorFields: { root: 'error', message: 'message', code: 'code', type: 'type' },
      apiKeyProviderId: 'openai_llm', apiKeyStorageId: 'openai_llm', modelProviderId: 'openai_llm',
      defaultModel: 'gpt-5.6-terra', recommendedModel: 'gpt-5.6-terra', canListModels: false,
      reasoningPolicy: { summary: 'low', advice: 'medium', parameter: 'reasoning_effort' },
      docsUrl: 'https://developers.openai.com/api/docs/models',
      pricingUrl: 'https://developers.openai.com/api/docs/models/compare',
      privacyUrl: 'https://openai.com/policies/api-data-usage-policies/', verifiedAt: VERIFIED_AT,
      models: [
        model('gpt-5.6-terra', 'GPT-5.6 Terra — 標準', 'standard', { input: 2.5, output: 15 }, { contextTokens: 1050000, maxOutputTokens: 128000 }),
        model('gpt-5.6-luna', 'GPT-5.6 Luna — 低コスト', 'low-cost', { input: 1, output: 6 }, { contextTokens: 1050000, maxOutputTokens: 128000 }),
        model('gpt-5.6-sol', 'GPT-5.6 Sol — 高品質・助言', 'high-quality', { input: 5, output: 30 }, { contextTokens: 1050000, maxOutputTokens: 128000 })
      ],
      allowCustomModel: true
    },
    groq: {
      id: 'groq', kind: 'llm', apiKind: 'openai-compatible', displayName: 'Groq',
      apiBaseUrl: 'https://api.groq.com/openai/v1', chatCompletionsPath: '/chat/completions',
      authorization: { header: 'Authorization', prefix: 'Bearer ' },
      usageFields: { input: 'prompt_tokens', output: 'completion_tokens' },
      errorFields: { root: 'error', message: 'message', code: 'code', type: 'type' },
      apiKeyProviderId: 'groq', apiKeyStorageId: 'groq', modelProviderId: 'groq',
      defaultModel: 'openai/gpt-oss-120b', recommendedModel: 'openai/gpt-oss-120b', canListModels: true,
      reasoningPolicy: { summary: 'low', advice: 'medium', parameter: 'reasoning_effort' },
      docsUrl: 'https://console.groq.com/docs/models',
      pricingUrl: 'https://console.groq.com/docs/models',
      privacyUrl: 'https://groq.com/privacy-policy/', verifiedAt: VERIFIED_AT,
      models: [
        model('openai/gpt-oss-120b', 'GPT-OSS 120B — 標準', 'standard', { input: 0.15, output: 0.6 }, { contextTokens: 131072, maxOutputTokens: 65536 }),
        model('openai/gpt-oss-20b', 'GPT-OSS 20B — 低コスト・高速', 'low-cost', { input: 0.075, output: 0.3 }, { contextTokens: 131072, maxOutputTokens: 65536 }),
        model('llama-3.3-70b-versatile', 'Llama 3.3 70B — 旧設定（終了予定）', 'legacy', { input: 0.59, output: 0.79 }, { lifecycle: 'deprecated', deprecated: true, shutdownDate: '2026-08-16', replacementModel: 'openai/gpt-oss-120b' }),
        model('llama-3.1-8b-instant', 'Llama 3.1 8B — 旧設定（終了予定）', 'legacy', { input: 0.05, output: 0.08 }, { lifecycle: 'deprecated', deprecated: true, shutdownDate: '2026-08-16', replacementModel: 'openai/gpt-oss-20b' })
      ]
    },
    local_llm: {
      id: 'local_llm', kind: 'llm', apiKind: 'openai-compatible', displayName: 'Local LLM (Ollama / LM Studio)',
      apiBaseUrl: '', chatCompletionsPath: '/chat/completions', requiresApiKey: false,
      authorization: { header: 'Authorization', prefix: 'Bearer ' },
      usageFields: { input: 'prompt_tokens', output: 'completion_tokens' },
      errorFields: { root: 'error', message: 'message', code: 'code', type: 'type' },
      apiKeyProviderId: null, apiKeyStorageId: null, modelProviderId: 'local_llm',
      defaultModel: '', recommendedModel: '', canListModels: true,
      reasoningPolicy: { summary: 'disabled', advice: 'disabled', parameter: null },
      docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
      pricingUrl: null,
      privacyUrl: null, verifiedAt: VERIFIED_AT,
      baseUrlPresets: LOCAL_LLM_BASE_URL_PRESETS.slice(),
      models: [],
      allowCustomModel: true
    },
    deepseek: {
      id: 'deepseek', kind: 'llm', apiKind: 'openai-compatible', displayName: 'DeepSeek',
      apiBaseUrl: 'https://api.deepseek.com', chatCompletionsPath: '/chat/completions',
      authorization: { header: 'Authorization', prefix: 'Bearer ' },
      usageFields: { input: 'prompt_tokens', output: 'completion_tokens' },
      errorFields: { root: 'error', message: 'message', code: 'code', type: 'type' },
      apiKeyProviderId: 'deepseek', apiKeyStorageId: 'deepseek', modelProviderId: 'deepseek',
      defaultModel: 'deepseek-v4-flash', recommendedModel: 'deepseek-v4-flash', canListModels: true,
      reasoningPolicy: { summary: 'disabled', advice: 'enabled', parameter: 'thinking.type' },
      docsUrl: 'https://api-docs.deepseek.com/api/create-chat-completion',
      pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
      privacyUrl: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html', verifiedAt: VERIFIED_AT,
      models: [
        model('deepseek-v4-flash', 'DeepSeek V4 Flash — 標準・低コスト', 'standard', { input: 0.14, output: 0.28 }, { contextTokens: 1000000, maxOutputTokens: 384000, pricingNote: 'Cache-miss input price; peak pricing may change' })
      ],
      allowCustomModel: true
    },
    openai_stt: {
      id: 'openai_stt', kind: 'stt', apiKind: 'openai-transcriptions', displayName: 'OpenAI Transcribe',
      apiBaseUrl: 'https://api.openai.com/v1', apiKeyProviderId: 'openai', apiKeyStorageId: 'openai',
      modelProviderId: 'openai', defaultModel: 'gpt-4o-mini-transcribe', recommendedModel: 'gpt-4o-mini-transcribe',
      docsUrl: 'https://developers.openai.com/api/docs/guides/speech-to-text', verifiedAt: VERIFIED_AT,
      models: [
        model('gpt-4o-mini-transcribe', 'GPT-4o mini Transcribe — 標準', 'standard', { audioInput: 1.25, audioOutput: 5 }, { pricingUnit: 'audio-tokens', estimatePerMinuteUsd: null }),
        model('gpt-4o-transcribe', 'GPT-4o Transcribe — 精度優先', 'high-quality', { audioInput: 2.5, audioOutput: 10 }, { pricingUnit: 'audio-tokens', estimatePerMinuteUsd: null }),
        model('whisper-1', 'Whisper-1 — 旧モデル・互換', 'legacy', { perMinute: 0.006 }, { lifecycle: 'legacy', pricingUnit: 'minute', estimatePerMinuteUsd: 0.006 })
      ]
    },
    deepgram_realtime: {
      id: 'deepgram_realtime', kind: 'stt', apiKind: 'deepgram-websocket', displayName: 'Deepgram Realtime',
      apiBaseUrl: 'wss://api.deepgram.com/v1', apiKeyProviderId: 'deepgram', apiKeyStorageId: 'deepgram',
      modelProviderId: 'deepgram', defaultModel: 'nova-3-general', recommendedModel: 'nova-3-general',
      docsUrl: 'https://developers.deepgram.com/docs/model', pricingUrl: 'https://deepgram.com/pricing', verifiedAt: VERIFIED_AT,
      models: [
        model('nova-3-general', 'Nova-3 General — 会議リアルタイム標準', 'standard', { perMinute: 0.0048 }, { pricingUnit: 'minute', estimatePerMinuteUsd: 0.0048 })
      ]
    },
    openai: {
      id: 'openai', kind: 'legacy', apiKind: 'legacy', displayName: 'OpenAI (Legacy ID)',
      defaultModel: 'gpt-5.6-terra', apiKeyProviderId: 'openai', apiKeyStorageId: 'openai', modelProviderId: 'openai'
    },
    deepgram: {
      id: 'deepgram', kind: 'legacy', apiKind: 'legacy', displayName: 'Deepgram (Storage ID)',
      defaultModel: 'nova-3-general', apiKeyProviderId: 'deepgram', apiKeyStorageId: 'deepgram', modelProviderId: 'deepgram'
    }
  };

  var CAPABILITY_PROVIDER_MAP = { claude: 'anthropic', openai_llm: 'openai' };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getProvider(providerId) { return clone(PROVIDER_DEFINITIONS[providerId] || null); }
  function getDefaultModel(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.defaultModel : undefined;
  }
  function getModels(providerId, options) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    var models = provider && provider.models ? provider.models : [];
    if (!(options && options.includeLegacy)) {
      models = models.filter(function (entry) { return entry.tier !== 'legacy'; });
    }
    return clone(models);
  }
  function getModel(providerId, modelId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    var models = provider && provider.models ? provider.models : [];
    return clone(models.find(function (entry) { return entry.id === modelId; }) || null);
  }
  function getPricingTable() {
    var table = {};
    LLM_PROVIDER_IDS.forEach(function (providerId) {
      table[providerId] = {};
      (PROVIDER_DEFINITIONS[providerId].models || []).forEach(function (entry) {
        if (entry.pricing) table[providerId][entry.id] = clone(entry.pricing);
      });
    });
    // Legacy call sites use "openai" as the pricing group for OpenAI LLM.
    table.openai = clone(table.openai_llm);
    return table;
  }
  function getApiKeyProviderId(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.apiKeyProviderId : providerId;
  }
  function providerRequiresApiKey(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.requiresApiKey !== false : true;
  }
  function getBaseUrlPresets(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return clone(provider && provider.baseUrlPresets ? provider.baseUrlPresets : []);
  }
  function getModelProviderId(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.modelProviderId : providerId;
  }
  function getApiKeyStorageKey(providerId) { return '_ak_' + getApiKeyProviderId(providerId); }
  function normalizeGeminiModelId(modelId) {
    return modelId && modelId.startsWith('models/') ? modelId.slice(7) : modelId;
  }
  function normalizeSttProviderId(providerId) {
    if (providerId === 'openai' || providerId === 'gemini') return 'openai_stt';
    if (providerId === 'deepgram') return 'deepgram_realtime';
    return providerId;
  }
  function normalizeLlmProviderId(providerId) { return providerId === 'openai' ? 'openai_llm' : providerId; }
  function normalizeCapabilityProviderId(providerId) { return CAPABILITY_PROVIDER_MAP[providerId] || providerId || ''; }
  function isLlmProvider(providerId) { return LLM_PROVIDER_IDS.includes(providerId); }
  function isSttProvider(providerId) { return STT_PROVIDER_IDS.includes(providerId); }
  function getLlmProviderIds(options) { return (options && options.includeLegacy ? LLM_PROVIDER_IDS_WITH_LEGACY : LLM_PROVIDER_IDS).slice(); }
  function getSttProviderIds() { return STT_PROVIDER_IDS.slice(); }
  function getApiKeyProviderIds() { return API_KEY_PROVIDER_IDS.slice(); }
  function getLlmProviderPriority() { return LLM_PROVIDER_PRIORITY.slice(); }
  function getModelRegistryProviderConfigBase() {
    var configs = {};
    LLM_PROVIDER_IDS.forEach(function (providerId) {
      var provider = PROVIDER_DEFINITIONS[providerId];
      // Base URL is user-configured for keyless local providers (no fixed
      // apiBaseUrl to build an endpoint from) — leave endpoint null so
      // model-registry.js knows it must be supplied at call time.
      var endpoint = provider.requiresApiKey === false
        ? null
        : provider.apiBaseUrl + (provider.apiKind === 'gemini' ? '/v1beta/models' : '/models');
      configs[providerId] = {
        endpoint: endpoint,
        authHeader: provider.apiKind === 'gemini' ? 'x-goog-api-key' : (provider.apiKind === 'anthropic' ? 'x-api-key' : 'Authorization'),
        authPrefix: provider.apiKind === 'openai-compatible' ? 'Bearer ' : '',
        extraHeaders: provider.apiKind === 'anthropic' ? {
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        } : undefined,
        canListModels: provider.canListModels,
        canListModelsWithProxy: providerId === 'openai_llm',
        fixedModels: getModels(providerId, { includeLegacy: true }),
        allowCustomModel: Boolean(provider.allowCustomModel),
        requiresApiKey: provider.requiresApiKey !== false
      };
    });
    return configs;
  }

  return {
    VERIFIED_AT: VERIFIED_AT,
    PROVIDER_DEFINITIONS: clone(PROVIDER_DEFINITIONS),
    CAPABILITY_PROVIDER_MAP: Object.assign({}, CAPABILITY_PROVIDER_MAP),
    MODEL_REGISTRY_PROVIDER_CONFIG_BASE: getModelRegistryProviderConfigBase(),
    getProvider: getProvider,
    getDefaultModel: getDefaultModel,
    getModels: getModels,
    getModel: getModel,
    getPricingTable: getPricingTable,
    getApiKeyProviderId: getApiKeyProviderId,
    getModelProviderId: getModelProviderId,
    getApiKeyStorageKey: getApiKeyStorageKey,
    providerRequiresApiKey: providerRequiresApiKey,
    getBaseUrlPresets: getBaseUrlPresets,
    normalizeGeminiModelId: normalizeGeminiModelId,
    normalizeSttProviderId: normalizeSttProviderId,
    normalizeLlmProviderId: normalizeLlmProviderId,
    normalizeCapabilityProviderId: normalizeCapabilityProviderId,
    isLlmProvider: isLlmProvider,
    isSttProvider: isSttProvider,
    getLlmProviderIds: getLlmProviderIds,
    getLlmProviderPriority: getLlmProviderPriority,
    getSttProviderIds: getSttProviderIds,
    getApiKeyProviderIds: getApiKeyProviderIds,
    getModelRegistryProviderConfigBase: getModelRegistryProviderConfigBase
  };
})();

if (typeof window !== 'undefined') window.ProviderCatalog = ProviderCatalog;

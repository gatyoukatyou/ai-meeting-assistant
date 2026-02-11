// Provider catalog (single source of truth candidate)
// NOTE: This file is intentionally side-effect free so existing behavior is unchanged.
const ProviderCatalog = (function () {
  'use strict';

  var LLM_PROVIDER_IDS = ['gemini', 'claude', 'openai_llm', 'groq'];
  var LLM_PROVIDER_PRIORITY = ['claude', 'openai_llm', 'gemini', 'groq'];
  var LLM_PROVIDER_IDS_WITH_LEGACY = ['gemini', 'claude', 'openai_llm', 'groq', 'openai'];
  var STT_PROVIDER_IDS = ['openai_stt', 'deepgram_realtime'];
  var API_KEY_PROVIDER_IDS = ['gemini', 'claude', 'openai_llm', 'groq', 'openai', 'deepgram'];

  var PROVIDER_DEFINITIONS = {
    gemini: {
      id: 'gemini',
      kind: 'llm',
      displayName: 'Google Gemini',
      defaultModel: 'gemini-2.5-flash',
      apiKeyProviderId: 'gemini',
      modelProviderId: 'gemini'
    },
    claude: {
      id: 'claude',
      kind: 'llm',
      displayName: 'Anthropic Claude',
      defaultModel: 'claude-sonnet-4-20250514',
      apiKeyProviderId: 'claude',
      modelProviderId: 'claude'
    },
    openai_llm: {
      id: 'openai_llm',
      kind: 'llm',
      displayName: 'OpenAI (LLM)',
      defaultModel: 'gpt-4o',
      apiKeyProviderId: 'openai_llm',
      modelProviderId: 'openai_llm'
    },
    groq: {
      id: 'groq',
      kind: 'llm',
      displayName: 'Groq',
      defaultModel: 'llama-3.3-70b-versatile',
      apiKeyProviderId: 'groq',
      modelProviderId: 'groq'
    },
    openai_stt: {
      id: 'openai_stt',
      kind: 'stt',
      displayName: 'OpenAI Whisper',
      defaultModel: 'whisper-1',
      apiKeyProviderId: 'openai',
      modelProviderId: 'openai'
    },
    deepgram_realtime: {
      id: 'deepgram_realtime',
      kind: 'stt',
      displayName: 'Deepgram Realtime',
      defaultModel: 'nova-3-general',
      apiKeyProviderId: 'deepgram',
      modelProviderId: 'deepgram'
    },

    // Legacy compatibility ID (used in historical settings/migrations)
    openai: {
      id: 'openai',
      kind: 'legacy',
      displayName: 'OpenAI (Legacy ID)',
      defaultModel: 'gpt-4o',
      apiKeyProviderId: 'openai',
      modelProviderId: 'openai'
    },
    deepgram: {
      id: 'deepgram',
      kind: 'legacy',
      displayName: 'Deepgram (Storage ID)',
      defaultModel: 'nova-3-general',
      apiKeyProviderId: 'deepgram',
      modelProviderId: 'deepgram'
    }
  };

  var CAPABILITY_PROVIDER_MAP = {
    claude: 'anthropic',
    openai_llm: 'openai'
  };

  // Shared provider configuration metadata for ModelRegistry.
  // ModelRegistry adds parseModels() so this stays data-only.
  var MODEL_REGISTRY_PROVIDER_CONFIG_BASE = {
    gemini: {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      authHeader: 'x-goog-api-key',
      canListModels: true,
      fixedModels: [
        { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', deprecated: false },
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', deprecated: false },
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (2026-03-31 shutdown)', deprecated: true, shutdownDate: '2026-03-31' }
      ]
    },
    openai_llm: {
      endpoint: 'https://api.openai.com/v1/models',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      canListModels: false,
      canListModelsWithProxy: true,
      fixedModels: [
        { id: 'gpt-4o', displayName: 'GPT-4o (Recommended)', deprecated: false },
        { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini (Low cost)', deprecated: false },
        { id: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', deprecated: false }
      ],
      allowCustomModel: true
    },
    claude: {
      endpoint: 'https://api.anthropic.com/v1/models',
      authHeader: 'x-api-key',
      extraHeaders: {
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      canListModels: true,
      fixedModels: [
        { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', deprecated: false },
        { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', deprecated: false }
      ]
    },
    groq: {
      endpoint: 'https://api.groq.com/openai/v1/models',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      canListModels: true,
      fixedModels: [
        { id: 'llama-3.3-70b-versatile', displayName: 'LLaMA 3.3 70B (Recommended)', deprecated: false },
        { id: 'llama-3.1-8b-instant', displayName: 'LLaMA 3.1 8B (Low cost)', deprecated: false }
      ]
    }
  };

  function getProvider(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    if (!provider) return null;
    return Object.assign({}, provider);
  }

  function getDefaultModel(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.defaultModel : undefined;
  }

  function getApiKeyProviderId(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.apiKeyProviderId : providerId;
  }

  function getModelProviderId(providerId) {
    var provider = PROVIDER_DEFINITIONS[providerId];
    return provider ? provider.modelProviderId : providerId;
  }

  function getApiKeyStorageKey(providerId) {
    return '_ak_' + getApiKeyProviderId(providerId);
  }

  function normalizeGeminiModelId(model) {
    if (!model) return model;
    if (model.startsWith('models/')) {
      return model.slice(7);
    }
    return model;
  }

  // For STT setting migration compatibility.
  function normalizeSttProviderId(providerId) {
    if (providerId === 'openai' || providerId === 'gemini') return 'openai_stt';
    if (providerId === 'deepgram') return 'deepgram_realtime';
    return providerId;
  }

  // For llmPriority migration compatibility.
  function normalizeLlmProviderId(providerId) {
    if (providerId === 'openai') return 'openai_llm';
    return providerId;
  }

  function normalizeCapabilityProviderId(providerId) {
    if (!providerId) return '';
    return CAPABILITY_PROVIDER_MAP[providerId] || providerId;
  }

  function isLlmProvider(providerId) {
    return LLM_PROVIDER_IDS.includes(providerId);
  }

  function isSttProvider(providerId) {
    return STT_PROVIDER_IDS.includes(providerId);
  }

  function getLlmProviderIds(options) {
    var includeLegacy = Boolean(options && options.includeLegacy);
    return includeLegacy
      ? LLM_PROVIDER_IDS_WITH_LEGACY.slice()
      : LLM_PROVIDER_IDS.slice();
  }

  function getSttProviderIds() {
    return STT_PROVIDER_IDS.slice();
  }

  function getApiKeyProviderIds() {
    return API_KEY_PROVIDER_IDS.slice();
  }

  function getLlmProviderPriority() {
    return LLM_PROVIDER_PRIORITY.slice();
  }

  function cloneModelRegistryProviderConfigBase() {
    var cloned = {};

    Object.keys(MODEL_REGISTRY_PROVIDER_CONFIG_BASE).forEach(function (providerId) {
      var config = MODEL_REGISTRY_PROVIDER_CONFIG_BASE[providerId];
      var copied = Object.assign({}, config);

      if (config.fixedModels) {
        copied.fixedModels = config.fixedModels.map(function (model) {
          return Object.assign({}, model);
        });
      }

      if (config.extraHeaders) {
        copied.extraHeaders = Object.assign({}, config.extraHeaders);
      }

      cloned[providerId] = copied;
    });

    return cloned;
  }

  return {
    PROVIDER_DEFINITIONS: Object.assign({}, PROVIDER_DEFINITIONS),
    CAPABILITY_PROVIDER_MAP: Object.assign({}, CAPABILITY_PROVIDER_MAP),
    MODEL_REGISTRY_PROVIDER_CONFIG_BASE: cloneModelRegistryProviderConfigBase(),
    getProvider: getProvider,
    getDefaultModel: getDefaultModel,
    getApiKeyProviderId: getApiKeyProviderId,
    getModelProviderId: getModelProviderId,
    getApiKeyStorageKey: getApiKeyStorageKey,
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
    getModelRegistryProviderConfigBase: cloneModelRegistryProviderConfigBase
  };
})();

if (typeof window !== 'undefined') {
  window.ProviderCatalog = ProviderCatalog;
}

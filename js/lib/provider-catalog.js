// Provider catalog (single source of truth candidate)
// NOTE: This file is intentionally side-effect free so existing behavior is unchanged.
const ProviderCatalog = (function () {
  'use strict';

  var LLM_PROVIDER_IDS = ['gemini', 'claude', 'openai_llm', 'groq'];
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

  return {
    PROVIDER_DEFINITIONS: Object.assign({}, PROVIDER_DEFINITIONS),
    CAPABILITY_PROVIDER_MAP: Object.assign({}, CAPABILITY_PROVIDER_MAP),
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
    getSttProviderIds: getSttProviderIds,
    getApiKeyProviderIds: getApiKeyProviderIds
  };
})();

if (typeof window !== 'undefined') {
  window.ProviderCatalog = ProviderCatalog;
}

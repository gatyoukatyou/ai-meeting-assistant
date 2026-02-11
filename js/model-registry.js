// =====================================
// Model Registry - A+B Auto-Detection
// =====================================
// A: Fetch available models via models.list API
// B: Lightweight probe for health check, auto-fallback dead models

const ModelRegistry = (function() {
  'use strict';

  // =====================================
  // Constants
  // =====================================
  const STORAGE_KEY =
    (typeof ModelRegistryCacheStore !== 'undefined' && ModelRegistryCacheStore.STORAGE_KEY)
      ? ModelRegistryCacheStore.STORAGE_KEY
      : '_model_registry';
  const MODEL_LIST_TTL = 24 * 60 * 60 * 1000;  // 24 hours
  const HEALTH_TTL = 6 * 60 * 60 * 1000;       // 6 hours
  const FLAKY_COOLDOWN = 5 * 60 * 1000;        // 5 minutes (for 429/5xx)

  // Gemini 2.0 Flash GA models - exact match only (avoid catching exp/live/preview)
  // 出典: https://ai.google.dev/gemini-api/docs/deprecations
  const GEMINI_2_FLASH_GA = new Set([
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001'
  ]);

  // =====================================
  // Provider Configurations
  // =====================================
  function parseGeminiModels(data) {
    if (!data || !data.models) return [];
    return data.models
      .filter(function(m) {
        // Field variations: supportedGenerationMethods / supportedActions / supported_actions
        var methods = m.supportedGenerationMethods
          || m.supportedActions
          || m.supported_actions
          || [];
        return methods.includes('generateContent');
      })
      .map(function(m) {
        var id = m.name.replace('models/', '');
        var deprecated = m.lifecycle && m.lifecycle.status === 'DEPRECATED';
        var shutdownDate = m.lifecycle && m.lifecycle.shutdownDate;

        // Mark Gemini 2.0 Flash GA models as deprecated
        if (GEMINI_2_FLASH_GA.has(id)) {
          deprecated = true;
          shutdownDate = shutdownDate || '2026-03-31';
        }

        return {
          id: id,
          rawName: m.name,
          displayName: m.displayName || id,
          deprecated: deprecated || false,
          shutdownDate: shutdownDate || null
        };
      });
  }

  function parseOpenAIModels(data) {
    if (!data || !data.data) return [];
    return data.data
      .filter(function(m) {
        // Filter to chat models only
        return m.id.startsWith('gpt-');
      })
      .map(function(m) {
        return {
          id: m.id,
          displayName: m.id,
          deprecated: false
        };
      });
  }

  function parseClaudeModels(data) {
    if (!data || !data.data) return [];
    return data.data.map(function(m) {
      return {
        id: m.id,
        displayName: m.display_name || m.id,
        deprecated: false
      };
    });
  }

  function parseGroqModels(data) {
    if (!data || !data.data) return [];
    return data.data.map(function(m) {
      return {
        id: m.id,
        displayName: m.id,
        deprecated: false
      };
    });
  }

  const FALLBACK_PROVIDER_CONFIG_BASE = {
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

  const PROVIDER_CONFIG_BASE =
    (typeof ProviderCatalog !== 'undefined' &&
      typeof ProviderCatalog.getModelRegistryProviderConfigBase === 'function')
      ? ProviderCatalog.getModelRegistryProviderConfigBase()
      : FALLBACK_PROVIDER_CONFIG_BASE;

  const PROVIDER_CONFIG = {
    gemini: Object.assign({}, PROVIDER_CONFIG_BASE.gemini, { parseModels: parseGeminiModels }),
    openai_llm: Object.assign({}, PROVIDER_CONFIG_BASE.openai_llm, { parseModels: parseOpenAIModels }),
    claude: Object.assign({}, PROVIDER_CONFIG_BASE.claude, { parseModels: parseClaudeModels }),
    groq: Object.assign({}, PROVIDER_CONFIG_BASE.groq, { parseModels: parseGroqModels })
  };

  // =====================================
  // Gemini Model ID Normalization
  // =====================================

  /**
   * Normalize Gemini model ID - remove "models/" prefix if present
   * This prevents "/models/models/..." double-prefix bugs
   * @param {string} model - Model ID (may or may not have "models/" prefix)
   * @returns {string} - Model ID without "models/" prefix
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

  // =====================================
  // Cache Management
  // =====================================

  /**
   * Simple hash function for API key (don't store raw key)
   */
  function simpleHash(str) {
    if (!str) return '00000000';
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Generate cache key for provider + apiKey combo
   */
  function getCacheKey(provider, apiKey) {
    var hash = simpleHash(apiKey).slice(0, 8);
    return provider + ':' + hash;
  }

  /**
   * Load cache from localStorage
   */
  function loadCache() {
    try {
      var raw =
        (typeof ModelRegistryCacheStore !== 'undefined' && typeof ModelRegistryCacheStore.read === 'function')
          ? ModelRegistryCacheStore.read()
          : localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyCache();
      var cache = JSON.parse(raw);
      if (cache.version !== 2) return createEmptyCache();
      return cache;
    } catch (e) {
      console.warn('[ModelRegistry] Failed to load cache:', e);
      return createEmptyCache();
    }
  }

  /**
   * Save cache to localStorage
   */
  function saveCache(cache) {
    try {
      var serialized = JSON.stringify(cache);
      if (
        typeof ModelRegistryCacheStore !== 'undefined' &&
        typeof ModelRegistryCacheStore.write === 'function'
      ) {
        ModelRegistryCacheStore.write(serialized);
      } else {
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch (e) {
      console.warn('[ModelRegistry] Failed to save cache:', e);
    }
  }

  /**
   * Create empty cache structure
   */
  function createEmptyCache() {
    return {
      version: 2,
      providers: {},
      health: {},
      settings: {
        showPreviewModels: false
      }
    };
  }

  // =====================================
  // Model Fetching
  // =====================================

  /**
   * Fetch models from provider API
   * For Gemini: Try header auth first, fallback to ?key= query param
   * For Gemini: Try v1 first, fallback to v1beta
   */
  async function fetchModels(provider, apiKey) {
    var config = PROVIDER_CONFIG[provider];
    if (!config) {
      console.warn('[ModelRegistry] Unknown provider:', provider);
      return null;
    }

    if (!config.canListModels) {
      console.log('[ModelRegistry] Provider', provider, 'uses fixed list (canListModels=false)');
      return null;
    }

    if (!apiKey) {
      console.warn('[ModelRegistry] No API key for', provider);
      return null;
    }

    // Gemini: Try v1 first, then v1beta, with header → ?key= fallback
    if (provider === 'gemini') {
      return await fetchGeminiModels(apiKey, config);
    }

    var headers = {
      'Content-Type': 'application/json'
    };

    // Add auth header
    if (config.authHeader) {
      var authValue = (config.authPrefix || '') + apiKey;
      headers[config.authHeader] = authValue;
    }

    // Add extra headers if any
    if (config.extraHeaders) {
      for (var key in config.extraHeaders) {
        headers[key] = config.extraHeaders[key];
      }
    }

    try {
      var response = await fetch(config.endpoint, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        console.warn('[ModelRegistry] API returned', response.status, 'for', provider);
        return null;
      }

      var data = await response.json();
      var models = config.parseModels(data);

      console.log('[ModelRegistry] Fetched', models.length, 'models for', provider);
      return models;
    } catch (e) {
      console.warn('[ModelRegistry] Fetch failed for', provider, ':', e.message);
      return null;
    }
  }

  /**
   * Fetch Gemini models with v1 → v1beta and header → ?key= fallback
   */
  async function fetchGeminiModels(apiKey, config) {
    // API versions to try: v1 first (stable), then v1beta
    var apiVersions = ['v1', 'v1beta'];
    // Auth methods: header first (more secure), then query param (fallback)
    var authMethods = ['header', 'query'];

    for (var vi = 0; vi < apiVersions.length; vi++) {
      var version = apiVersions[vi];
      var endpoint = 'https://generativelanguage.googleapis.com/' + version + '/models';

      for (var ai = 0; ai < authMethods.length; ai++) {
        var authMethod = authMethods[ai];

        try {
          var fetchOptions = { method: 'GET' };
          var url = endpoint;

          if (authMethod === 'header') {
            fetchOptions.headers = { 'x-goog-api-key': apiKey };
          } else {
            // Query param fallback (less secure but works in some CORS-restricted environments)
            url = endpoint + '?key=' + encodeURIComponent(apiKey);
          }

          console.log('[ModelRegistry] Trying Gemini', version, 'with', authMethod, 'auth');
          var response = await fetch(url, fetchOptions);

          if (response.ok) {
            var data = await response.json();
            var models = config.parseModels(data);
            console.log('[ModelRegistry] Fetched', models.length, 'Gemini models via', version, authMethod);
            return models;
          }

          console.warn('[ModelRegistry] Gemini', version, authMethod, 'returned', response.status);
        } catch (e) {
          console.warn('[ModelRegistry] Gemini', version, authMethod, 'failed:', e.message);
        }
      }
    }

    console.warn('[ModelRegistry] All Gemini fetch attempts failed');
    return null;
  }

  /**
   * Get models for provider (with caching)
   */
  async function getModels(provider, apiKey, options) {
    options = options || {};
    var forceRefresh = options.forceRefresh || false;
    var showPreview = options.showPreview || false;

    var cache = loadCache();
    var cacheKey = getCacheKey(provider, apiKey);
    var cached = cache.providers[cacheKey];

    // Check if cache is valid
    if (!forceRefresh && cached && cached.models) {
      var age = Date.now() - (cached.fetchedAt || 0);
      if (age < MODEL_LIST_TTL) {
        console.log('[ModelRegistry] Using cached models for', provider);
        return filterAndSortModels(cached.models, { showPreview: showPreview });
      }
    }

    // Try to fetch fresh models
    var models = await fetchModels(provider, apiKey);

    if (models && models.length > 0) {
      // Update cache
      cache.providers[cacheKey] = {
        models: models,
        fetchedAt: Date.now(),
        ttl: MODEL_LIST_TTL
      };
      saveCache(cache);
      return filterAndSortModels(models, { showPreview: showPreview });
    }

    // Use cached if available (even if stale)
    if (cached && cached.models) {
      console.log('[ModelRegistry] Using stale cache for', provider);
      return filterAndSortModels(cached.models, { showPreview: showPreview });
    }

    // Fall back to fixed models
    var config = PROVIDER_CONFIG[provider];
    if (config && config.fixedModels) {
      console.log('[ModelRegistry] Using fixed models for', provider);
      return filterAndSortModels(config.fixedModels, { showPreview: showPreview });
    }

    return [];
  }

  /**
   * Check if a model's shutdown date has passed
   * @param {string|null} shutdownDate - Date string in YYYY-MM-DD format
   * @returns {boolean}
   */
  function isShutdownDatePassed(shutdownDate) {
    if (!shutdownDate) return false;
    try {
      var shutdown = new Date(shutdownDate + 'T00:00:00Z');
      var now = new Date();
      return now > shutdown;
    } catch (e) {
      return false;
    }
  }

  /**
   * Filter and sort models
   */
  function filterAndSortModels(models, options) {
    options = options || {};
    var showPreview = options.showPreview || false;

    return models
      // P0-5: Exclude models past their shutdown date
      .filter(function(m) {
        if (m.shutdownDate && isShutdownDatePassed(m.shutdownDate)) {
          console.log('[ModelRegistry] Excluding model past shutdown date:', m.id, m.shutdownDate);
          return false;
        }
        return true;
      })
      // Filter preview/exp models (unless showPreview is true)
      .filter(function(m) {
        if (showPreview) return true;
        return !m.id.includes('-preview') && !m.id.includes('-exp');
      })
      // Sort: deprecated/shutdown at bottom
      .sort(function(a, b) {
        // Deprecated at bottom
        if (a.deprecated && !b.deprecated) return 1;
        if (!a.deprecated && b.deprecated) return -1;
        // 2.0-flash variants at bottom
        var a2Flash = a.id.includes('2.0-flash');
        var b2Flash = b.id.includes('2.0-flash');
        if (a2Flash && !b2Flash) return 1;
        if (!a2Flash && b2Flash) return -1;
        // Alphabetical otherwise
        return a.id.localeCompare(b.id);
      });
  }

  // =====================================
  // Health Management
  // =====================================

  /**
   * Get health status for a model
   */
  function getModelHealth(provider, model) {
    var cache = loadCache();
    var key = provider + ':' + model;
    return cache.health[key] || null;
  }

  /**
   * Set health status for a model
   * status: 'working' | 'dead' | 'flaky'
   */
  function setModelHealth(provider, model, status, error) {
    var cache = loadCache();
    var key = provider + ':' + model;

    var healthEntry = {
      status: status,
      testedAt: Date.now(),
      error: error || null
    };

    // For flaky status, set retry time
    if (status === 'flaky') {
      healthEntry.retryAfter = Date.now() + FLAKY_COOLDOWN;
    }

    cache.health[key] = healthEntry;
    saveCache(cache);

    console.log('[ModelRegistry] Set health:', key, '=', status);
  }

  /**
   * Check if health entry is still valid
   */
  function isHealthValid(healthEntry) {
    if (!healthEntry) return false;
    var age = Date.now() - (healthEntry.testedAt || 0);
    return age < HEALTH_TTL;
  }

  /**
   * Probe Gemini model with v1 → v1beta, header → query fallback
   */
  async function probeGeminiModel(model, apiKey) {
    // Normalize model ID to prevent /models/models/... bug
    var normalizedModel = normalizeGeminiModelId(model);

    var apiVersions = ['v1', 'v1beta'];
    var authMethods = ['header', 'query'];
    var body = JSON.stringify({
      contents: [{ parts: [{ text: 'Hi' }] }],
      generationConfig: { maxOutputTokens: 1 }
    });

    var gotAuthError = false;
    var gotModelNotFound = false;

    for (var vi = 0; vi < apiVersions.length; vi++) {
      var version = apiVersions[vi];

      for (var ai = 0; ai < authMethods.length; ai++) {
        var authMethod = authMethods[ai];

        try {
          var url = 'https://generativelanguage.googleapis.com/' + version + '/models/' + normalizedModel + ':generateContent';
          var fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
          };

          if (authMethod === 'header') {
            fetchOptions.headers['x-goog-api-key'] = apiKey;
          } else {
            url = url + '?key=' + encodeURIComponent(apiKey);
          }

          var response = await fetch(url, fetchOptions);

          if (response.ok) {
            setModelHealth('gemini', normalizedModel, 'working');
            return 'working';
          }

          // Auth errors - try next auth method (don't mark as dead!)
          if (response.status === 401 || response.status === 403) {
            gotAuthError = true;
            continue;
          }

          // Model not found - try next API version
          if (response.status === 404) {
            gotModelNotFound = true;
            break;
          }

          // Rate limit or server error
          if (response.status === 429 || response.status >= 500) {
            setModelHealth('gemini', normalizedModel, 'flaky', 'Rate limit or server error (' + response.status + ')');
            return 'flaky';
          }

          // Check error message
          var errorData = await response.json().catch(function() { return {}; });
          var errorMsg = errorData.error?.message || 'Unknown error';

          if (isModelNotFoundError({ message: errorMsg })) {
            gotModelNotFound = true;
            break; // Try next API version
          }
        } catch (e) {
          console.warn('[ModelRegistry] Gemini probe', version, authMethod, 'failed:', e.message);
        }
      }
    }

    // Distinguish between auth failure vs model not found
    if (gotModelNotFound) {
      setModelHealth('gemini', normalizedModel, 'dead', 'Model not found in v1 or v1beta');
      return 'dead';
    }

    if (gotAuthError) {
      // Auth errors are NOT model problems - return unknown
      console.warn('[ModelRegistry] Gemini probe: auth failed, not marking model as dead');
      return 'unknown';
    }

    // Network errors or other issues - return unknown
    return 'unknown';
  }

  /**
   * Lightweight probe to check if model is working
   */
  async function probeModel(provider, model, apiKey) {
    if (!apiKey) return 'unknown';

    var config = PROVIDER_CONFIG[provider];
    if (!config) return 'unknown';

    // Gemini uses special fallback logic (v1 → v1beta, header → query)
    if (provider === 'gemini') {
      return await probeGeminiModel(model, apiKey);
    }

    try {
      var headers = {
        'Content-Type': 'application/json'
      };

      // Add auth header
      if (config.authHeader) {
        var authValue = (config.authPrefix || '') + apiKey;
        headers[config.authHeader] = authValue;
      }

      // Add extra headers if any
      if (config.extraHeaders) {
        for (var key in config.extraHeaders) {
          headers[key] = config.extraHeaders[key];
        }
      }

      var body, endpoint;

      switch (provider) {

        case 'claude':
          endpoint = 'https://api.anthropic.com/v1/messages';
          body = JSON.stringify({
            model: model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          break;

        case 'openai_llm':
          endpoint = 'https://api.openai.com/v1/chat/completions';
          body = JSON.stringify({
            model: model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          break;

        case 'groq':
          endpoint = 'https://api.groq.com/openai/v1/chat/completions';
          body = JSON.stringify({
            model: model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          break;

        default:
          return 'unknown';
      }

      var response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: body
      });

      if (response.ok) {
        setModelHealth(provider, model, 'working');
        return 'working';
      }

      // Check error type
      if (response.status === 404) {
        setModelHealth(provider, model, 'dead', 'Model not found (404)');
        return 'dead';
      }

      if (response.status === 429 || response.status >= 500) {
        setModelHealth(provider, model, 'flaky', 'Rate limit or server error (' + response.status + ')');
        return 'flaky';
      }

      // Other errors - might be auth issue, not model issue
      var errorData = await response.json().catch(function() { return {}; });
      var errorMsg = errorData.error?.message || 'Unknown error';

      if (isModelNotFoundError({ message: errorMsg })) {
        setModelHealth(provider, model, 'dead', errorMsg);
        return 'dead';
      }

      return 'unknown';
    } catch (e) {
      console.warn('[ModelRegistry] Probe failed for', provider, model, ':', e.message);
      return 'unknown';
    }
  }

  /**
   * Check if error indicates model not found
   */
  function isModelNotFoundError(error) {
    var msg = (error.message || '').toLowerCase();
    return msg.includes('not found')
      || msg.includes('not supported')
      || msg.includes('does not exist')
      || msg.includes('model not available')
      || msg.includes('invalid model');
  }

  // =====================================
  // Fallback Logic
  // =====================================

  /**
   * Get recommended model for provider
   */
  async function getRecommendedModel(provider, apiKey) {
    var models = await getModels(provider, apiKey, { showPreview: false });

    // Find first non-deprecated, working model
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (m.deprecated) continue;

      var health = getModelHealth(provider, m.id);
      if (health && health.status === 'dead') continue;
      if (health && health.status === 'flaky' && Date.now() < health.retryAfter) continue;

      return m;
    }

    // Return first available if all are deprecated/dead
    return models[0] || null;
  }

  /**
   * Get fallback model (exclude current model and dead models)
   */
  async function getFallbackModel(provider, currentModel, apiKey) {
    var models = await getModels(provider, apiKey, { showPreview: false });

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (m.id === currentModel) continue;
      if (m.deprecated) continue;

      var health = getModelHealth(provider, m.id);
      if (health && health.status === 'dead') continue;
      if (health && health.status === 'flaky' && Date.now() < health.retryAfter) continue;

      return m;
    }

    // If all non-deprecated are dead/flaky, try deprecated ones
    for (var j = 0; j < models.length; j++) {
      var md = models[j];
      if (md.id === currentModel) continue;

      var healthD = getModelHealth(provider, md.id);
      if (healthD && healthD.status === 'dead') continue;

      return md;
    }

    return null;
  }

  /**
   * Get fixed models for provider (no API call)
   */
  function getFixedModels(provider) {
    var config = PROVIDER_CONFIG[provider];
    if (!config || !config.fixedModels) return [];
    return config.fixedModels.slice();
  }

  // =====================================
  // Cache Control
  // =====================================

  /**
   * Clear cache for provider (or all)
   */
  function clearCache(provider) {
    var cache = loadCache();

    if (provider) {
      // Clear specific provider
      var keysToDelete = [];
      for (var key in cache.providers) {
        if (key.startsWith(provider + ':')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(function(k) {
        delete cache.providers[k];
      });

      // Clear health for provider
      var healthKeysToDelete = [];
      for (var hKey in cache.health) {
        if (hKey.startsWith(provider + ':')) {
          healthKeysToDelete.push(hKey);
        }
      }
      healthKeysToDelete.forEach(function(k) {
        delete cache.health[k];
      });
    } else {
      // Clear all
      cache = createEmptyCache();
    }

    saveCache(cache);
    console.log('[ModelRegistry] Cache cleared:', provider || 'all');
  }

  /**
   * Get show preview setting
   */
  function getShowPreview() {
    var cache = loadCache();
    return cache.settings.showPreviewModels || false;
  }

  /**
   * Set show preview setting
   */
  function setShowPreview(value) {
    var cache = loadCache();
    cache.settings.showPreviewModels = !!value;
    saveCache(cache);
  }

  /**
   * Get last fetch timestamp for provider
   */
  function getLastFetchTime(provider, apiKey) {
    var cache = loadCache();
    var cacheKey = getCacheKey(provider, apiKey);
    var cached = cache.providers[cacheKey];
    return cached ? cached.fetchedAt : null;
  }

  // =====================================
  // Public API
  // =====================================
  return {
    // Model fetching
    fetchModels: fetchModels,
    getModels: getModels,
    getFixedModels: getFixedModels,

    // Health management
    probeModel: probeModel,
    getModelHealth: getModelHealth,
    setModelHealth: setModelHealth,
    isModelNotFoundError: isModelNotFoundError,

    // Fallback logic
    getRecommendedModel: getRecommendedModel,
    getFallbackModel: getFallbackModel,

    // Cache control
    clearCache: clearCache,
    getLastFetchTime: getLastFetchTime,

    // Settings
    getShowPreview: getShowPreview,
    setShowPreview: setShowPreview,

    // Utilities
    normalizeGeminiModelId: normalizeGeminiModelId,

    // Constants (for external use)
    PROVIDER_CONFIG: PROVIDER_CONFIG,
    MODEL_LIST_TTL: MODEL_LIST_TTL,
    HEALTH_TTL: HEALTH_TTL,
    FLAKY_COOLDOWN: FLAKY_COOLDOWN
  };
})();

// Export for global access
window.ModelRegistry = ModelRegistry;

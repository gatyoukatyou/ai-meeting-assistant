// Shared Chat Completions adapter for OpenAI, Groq, and DeepSeek.
const OpenAICompatibleClient = (function () {
  'use strict';

  function ProviderApiError(message, details) {
    var info = details || {};
    this.name = 'ProviderApiError';
    this.message = message || 'Provider API error';
    this.provider = info.provider || '';
    this.status = Number.isFinite(info.status) ? info.status : null;
    this.code = info.code || '';
    this.errorType = info.errorType || '';
    this.category = info.category || classifyError(info);
    this.retryable = this.category === 'rate_limit' || this.category === 'temporary_server' || this.category === 'network';
    if (Error.captureStackTrace) Error.captureStackTrace(this, ProviderApiError);
  }
  ProviderApiError.prototype = Object.create(Error.prototype);
  ProviderApiError.prototype.constructor = ProviderApiError;

  function classifyError(details) {
    var info = details || {};
    var status = info.status;
    var code = String(info.code || '').toLowerCase();
    var type = String(info.errorType || '').toLowerCase();
    var message = String(info.message || '').toLowerCase();
    var combined = [code, type, message].join(' ');

    if (info.networkError) return 'network';
    if (status === 429) return 'rate_limit';
    if (status >= 500 && status <= 599) return 'temporary_server';
    if (status === 402 || /balance|billing|quota|credit|insufficient/.test(combined)) return 'billing';
    if (/region|country|territor|location/.test(combined)) return 'region';
    if (status === 401 || status === 403) return 'authentication';
    if (status === 413 || /context.length|too.long|maximum.context|token.limit/.test(combined)) return 'input_limit';
    if (status === 404 || /model.*(not found|does not exist|deprecated|retired)/.test(combined)) return 'model';
    if (status === 400 || status === 422) return 'invalid_request';
    return 'unknown';
  }

  function getProviderDefinition(providerId) {
    if (typeof ProviderCatalog === 'undefined' || typeof ProviderCatalog.getProvider !== 'function') {
      return null;
    }
    var normalized = providerId === 'openai' ? 'openai_llm' : providerId;
    var provider = ProviderCatalog.getProvider(normalized);
    return provider && provider.apiKind === 'openai-compatible' ? provider : null;
  }

  function applyReasoningPolicy(providerId, model, payload, taskType, reasoningBoost) {
    var result = Object.assign({}, payload);
    var task = taskType === 'advice' ? 'advice' : 'summary';
    var boosted = Boolean(reasoningBoost) && task === 'advice';

    if (providerId === 'local_llm') {
      // Ollama-style servers: thinking models (e.g. qwen3.5) fill max_tokens
      // with reasoning before any answer text unless thinking is disabled.
      result.think = Boolean(boosted);
      return result;
    }

    if (providerId === 'deepseek') {
      result.thinking = { type: boosted ? 'enabled' : 'disabled' };
      if (boosted) result.reasoning_effort = 'high';
      return result;
    }

    if (providerId === 'groq' && /^openai\/gpt-oss-(20b|120b)$/.test(model)) {
      result.reasoning_effort = boosted ? 'medium' : 'low';
      result.include_reasoning = false;
      return result;
    }

    if ((providerId === 'openai_llm' || providerId === 'openai') && /^gpt-5\.6-/.test(model)) {
      result.reasoning_effort = boosted ? 'medium' : 'low';
    }
    return result;
  }

  function buildRequest(options) {
    var opts = options || {};
    var providerId = opts.provider === 'openai' ? 'openai_llm' : opts.provider;
    var provider = getProviderDefinition(providerId);
    if (!provider) throw new Error('Unsupported OpenAI-compatible provider: ' + opts.provider);

    var payload = {
      model: opts.model,
      messages: [{ role: 'user', content: opts.prompt }]
    };
    payload = applyReasoningPolicy(providerId, opts.model, payload, opts.taskType, opts.reasoningBoost);

    var headers = { 'Content-Type': 'application/json' };
    if (provider.requiresApiKey !== false || opts.apiKey) {
      var auth = provider.authorization || { header: 'Authorization', prefix: 'Bearer ' };
      headers[auth.header] = (auth.prefix || '') + opts.apiKey;
    }
    var baseUrl = opts.apiBaseUrl || provider.apiBaseUrl;
    return {
      url: baseUrl + provider.chatCompletionsPath,
      options: {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: opts.signal || null
      },
      payload: payload,
      provider: providerId
    };
  }

  function parseErrorBody(providerId, data, status) {
    var provider = getProviderDefinition(providerId);
    var fields = provider && provider.errorFields
      ? provider.errorFields
      : { root: 'error', message: 'message', code: 'code', type: 'type' };
    var source = data && fields.root && data[fields.root] ? data[fields.root] : (data || {});
    var message = source[fields.message] || source.message || source.msg || ('HTTP ' + status);
    var code = source[fields.code] || source.code || source.error_code || '';
    var errorType = source[fields.type] || source.type || source.error_type || '';
    return new ProviderApiError(message, {
      provider: providerId,
      status: status,
      code: code,
      errorType: errorType,
      message: message
    });
  }

  function parseUsage(providerId, data, prompt, text) {
    var provider = getProviderDefinition(providerId);
    var fields = provider && provider.usageFields
      ? provider.usageFields
      : { input: 'prompt_tokens', output: 'completion_tokens' };
    var usage = data && data.usage ? data.usage : {};
    return {
      inputTokens: Number.isFinite(usage[fields.input]) ? usage[fields.input] : Math.ceil(String(prompt || '').length / 4),
      outputTokens: Number.isFinite(usage[fields.output]) ? usage[fields.output] : Math.ceil(String(text || '').length / 4),
      estimated: !Number.isFinite(usage[fields.input]) || !Number.isFinite(usage[fields.output])
    };
  }

  async function call(options) {
    var opts = options || {};
    var request = buildRequest(opts);
    var fetchImpl = opts.fetchImpl || fetch;
    var response;
    try {
      response = await fetchImpl(request.url, request.options);
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new ProviderApiError('Network or CORS error while contacting ' + request.provider, {
        provider: request.provider,
        code: error && error.name,
        message: error && error.message,
        networkError: true
      });
    }

    var data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw parseErrorBody(request.provider, data, response.status);

    var text = data && data.choices && data.choices[0] && data.choices[0].message
      ? (data.choices[0].message.content || '') : '';
    return { text: text, usage: parseUsage(request.provider, data, opts.prompt, text), data: data, request: request };
  }

  function isRetryableError(error) {
    return Boolean(error && (error.retryable === true || ['rate_limit', 'temporary_server', 'network'].includes(error.category)));
  }

  return {
    ProviderApiError: ProviderApiError,
    classifyError: classifyError,
    applyReasoningPolicy: applyReasoningPolicy,
    buildRequest: buildRequest,
    parseErrorBody: parseErrorBody,
    parseUsage: parseUsage,
    call: call,
    isRetryableError: isRetryableError
  };
})();

if (typeof window !== 'undefined') window.OpenAICompatibleClient = OpenAICompatibleClient;

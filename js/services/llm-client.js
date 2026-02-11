const LLMClientService = (function () {
  'use strict';

  function resolveAvailableLlm(options) {
    const opts = options || {};
    const priority = opts.priority || 'auto';
    const providerPriority = Array.isArray(opts.providerPriority)
      ? opts.providerPriority
      : ['claude', 'openai_llm', 'gemini', 'groq'];
    const hasApiKey = typeof opts.hasApiKey === 'function'
      ? opts.hasApiKey
      : function () { return false; };
    const getEffectiveModel = typeof opts.getEffectiveModel === 'function'
      ? opts.getEffectiveModel
      : function () { return ''; };
    const getDefaultModel = typeof opts.getDefaultModel === 'function'
      ? opts.getDefaultModel
      : function () { return ''; };

    if (priority !== 'auto' && hasApiKey(priority)) {
      return {
        provider: priority,
        model: getEffectiveModel(priority, getDefaultModel(priority))
      };
    }

    for (const provider of providerPriority) {
      if (hasApiKey(provider)) {
        return {
          provider: provider,
          model: getEffectiveModel(provider, getDefaultModel(provider))
        };
      }
    }

    return null;
  }

  // callLLMOnce core logic, kept DOM-free via injected callbacks/dependencies.
  async function callLLMOnce(options) {
    const opts = options || {};
    const provider = opts.provider;
    const model = opts.model;
    const prompt = opts.prompt;
    const signal = opts.signal || null;
    const apiKey = opts.apiKey || '';
    const meetingContext = opts.meetingContext || {};
    const costs = opts.costs;
    const pricingTable = opts.pricing;

    const deps = opts.deps || {};
    const callGeminiApi = deps.callGeminiApi;
    const fetchWithRetry = deps.fetchWithRetry;
    const applyReasoningBoost = deps.applyReasoningBoost;
    const getCapabilities = deps.getCapabilities;
    const showToast = deps.showToast;
    const t = deps.t || function (k) { return k; };
    const updateCosts = deps.updateCosts;
    const checkCostAlert = deps.checkCostAlert;

    let response, data, text;
    let inputTokens = 0;
    let outputTokens = 0;

    switch (provider) {
      case 'gemini': {
        const geminiParts = [{ text: prompt }];
        let usedNativeDocs = false;

        if (meetingContext.nativeDocsEnabled && Array.isArray(meetingContext.files) && meetingContext.files.length > 0) {
          const caps = typeof getCapabilities === 'function'
            ? getCapabilities('gemini', model)
            : { supportsNativeDocs: false };
          if (caps.supportsNativeDocs) {
            let pdfCount = 0;
            for (const fileEntry of meetingContext.files) {
              if (fileEntry.base64Data && fileEntry.type === 'application/pdf') {
                geminiParts.push({
                  inline_data: {
                    mime_type: fileEntry.type,
                    data: fileEntry.base64Data
                  }
                });
                usedNativeDocs = true;
                pdfCount += 1;
              }
            }
            if (usedNativeDocs) {
              console.log('[LLM] Native Docs: sending', pdfCount, 'PDF files to Gemini');
            }
          }
        }

        try {
          response = await callGeminiApi(model, apiKey, { contents: [{ parts: geminiParts }] }, signal);
          data = await response.json();
          if (!response.ok) {
            const errMsg = (data && data.error && data.error.message) ? data.error.message : 'Gemini API error';
            throw new Error(errMsg);
          }
        } catch (geminiErr) {
          if (geminiErr.name === 'AbortError') throw geminiErr;
          if (usedNativeDocs) {
            console.warn('[LLM] Native Docs failed, falling back to text extraction:', geminiErr.message);
            if (typeof showToast === 'function') {
              showToast(t('context.nativeDocsFallback') || 'Native Docsに失敗、テキスト抽出にフォールバック', 'warning');
            }
            response = await callGeminiApi(model, apiKey, {
              contents: [{ parts: [{ text: prompt }] }]
            }, signal);
            data = await response.json();
            if (!response.ok) {
              const errMsg2 = (data && data.error && data.error.message) ? data.error.message : 'Gemini API error';
              throw new Error(errMsg2);
            }
          } else {
            throw geminiErr;
          }
        }

        text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
          data.candidates[0].content.parts && data.candidates[0].content.parts[0])
          ? data.candidates[0].content.parts[0].text : '';
        inputTokens = (data.usageMetadata && data.usageMetadata.promptTokenCount)
          ? data.usageMetadata.promptTokenCount : Math.ceil(prompt.length / 4);
        outputTokens = (data.usageMetadata && data.usageMetadata.candidatesTokenCount)
          ? data.usageMetadata.candidatesTokenCount : Math.ceil(text.length / 4);
        break;
      }

      case 'claude': {
        let claudePayload = {
          model: model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }]
        };
        if (typeof applyReasoningBoost === 'function') {
          claudePayload = applyReasoningBoost('anthropic', model, claudePayload);
        }

        response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(claudePayload),
          signal: signal
        });
        data = await response.json();
        if (!response.ok) {
          const errMsg = (data && data.error && data.error.message) ? data.error.message : 'Claude API error';
          throw new Error(errMsg);
        }

        text = '';
        if (data.content && Array.isArray(data.content)) {
          for (let i = 0; i < data.content.length; i += 1) {
            if (data.content[i].type === 'text') {
              text += data.content[i].text;
            }
          }
        }
        if (!text && data.content && data.content[0] && data.content[0].text) {
          text = data.content[0].text;
        }
        inputTokens = (data.usage && data.usage.input_tokens) ? data.usage.input_tokens : Math.ceil(prompt.length / 4);
        outputTokens = (data.usage && data.usage.output_tokens) ? data.usage.output_tokens : Math.ceil(text.length / 4);
        break;
      }

      case 'openai':
      case 'openai_llm': {
        let openaiPayload = {
          model: model,
          messages: [{ role: 'user', content: prompt }]
        };
        if (typeof applyReasoningBoost === 'function') {
          openaiPayload = applyReasoningBoost('openai', model, openaiPayload);
        }

        response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify(openaiPayload),
          signal: signal
        });
        data = await response.json();
        if (!response.ok) {
          const errMsg = (data && data.error && data.error.message) ? data.error.message : 'OpenAI API error';
          throw new Error(errMsg);
        }
        text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
          ? data.choices[0].message.content : '';
        inputTokens = (data.usage && data.usage.prompt_tokens) ? data.usage.prompt_tokens : Math.ceil(prompt.length / 4);
        outputTokens = (data.usage && data.usage.completion_tokens) ? data.usage.completion_tokens : Math.ceil(text.length / 4);
        break;
      }

      case 'groq': {
        response = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }]
          }),
          signal: signal
        });
        data = await response.json();
        if (!response.ok) {
          const errMsg = (data && data.error && data.error.message) ? data.error.message : 'Groq API error';
          throw new Error(errMsg);
        }
        text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
          ? data.choices[0].message.content : '';
        inputTokens = (data.usage && data.usage.prompt_tokens) ? data.usage.prompt_tokens : Math.ceil(prompt.length / 4);
        outputTokens = (data.usage && data.usage.completion_tokens) ? data.usage.completion_tokens : Math.ceil(text.length / 4);
        break;
      }

      default:
        throw new Error('Unknown provider: ' + provider);
    }

    const pricingProvider = pricingTable ? pricingTable[provider] : null;
    const pricing = (pricingProvider && pricingProvider[model]) ? pricingProvider[model] : { input: 1, output: 3 };
    const yenPerDollar = pricingTable && typeof pricingTable.yenPerDollar === 'number'
      ? pricingTable.yenPerDollar
      : 150;
    const cost = ((inputTokens * pricing.input + outputTokens * pricing.output) / 1000000) * yenPerDollar;

    if (costs && costs.llm && costs.llm.byProvider && Object.prototype.hasOwnProperty.call(costs.llm.byProvider, provider)) {
      costs.llm.inputTokens += inputTokens;
      costs.llm.outputTokens += outputTokens;
      costs.llm.calls += 1;
      costs.llm.byProvider[provider] += cost;
      costs.llm.total += cost;
    }

    if (typeof updateCosts === 'function') updateCosts();
    if (typeof checkCostAlert === 'function') checkCostAlert();

    return text;
  }

  return {
    resolveAvailableLlm,
    callLLMOnce
  };
})();

if (typeof window !== 'undefined') {
  window.LLMClientService = LLMClientService;
}

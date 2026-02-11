import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { LLMClientService } = loadScript('js/services/llm-client.js');

describe('LLMClientService.resolveAvailableLlm', () => {
  it('returns priority provider when API key exists', () => {
    const result = LLMClientService.resolveAvailableLlm({
      priority: 'gemini',
      hasApiKey: (provider) => provider === 'gemini',
      getEffectiveModel: (_provider, fallback) => fallback,
      getDefaultModel: (provider) => `${provider}-default`,
      providerPriority: ['claude', 'gemini']
    });
    assert.equal(result.provider, 'gemini');
    assert.equal(result.model, 'gemini-default');
  });

  it('falls back by provider priority', () => {
    const result = LLMClientService.resolveAvailableLlm({
      priority: 'auto',
      hasApiKey: (provider) => provider === 'claude',
      getEffectiveModel: (_provider, fallback) => fallback,
      getDefaultModel: (provider) => `${provider}-default`,
      providerPriority: ['claude', 'gemini']
    });
    assert.equal(result.provider, 'claude');
  });
});

describe('LLMClientService.callLLMOnce', () => {
  it('applies reasoning boost payload for openai requests', async () => {
    const fetchCalls = [];
    const fetchWithRetry = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      };
    };

    const applyCalls = [];
    const applyReasoningBoost = (provider, model, payload) => {
      applyCalls.push({ provider, model, payload });
      return Object.assign({}, payload, { reasoning_effort: 'medium' });
    };

    const text = await LLMClientService.callLLMOnce({
      provider: 'openai_llm',
      model: 'gpt-5-mini',
      prompt: 'hello',
      apiKey: 'test-key',
      deps: {
        fetchWithRetry,
        applyReasoningBoost
      }
    });

    assert.equal(text, 'ok');
    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0].provider, 'openai');
    assert.equal(applyCalls[0].model, 'gpt-5-mini');

    assert.equal(fetchCalls.length, 1);
    const requestBody = JSON.parse(fetchCalls[0].options.body);
    assert.equal(requestBody.reasoning_effort, 'medium');
  });
});

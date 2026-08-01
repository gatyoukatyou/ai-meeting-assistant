import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ProviderCatalog } = loadScript('js/lib/provider-catalog.js');
const { OpenAICompatibleClient } = loadScript('js/services/openai-compatible-client.js', { ProviderCatalog });
const { LLMClientService } = loadScript('js/services/llm-client.js', { OpenAICompatibleClient });

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

  it('uses another configured provider when the preferred provider has no API key', () => {
    const result = LLMClientService.resolveAvailableLlm({
      priority: 'gemini',
      hasApiKey: (provider) => provider === 'openai_llm',
      getEffectiveModel: (_provider, fallback) => fallback,
      getDefaultModel: (provider) => `${provider}-default`,
      providerPriority: ['gemini', 'openai_llm', 'claude']
    });
    assert.equal(result.provider, 'openai_llm');
    assert.equal(result.model, 'openai_llm-default');
  });
});

describe('LLMClientService.callLLMOnce', () => {
  it('applies advice reasoning policy for OpenAI requests', async () => {
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

    const text = await LLMClientService.callLLMOnce({
      provider: 'openai_llm',
      model: 'gpt-5.6-terra',
      prompt: 'hello',
      apiKey: 'test-key',
      taskType: 'advice',
      reasoningBoost: true,
      deps: {
        fetchWithRetry
      }
    });

    assert.equal(text, 'ok');
    assert.equal(fetchCalls.length, 1);
    const requestBody = JSON.parse(fetchCalls[0].options.body);
    assert.equal(requestBody.reasoning_effort, 'medium');
  });

  it('uses legacy Gemini 2.5 thinkingBudget without sending thinkingLevel', () => {
    const config = LLMClientService.getGeminiThinkingConfig('gemini-2.5-flash', 'summary', false);
    assert.equal(config.thinkingBudget, 0);
    assert.equal('thinkingLevel' in config, false);
  });

  it('uses Gemini minimal thinking for summaries and high for boosted advice', () => {
    assert.equal(
      LLMClientService.getGeminiThinkingConfig('gemini-3.6-flash', 'summary', false).thinkingLevel,
      'minimal'
    );
    assert.equal(
      LLMClientService.getGeminiThinkingConfig('gemini-3.6-flash', 'advice', true).thinkingLevel,
      'high'
    );
  });

  it('uses Claude Sonnet 5 adaptive thinking only for boosted advice', async () => {
    const payloads = [];
    const fetchWithRetry = async (_url, options) => {
      payloads.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: {} })
      };
    };
    await LLMClientService.callLLMOnce({
      provider: 'claude', model: 'claude-sonnet-5', prompt: 'summary', apiKey: 'k',
      taskType: 'summary', deps: { fetchWithRetry }
    });
    await LLMClientService.callLLMOnce({
      provider: 'claude', model: 'claude-sonnet-5', prompt: 'advice', apiKey: 'k',
      taskType: 'advice', reasoningBoost: true, deps: { fetchWithRetry }
    });
    assert.equal(payloads[0].thinking.type, 'disabled');
    assert.equal('output_config' in payloads[0], false);
    assert.equal(payloads[1].thinking.type, 'adaptive');
    assert.equal(payloads[1].output_config.effort, 'high');
    assert.equal('budget_tokens' in payloads[1].thinking, false);
  });

  it('does not invent a price for an unknown custom model', async () => {
    const costs = {
      llm: { inputTokens: 0, outputTokens: 0, calls: 0, byProvider: { openai: 0 }, total: 0 }
    };
    const fetchWithRetry = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      })
    });
    await LLMClientService.callLLMOnce({
      provider: 'openai_llm', model: 'user-custom-model', prompt: 'p', apiKey: 'k',
      costs,
      pricing: { openai_llm: {}, yenPerDollar: 150 },
      deps: { fetchWithRetry }
    });
    assert.equal(costs.llm.total, 0);
    assert.equal(costs.llm.hasUnknownEstimate, true);
  });
});

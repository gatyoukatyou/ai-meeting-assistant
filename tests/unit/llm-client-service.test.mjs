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

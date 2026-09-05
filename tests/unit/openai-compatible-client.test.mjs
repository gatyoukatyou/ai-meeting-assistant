import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ProviderCatalog } = loadScript('js/lib/provider-catalog.js');
const { OpenAICompatibleClient } = loadScript(
  'js/services/openai-compatible-client.js',
  { ProviderCatalog }
);

describe('OpenAICompatibleClient requests', () => {
  it('uses provider-specific URLs and bearer authorization', () => {
    const cases = [
      ['openai_llm', 'https://api.openai.com/v1/chat/completions'],
      ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
      ['deepseek', 'https://api.deepseek.com/chat/completions']
    ];
    for (const [provider, expectedUrl] of cases) {
      const request = OpenAICompatibleClient.buildRequest({
        provider,
        model: ProviderCatalog.getDefaultModel(provider),
        prompt: 'meeting',
        apiKey: 'secret-test-value'
      });
      assert.equal(request.url, expectedUrl);
      assert.equal(request.options.headers.Authorization, 'Bearer secret-test-value');
      assert.equal(JSON.parse(request.options.body).messages[0].content, 'meeting');
    }
  });

  it('separates summary and advice reasoning parameters', () => {
    const summary = OpenAICompatibleClient.buildRequest({
      provider: 'deepseek', model: 'deepseek-v4-flash', prompt: 'p', apiKey: 'k',
      taskType: 'summary', reasoningBoost: true
    }).payload;
    const advice = OpenAICompatibleClient.buildRequest({
      provider: 'deepseek', model: 'deepseek-v4-flash', prompt: 'p', apiKey: 'k',
      taskType: 'advice', reasoningBoost: true
    }).payload;
    assert.equal(summary.thinking.type, 'disabled');
    assert.equal(advice.thinking.type, 'enabled');
    assert.equal(advice.reasoning_effort, 'high');
  });

  it('disables thinking for local LLM summaries and enables it for boosted advice', () => {
    const summary = OpenAICompatibleClient.buildRequest({
      provider: 'local_llm', model: 'qwen3.5:9b', prompt: 'p', apiBaseUrl: 'http://localhost:11434/v1',
      taskType: 'summary', reasoningBoost: false
    }).payload;
    const advice = OpenAICompatibleClient.buildRequest({
      provider: 'local_llm', model: 'qwen3.5:9b', prompt: 'p', apiBaseUrl: 'http://localhost:11434/v1',
      taskType: 'advice', reasoningBoost: true
    }).payload;
    assert.equal(summary.think, false);
    assert.equal(advice.think, true);
  });

  it('does not send reasoning fields to an unsupported custom model', () => {
    const payload = OpenAICompatibleClient.buildRequest({
      provider: 'groq', model: 'custom-model', prompt: 'p', apiKey: 'k',
      taskType: 'advice', reasoningBoost: true
    }).payload;
    assert.equal('reasoning_effort' in payload, false);
    assert.equal('include_reasoning' in payload, false);
  });
});

describe('OpenAICompatibleClient errors and usage', () => {
  it('preserves HTTP status and only marks transient classes retryable', () => {
    for (const status of [429, 500, 503]) {
      const error = OpenAICompatibleClient.parseErrorBody('deepseek', { error: { message: 'temporary' } }, status);
      assert.equal(error.status, status);
      assert.equal(error.retryable, true);
    }
    for (const status of [400, 401, 402, 404, 413]) {
      const error = OpenAICompatibleClient.parseErrorBody('deepseek', { error: { message: 'not retryable' } }, status);
      assert.equal(error.status, status);
      assert.equal(error.retryable, false);
    }
  });

  it('distinguishes balance, region, and model failures', () => {
    assert.equal(OpenAICompatibleClient.classifyError({ status: 402, message: 'insufficient balance' }), 'billing');
    assert.equal(OpenAICompatibleClient.classifyError({ status: 403, message: 'region unavailable' }), 'region');
    assert.equal(OpenAICompatibleClient.classifyError({ status: 404, message: 'model not found' }), 'model');
  });

  it('uses API usage and marks character fallback as estimated', () => {
    const usage = OpenAICompatibleClient.parseUsage(
      'groq', { usage: { prompt_tokens: 12, completion_tokens: 7 } }, '', ''
    );
    assert.equal(usage.inputTokens, 12);
    assert.equal(usage.outputTokens, 7);
    assert.equal(usage.estimated, false);
    assert.equal(OpenAICompatibleClient.parseUsage('deepseek', {}, '12345', 'abc').estimated, true);
  });

  it('classifies fetch failures such as CORS as retryable network errors', async () => {
    await assert.rejects(
      OpenAICompatibleClient.call({
        provider: 'deepseek', model: 'deepseek-v4-flash', prompt: 'p', apiKey: 'k',
        fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
      }),
      error => error.category === 'network' && error.retryable === true && error.status === null
    );
  });
});

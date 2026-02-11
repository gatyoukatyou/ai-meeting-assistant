import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ProviderCatalog } = loadScript('js/lib/provider-catalog.js');

describe('ProviderCatalog.getDefaultModel', () => {
  it('returns default models for known providers', () => {
    assert.equal(ProviderCatalog.getDefaultModel('gemini'), 'gemini-2.5-flash');
    assert.equal(ProviderCatalog.getDefaultModel('openai_llm'), 'gpt-4o');
    assert.equal(ProviderCatalog.getDefaultModel('openai_stt'), 'whisper-1');
    assert.equal(
      ProviderCatalog.getDefaultModel('deepgram_realtime'),
      'nova-3-general'
    );
  });

  it('returns undefined for unknown provider', () => {
    assert.equal(ProviderCatalog.getDefaultModel('unknown'), undefined);
  });
});

describe('ProviderCatalog provider ID normalization', () => {
  it('normalizes legacy STT provider IDs', () => {
    assert.equal(ProviderCatalog.normalizeSttProviderId('openai'), 'openai_stt');
    assert.equal(ProviderCatalog.normalizeSttProviderId('gemini'), 'openai_stt');
    assert.equal(
      ProviderCatalog.normalizeSttProviderId('deepgram'),
      'deepgram_realtime'
    );
  });

  it('normalizes legacy LLM provider ID', () => {
    assert.equal(ProviderCatalog.normalizeLlmProviderId('openai'), 'openai_llm');
    assert.equal(ProviderCatalog.normalizeLlmProviderId('groq'), 'groq');
  });

  it('normalizes capability provider IDs', () => {
    assert.equal(
      ProviderCatalog.normalizeCapabilityProviderId('claude'),
      'anthropic'
    );
    assert.equal(
      ProviderCatalog.normalizeCapabilityProviderId('openai_llm'),
      'openai'
    );
    assert.equal(
      ProviderCatalog.normalizeCapabilityProviderId('gemini'),
      'gemini'
    );
  });
});

describe('ProviderCatalog storage mapping', () => {
  it('maps logical provider ID to API key storage provider ID', () => {
    assert.equal(ProviderCatalog.getApiKeyProviderId('openai_stt'), 'openai');
    assert.equal(
      ProviderCatalog.getApiKeyProviderId('deepgram_realtime'),
      'deepgram'
    );
    assert.equal(ProviderCatalog.getApiKeyProviderId('openai_llm'), 'openai_llm');
  });

  it('creates API key storage key from provider ID', () => {
    assert.equal(ProviderCatalog.getApiKeyStorageKey('openai_stt'), '_ak_openai');
    assert.equal(
      ProviderCatalog.getApiKeyStorageKey('deepgram_realtime'),
      '_ak_deepgram'
    );
  });
});

describe('ProviderCatalog provider lists', () => {
  it('returns canonical llm providers', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getLlmProviderIds()), [
      'gemini',
      'claude',
      'openai_llm',
      'groq',
    ]);
  });

  it('returns llm providers with legacy IDs when requested', () => {
    assert.deepEqual(
      Array.from(ProviderCatalog.getLlmProviderIds({ includeLegacy: true })),
      ['gemini', 'claude', 'openai_llm', 'groq', 'openai']
    );
  });

  it('returns stt providers', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getSttProviderIds()), [
      'openai_stt',
      'deepgram_realtime',
    ]);
  });

  it('returns api-key provider IDs', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getApiKeyProviderIds()), [
      'gemini',
      'claude',
      'openai_llm',
      'groq',
      'openai',
      'deepgram',
    ]);
  });

  it('returns llm provider priority order', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getLlmProviderPriority()), [
      'claude',
      'openai_llm',
      'gemini',
      'groq',
    ]);
  });
});

describe('ProviderCatalog model-registry config base', () => {
  it('exposes base config for each llm provider', () => {
    const config = ProviderCatalog.getModelRegistryProviderConfigBase();
    assert.equal(typeof config, 'object');
    assert.equal(Boolean(config.gemini), true);
    assert.equal(Boolean(config.openai_llm), true);
    assert.equal(Boolean(config.claude), true);
    assert.equal(Boolean(config.groq), true);
  });

  it('returns defensive copies', () => {
    const config1 = ProviderCatalog.getModelRegistryProviderConfigBase();
    const config2 = ProviderCatalog.getModelRegistryProviderConfigBase();
    config1.gemini.endpoint = 'https://example.invalid';
    assert.notEqual(config1.gemini.endpoint, config2.gemini.endpoint);
  });
});

describe('ProviderCatalog.normalizeGeminiModelId', () => {
  it('strips models/ prefix', () => {
    assert.equal(
      ProviderCatalog.normalizeGeminiModelId('models/gemini-2.5-flash'),
      'gemini-2.5-flash'
    );
  });

  it('returns input unchanged when no prefix is present', () => {
    assert.equal(
      ProviderCatalog.normalizeGeminiModelId('gemini-2.5-flash'),
      'gemini-2.5-flash'
    );
  });
});

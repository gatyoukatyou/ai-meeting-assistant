import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ProviderCatalog } = loadScript('js/lib/provider-catalog.js');

describe('ProviderCatalog.getDefaultModel', () => {
  it('returns default models for known providers', () => {
    assert.equal(ProviderCatalog.getDefaultModel('gemini'), 'gemini-3.6-flash');
    assert.equal(ProviderCatalog.getDefaultModel('openai_llm'), 'gpt-5.6-terra');
    assert.equal(ProviderCatalog.getDefaultModel('openai_stt'), 'gpt-4o-mini-transcribe');
    assert.equal(
      ProviderCatalog.getDefaultModel('deepgram_realtime'),
      'nova-3-general'
    );
  });

  it('returns undefined for unknown provider', () => {
    assert.equal(ProviderCatalog.getDefaultModel('unknown'), undefined);
  });
});

describe('ProviderCatalog metadata', () => {
  it('records verification, official links, reasoning policy, and pricing metadata', () => {
    assert.equal(ProviderCatalog.VERIFIED_AT, '2026-08-01');
    for (const providerId of ProviderCatalog.getLlmProviderIds()) {
      const provider = ProviderCatalog.getProvider(providerId);
      assert.equal(provider.id, providerId);
      assert.equal(provider.verifiedAt, '2026-08-01');
      assert.match(provider.docsUrl, /^https:\/\//);
      assert.equal(typeof provider.reasoningPolicy, 'object');
      // local_llm has no fixed catalog: models are discovered from the
      // user's own Ollama/LM Studio server at runtime (canListModels/
      // allowCustomModel handle that), so it has none to list up front.
      if (providerId !== 'local_llm') {
        assert.ok(ProviderCatalog.getModels(providerId).length >= 1);
      }
    }
  });

  it('keeps retired Groq presets out of normal choices but available for migration', () => {
    assert.equal(
      ProviderCatalog.getModels('groq').some(model => model.id === 'llama-3.3-70b-versatile'),
      false
    );
    const legacy = ProviderCatalog.getModel('groq', 'llama-3.3-70b-versatile');
    assert.equal(legacy.deprecated, true);
    assert.equal(legacy.replacementModel, 'openai/gpt-oss-120b');
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
      'deepseek',
      'local_llm',
    ]);
  });

  it('returns llm providers with legacy IDs when requested', () => {
    assert.deepEqual(
      Array.from(ProviderCatalog.getLlmProviderIds({ includeLegacy: true })),
      ['gemini', 'claude', 'openai_llm', 'groq', 'deepseek', 'local_llm', 'openai']
    );
  });

  it('returns stt providers', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getSttProviderIds()), [
      'openai_stt',
      'deepgram_realtime',
    ]);
  });

  it('excludes keyless local providers from api-key provider IDs', () => {
    const ids = Array.from(ProviderCatalog.getApiKeyProviderIds());
    assert.deepEqual(ids, [
      'gemini',
      'claude',
      'openai_llm',
      'groq',
      'deepseek',
      'openai',
      'deepgram',
    ]);
    assert.equal(ids.includes('local_llm'), false);
  });

  it('returns llm provider priority order', () => {
    assert.deepEqual(Array.from(ProviderCatalog.getLlmProviderPriority()), [
      'gemini',
      'openai_llm',
      'claude',
      'groq',
      'deepseek',
      'local_llm',
    ]);
  });
});

describe('ProviderCatalog local_llm (keyless)', () => {
  it('is marked as not requiring an API key', () => {
    assert.equal(ProviderCatalog.providerRequiresApiKey('local_llm'), false);
    assert.equal(ProviderCatalog.providerRequiresApiKey('groq'), true);
  });

  it('exposes loopback-only base URL presets (localhost and 127.0.0.1)', () => {
    const presets = ProviderCatalog.getBaseUrlPresets('local_llm');
    assert.deepEqual(Array.from(presets, p => p.baseUrl), [
      'http://localhost:11434/v1',
      'http://127.0.0.1:11434/v1',
      'http://localhost:1234/v1',
      'http://127.0.0.1:1234/v1'
    ]);
    for (const preset of presets) {
      assert.match(preset.baseUrl, /^http:\/\/(localhost|127\.0\.0\.1):/);
    }
  });

  it('is included in the llm provider set but reports zero fixed models', () => {
    assert.equal(ProviderCatalog.isLlmProvider('local_llm'), true);
    assert.deepEqual(Array.from(ProviderCatalog.getModels('local_llm')), []);
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
    assert.equal(Boolean(config.deepseek), true);
    assert.equal(Boolean(config.local_llm), true);
    assert.equal(config.local_llm.endpoint, null);
    assert.equal(config.local_llm.requiresApiKey, false);
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

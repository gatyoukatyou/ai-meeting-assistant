import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ModelUtils } = loadScript('js/lib/model-utils.js');

// ========================================
// getProviderDisplayName()
// ========================================

describe('getProviderDisplayName', () => {
  it('returns display name for known STT providers', () => {
    assert.equal(
      ModelUtils.getProviderDisplayName('openai_stt'),
      'OpenAI Whisper'
    );
    assert.equal(
      ModelUtils.getProviderDisplayName('deepgram_realtime'),
      'Deepgram Realtime'
    );
  });

  it('returns the raw provider string for unknown providers', () => {
    assert.equal(ModelUtils.getProviderDisplayName('custom'), 'custom');
  });
});

// ========================================
// normalizeGeminiModelId()
// ========================================

describe('normalizeGeminiModelId', () => {
  it('strips models/ prefix', () => {
    assert.equal(
      ModelUtils.normalizeGeminiModelId('models/gemini-2.0-flash'),
      'gemini-2.0-flash'
    );
  });

  it('returns model without prefix unchanged', () => {
    assert.equal(
      ModelUtils.normalizeGeminiModelId('gemini-2.0-flash'),
      'gemini-2.0-flash'
    );
  });

  it('returns falsy input unchanged', () => {
    assert.equal(ModelUtils.normalizeGeminiModelId(null), null);
    assert.equal(ModelUtils.normalizeGeminiModelId(''), '');
  });
});

// ========================================
// getDefaultModel()
// ========================================

describe('getDefaultModel', () => {
  it('returns a default model for each known provider', () => {
    for (const p of ['gemini', 'claude', 'openai', 'openai_llm', 'groq']) {
      const result = ModelUtils.getDefaultModel(p);
      assert.equal(typeof result, 'string');
      assert.ok(result.length > 0);
    }
  });

  it('returns undefined for unknown provider', () => {
    assert.equal(ModelUtils.getDefaultModel('unknown'), undefined);
  });
});

// ========================================
// isModelNotFoundOrDeprecatedError()
// ========================================

describe('isModelNotFoundOrDeprecatedError', () => {
  it('returns true for "not found" message', () => {
    assert.equal(
      ModelUtils.isModelNotFoundOrDeprecatedError({ message: 'Model not found' }),
      true
    );
  });

  it('returns true for status 404', () => {
    assert.equal(
      ModelUtils.isModelNotFoundOrDeprecatedError({ message: '', status: 404 }),
      true
    );
  });

  it('returns true for "deprecated" message', () => {
    assert.equal(
      ModelUtils.isModelNotFoundOrDeprecatedError({
        message: 'This model is deprecated'
      }),
      true
    );
  });

  it('returns false for generic error', () => {
    assert.equal(
      ModelUtils.isModelNotFoundOrDeprecatedError({
        message: 'Internal server error',
        status: 500
      }),
      false
    );
  });
});

// ========================================
// isModelDeprecatedError()
// ========================================

describe('isModelDeprecatedError', () => {
  it('returns true for decommissioned message', () => {
    assert.equal(
      ModelUtils.isModelDeprecatedError({ message: 'Model decommissioned' }),
      true
    );
  });

  it('returns false for rate limit error', () => {
    assert.equal(
      ModelUtils.isModelDeprecatedError({ message: 'Rate limit exceeded' }),
      false
    );
  });
});

// ========================================
// isRateLimitOrServerError()
// ========================================

describe('isRateLimitOrServerError', () => {
  it('returns true for status 429', () => {
    assert.equal(
      ModelUtils.isRateLimitOrServerError({ status: 429 }),
      true
    );
  });

  it('returns true for 5xx status', () => {
    assert.equal(ModelUtils.isRateLimitOrServerError({ status: 500 }), true);
    assert.equal(ModelUtils.isRateLimitOrServerError({ status: 503 }), true);
  });

  it('returns false for 4xx (non-429)', () => {
    assert.equal(ModelUtils.isRateLimitOrServerError({ status: 400 }), false);
    assert.equal(ModelUtils.isRateLimitOrServerError({ status: 404 }), false);
  });
});

// ========================================
// getAlternativeModels()
// ========================================

describe('getAlternativeModels', () => {
  it('returns alternatives excluding current model for groq', () => {
    const alts = ModelUtils.getAlternativeModels(
      'groq',
      'llama-3.3-70b-versatile'
    );
    assert.ok(Array.isArray(alts));
    assert.ok(alts.length > 0);
    assert.ok(!alts.includes('llama-3.3-70b-versatile'));
  });

  it('returns empty array for provider with no alternatives', () => {
    const alts = ModelUtils.getAlternativeModels('openai', 'gpt-4o');
    assert.ok(Array.isArray(alts));
    assert.equal(alts.length, 0);
  });
});

// ========================================
// getFallbackModel()
// ========================================

describe('getFallbackModel', () => {
  it('returns fallback model different from requested', () => {
    const fb = ModelUtils.getFallbackModel('groq', 'some-old-model');
    assert.equal(typeof fb, 'string');
    assert.notEqual(fb, 'some-old-model');
  });

  it('returns null when fallback equals requested model', () => {
    const defaultModel = ModelUtils.getDefaultModel('gemini');
    assert.equal(ModelUtils.getFallbackModel('gemini', defaultModel), null);
  });

  it('returns null for unknown provider', () => {
    assert.equal(ModelUtils.getFallbackModel('unknown', 'foo'), null);
  });
});

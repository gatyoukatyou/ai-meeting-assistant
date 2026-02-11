import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { CapabilityUtils } = loadScript('js/lib/capability-utils.js');

// ========================================
// getCapabilities()
// ========================================

describe('getCapabilities', () => {
  it('returns an object with expected keys', () => {
    const caps = CapabilityUtils.getCapabilities('anthropic', 'claude-sonnet-4');
    assert.ok('supportsReasoningControl' in caps);
    assert.ok('supportsNativeDocs' in caps);
    assert.ok('supportsVisionImages' in caps);
  });

  it('enables reasoning control for anthropic + reasoning model', () => {
    const caps = CapabilityUtils.getCapabilities(
      'anthropic',
      'claude-sonnet-4-20250514'
    );
    assert.equal(caps.supportsReasoningControl, true);
  });

  it('disables reasoning control for non-anthropic provider', () => {
    const caps = CapabilityUtils.getCapabilities(
      'openai',
      'claude-sonnet-4-20250514'
    );
    assert.equal(caps.supportsReasoningControl, false);
  });

  it('enables reasoning control for openai + o-series model', () => {
    const caps = CapabilityUtils.getCapabilities(
      'openai',
      'o3-mini'
    );
    assert.equal(caps.supportsReasoningControl, true);
  });

  it('enables reasoning control for openai + gpt-5 model', () => {
    const caps = CapabilityUtils.getCapabilities(
      'openai',
      'models/gpt-5'
    );
    assert.equal(caps.supportsReasoningControl, true);
  });

  it('disables reasoning control for openai + non-reasoning model', () => {
    const caps = CapabilityUtils.getCapabilities(
      'openai',
      'gpt-4o'
    );
    assert.equal(caps.supportsReasoningControl, false);
  });

  it('disables reasoning control for anthropic + non-reasoning model', () => {
    const caps = CapabilityUtils.getCapabilities(
      'anthropic',
      'claude-3-5-haiku-20241022'
    );
    assert.equal(caps.supportsReasoningControl, false);
  });

  it('enables native docs for gemini provider', () => {
    const caps = CapabilityUtils.getCapabilities(
      'gemini',
      'gemini-2.0-flash'
    );
    assert.equal(caps.supportsNativeDocs, true);
  });

  it('disables native docs for non-gemini provider', () => {
    const caps = CapabilityUtils.getCapabilities('anthropic', 'claude-opus-4');
    assert.equal(caps.supportsNativeDocs, false);
  });
});

// ========================================
// normalizeCapabilityProvider()
// ========================================

describe('normalizeCapabilityProvider', () => {
  it('maps claude to anthropic', () => {
    assert.equal(CapabilityUtils.normalizeCapabilityProvider('claude'), 'anthropic');
  });

  it('maps openai_llm to openai', () => {
    assert.equal(CapabilityUtils.normalizeCapabilityProvider('openai_llm'), 'openai');
  });

  it('keeps gemini unchanged', () => {
    assert.equal(CapabilityUtils.normalizeCapabilityProvider('gemini'), 'gemini');
  });

  it('returns empty string for falsy input', () => {
    assert.equal(CapabilityUtils.normalizeCapabilityProvider(''), '');
    assert.equal(CapabilityUtils.normalizeCapabilityProvider(null), '');
  });
});

// ========================================
// resolveEffectiveLlmProvider()
// ========================================

describe('resolveEffectiveLlmProvider', () => {
  it('returns priority provider when key exists', () => {
    const hasApiKey = (provider) => provider === 'gemini';
    assert.equal(
      CapabilityUtils.resolveEffectiveLlmProvider('gemini', hasApiKey),
      'gemini'
    );
  });

  it('falls back to default order when priority has no key', () => {
    const hasApiKey = (provider) => provider === 'openai_llm';
    assert.equal(
      CapabilityUtils.resolveEffectiveLlmProvider('gemini', hasApiKey),
      'openai_llm'
    );
  });

  it('uses auto order when priority is auto', () => {
    const hasApiKey = (provider) => provider === 'groq';
    assert.equal(
      CapabilityUtils.resolveEffectiveLlmProvider('auto', hasApiKey),
      'groq'
    );
  });

  it('returns null when no provider has a key', () => {
    const hasApiKey = () => false;
    assert.equal(
      CapabilityUtils.resolveEffectiveLlmProvider('auto', hasApiKey),
      null
    );
  });

  it('returns null when hasApiKey callback is missing', () => {
    assert.equal(
      CapabilityUtils.resolveEffectiveLlmProvider('auto'),
      null
    );
  });
});

// ========================================
// isReasoningCapableModel()
// ========================================

describe('isReasoningCapableModel', () => {
  it('returns true for claude-sonnet-4 variant', () => {
    assert.equal(
      CapabilityUtils.isReasoningCapableModel('claude-sonnet-4-20250514'),
      true
    );
  });

  it('returns true for claude-opus-4 variant', () => {
    assert.equal(
      CapabilityUtils.isReasoningCapableModel('claude-opus-4-20250514'),
      true
    );
  });

  it('returns true for claude-3-7-sonnet variant', () => {
    assert.equal(
      CapabilityUtils.isReasoningCapableModel('claude-3-7-sonnet-20250219'),
      true
    );
  });

  it('returns false for non-reasoning model', () => {
    assert.equal(
      CapabilityUtils.isReasoningCapableModel('claude-3-5-haiku-20241022'),
      false
    );
  });

  it('returns false for null/undefined input', () => {
    assert.equal(CapabilityUtils.isReasoningCapableModel(null), false);
    assert.equal(CapabilityUtils.isReasoningCapableModel(undefined), false);
  });

  it('returns false for empty string', () => {
    assert.equal(CapabilityUtils.isReasoningCapableModel(''), false);
  });
});

// ========================================
// isOpenAiReasoningCapableModel()
// ========================================

describe('isOpenAiReasoningCapableModel', () => {
  it('returns true for o-series model', () => {
    assert.equal(
      CapabilityUtils.isOpenAiReasoningCapableModel('o4-mini'),
      true
    );
  });

  it('returns true for gpt-5 model', () => {
    assert.equal(
      CapabilityUtils.isOpenAiReasoningCapableModel('models/gpt-5-mini'),
      true
    );
  });

  it('returns false for non-reasoning model', () => {
    assert.equal(
      CapabilityUtils.isOpenAiReasoningCapableModel('gpt-4o'),
      false
    );
  });

  it('returns false for null/undefined input', () => {
    assert.equal(CapabilityUtils.isOpenAiReasoningCapableModel(null), false);
    assert.equal(CapabilityUtils.isOpenAiReasoningCapableModel(undefined), false);
  });
});

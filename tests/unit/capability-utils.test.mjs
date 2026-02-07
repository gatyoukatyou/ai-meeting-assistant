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

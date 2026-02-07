import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { FormatUtils } = loadScript('js/lib/format-utils.js');

// ========================================
// formatCost()
// ========================================

describe('formatCost', () => {
  it('returns yen with 2 decimals for values < 1', () => {
    assert.equal(FormatUtils.formatCost(0.5), '¥0.50');
  });

  it('returns yen with 2 decimals for very small values', () => {
    assert.equal(FormatUtils.formatCost(0.01), '¥0.01');
  });

  it('rounds and returns integer yen for values >= 1', () => {
    const result = FormatUtils.formatCost(10);
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('¥'));
    assert.ok(result.includes('10'));
  });

  it('formats large values with locale separators', () => {
    const result = FormatUtils.formatCost(1234);
    assert.equal(typeof result, 'string');
    assert.ok(result.startsWith('¥'));
    // Locale-dependent: might be "1,234" or "1.234" etc.
    assert.ok(result.includes('1'));
    assert.ok(result.includes('234'));
  });
});

// ========================================
// formatNumber()
// ========================================

describe('formatNumber', () => {
  it('returns a locale string for an integer', () => {
    const result = FormatUtils.formatNumber(1000);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('1'));
    assert.ok(result.includes('000'));
  });

  it('returns "0" for zero', () => {
    assert.equal(FormatUtils.formatNumber(0), '0');
  });
});

// ========================================
// sanitizeFileName()
// ========================================

describe('sanitizeFileName', () => {
  it('returns a normal name unchanged', () => {
    assert.equal(FormatUtils.sanitizeFileName('my-meeting'), 'my-meeting');
  });

  it('strips illegal filename characters', () => {
    assert.equal(FormatUtils.sanitizeFileName('file<>:name'), 'filename');
  });

  it('returns "meeting" for empty string', () => {
    assert.equal(FormatUtils.sanitizeFileName(''), 'meeting');
  });

  it('returns "meeting" for null', () => {
    assert.equal(FormatUtils.sanitizeFileName(null), 'meeting');
  });

  it('returns "meeting" for whitespace-only after sanitization', () => {
    assert.equal(FormatUtils.sanitizeFileName('   '), 'meeting');
  });
});

// ========================================
// deepCopy()
// ========================================

describe('deepCopy', () => {
  it('deep-copies a plain object', () => {
    const original = { a: 1, b: { c: 2 } };
    const copy = FormatUtils.deepCopy(original);
    // Cross-realm structuredClone objects may fail deepStrictEqual; compare via JSON
    assert.equal(JSON.stringify(copy), JSON.stringify(original));
    assert.notEqual(copy, original);
  });

  it('deep-copies an array', () => {
    const original = [1, [2, 3]];
    const copy = FormatUtils.deepCopy(original);
    assert.equal(JSON.stringify(copy), JSON.stringify(original));
    assert.notEqual(copy, original);
  });

  it('returns null for null input', () => {
    assert.equal(FormatUtils.deepCopy(null), null);
  });

  it('returns undefined for undefined input', () => {
    assert.equal(FormatUtils.deepCopy(undefined), undefined);
  });

  it('does not affect original when copy is mutated', () => {
    const original = { x: { y: 1 } };
    const copy = FormatUtils.deepCopy(original);
    copy.x.y = 999;
    assert.equal(original.x.y, 1);
  });
});

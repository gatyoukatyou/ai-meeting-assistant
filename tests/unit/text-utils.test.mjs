import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { TextUtils } = loadScript('js/lib/text-utils.js');

// ========================================
// fixBrokenNumbers()
// ========================================

describe('fixBrokenNumbers', () => {
  it('joins single-digit comma sequences (4+ digits)', () => {
    assert.equal(TextUtils.fixBrokenNumbers('1,2,3,4'), '1234');
  });

  it('joins longer sequences', () => {
    assert.equal(TextUtils.fixBrokenNumbers('1,0,0,0,0'), '10000');
  });

  it('leaves 3-digit comma sequences unchanged (too short)', () => {
    assert.equal(TextUtils.fixBrokenNumbers('1,2,3'), '1,2,3');
  });

  it('leaves normal comma-separated numbers unchanged', () => {
    assert.equal(TextUtils.fixBrokenNumbers('1,000'), '1,000');
  });

  it('handles text with embedded broken numbers', () => {
    const result = TextUtils.fixBrokenNumbers('合計は1,2,3,4円です');
    assert.equal(result, '合計は1234円です');
  });

  it('handles text with no numbers', () => {
    assert.equal(TextUtils.fixBrokenNumbers('hello world'), 'hello world');
  });
});

// ========================================
// parseTimestampToMs()
// ========================================

describe('parseTimestampToMs', () => {
  it('parses HH:MM to milliseconds', () => {
    // 1:00 = 60 minutes = 3600 seconds = 3,600,000 ms
    assert.equal(TextUtils.parseTimestampToMs('1:00'), 3600000);
  });

  it('parses 0:30 to 30 minutes in ms', () => {
    // 0:30 = 30 minutes = 1800 seconds = 1,800,000 ms
    assert.equal(TextUtils.parseTimestampToMs('0:30'), 1800000);
  });

  it('parses 2:15 correctly', () => {
    // 2h15m = 135 minutes = 8100 seconds = 8,100,000 ms
    assert.equal(TextUtils.parseTimestampToMs('2:15'), 8100000);
  });

  it('returns 0 for falsy input', () => {
    assert.equal(TextUtils.parseTimestampToMs(null), 0);
    assert.equal(TextUtils.parseTimestampToMs(''), 0);
    assert.equal(TextUtils.parseTimestampToMs(undefined), 0);
  });

  it('returns 0 for non-HH:MM format', () => {
    assert.equal(TextUtils.parseTimestampToMs('abc'), 0);
    assert.equal(TextUtils.parseTimestampToMs('1:2:3'), 0);
  });
});

// ========================================
// extractAiInstructionFromMemoLine()
// ========================================

describe('extractAiInstructionFromMemoLine', () => {
  it('extracts instruction from 【AI】 pattern', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('【AI】要約してください'),
      '要約してください'
    );
  });

  it('extracts instruction from 【 AI 】 with spaces', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('【 AI 】 詳細を説明して'),
      '詳細を説明して'
    );
  });

  it('extracts instruction from AI: pattern', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('AI: summarize this'),
      'summarize this'
    );
  });

  it('extracts instruction from AI： (fullwidth colon)', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('AI：翻訳して'),
      '翻訳して'
    );
  });

  it('extracts instruction from @ai pattern', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('@ai explain this'),
      'explain this'
    );
  });

  it('extracts instruction from ＠ai pattern (fullwidth @)', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('＠ai まとめて'),
      'まとめて'
    );
  });

  it('extracts instruction from bullet-prefixed line', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('- 【AI】分析してください'),
      '分析してください'
    );
  });

  it('returns null for non-matching line', () => {
    assert.equal(
      TextUtils.extractAiInstructionFromMemoLine('普通のメモ行です'),
      null
    );
  });

  it('returns null for null/undefined/empty', () => {
    assert.equal(TextUtils.extractAiInstructionFromMemoLine(null), null);
    assert.equal(TextUtils.extractAiInstructionFromMemoLine(undefined), null);
    assert.equal(TextUtils.extractAiInstructionFromMemoLine(''), null);
  });

  it('returns null for whitespace-only input', () => {
    assert.equal(TextUtils.extractAiInstructionFromMemoLine('   '), null);
  });
});

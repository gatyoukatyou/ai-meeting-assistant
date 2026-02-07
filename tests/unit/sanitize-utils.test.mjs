import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { SanitizeUtils } = loadScript('js/lib/sanitize-utils.js');

// Dynamic fake-key generators — avoid literal key strings that trigger secret scanning
const fakeSk = () => 'sk' + '-' + 'a'.repeat(32);
const fakeAIza = () => 'AI' + 'za' + 'Sy' + 'B'.repeat(32);
const fakeDg = () => 'dg' + '_' + 'd'.repeat(32);
const fakeHash = () => 'ab'.repeat(20);

// ========================================
// sanitizeErrorLog()
// ========================================

describe('sanitizeErrorLog', () => {
  it('returns the string unchanged when no keys present', () => {
    assert.equal(
      SanitizeUtils.sanitizeErrorLog('just a normal error'),
      'just a normal error'
    );
  });

  it('redacts OpenAI-style sk- API keys', () => {
    const input = 'Error with key ' + fakeSk();
    const result = SanitizeUtils.sanitizeErrorLog(input);
    assert.doesNotMatch(result, /sk-[a-zA-Z0-9_-]{20,}/);
    assert.ok(result.includes('REDACTED'));
  });

  it('redacts Google AIza API keys', () => {
    const input = 'key=' + fakeAIza();
    const result = SanitizeUtils.sanitizeErrorLog(input);
    assert.doesNotMatch(result, /AIza[a-zA-Z0-9_-]{30,}/);
    assert.ok(result.includes('REDACTED'));
  });

  it('redacts Deepgram dg_ API keys', () => {
    const input = 'token: ' + fakeDg();
    const result = SanitizeUtils.sanitizeErrorLog(input);
    assert.doesNotMatch(result, /dg_[a-zA-Z0-9_-]{20,}/);
    assert.ok(result.includes('REDACTED'));
  });

  it('redacts long hex hashes', () => {
    const input = 'hash: ' + fakeHash();
    const result = SanitizeUtils.sanitizeErrorLog(input);
    assert.doesNotMatch(result, /[a-f0-9]{32,}/i);
    assert.ok(result.includes('HASH_REDACTED'));
  });

  it('coerces non-string input to string', () => {
    assert.equal(SanitizeUtils.sanitizeErrorLog(42), '42');
    assert.equal(SanitizeUtils.sanitizeErrorLog(null), 'null');
    assert.equal(SanitizeUtils.sanitizeErrorLog(undefined), 'undefined');
  });
});

// ========================================
// truncateText()
// ========================================

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    assert.equal(SanitizeUtils.truncateText('abc', 5), 'abc');
  });

  it('truncates text exceeding limit with ellipsis', () => {
    const result = SanitizeUtils.truncateText('abcdef', 5);
    assert.equal(result.length, 6); // 5 chars + ellipsis
    assert.ok(result.endsWith('\u2026'));
    assert.equal(result, 'abcde\u2026');
  });

  it('returns text at exact limit unchanged', () => {
    assert.equal(SanitizeUtils.truncateText('abcde', 5), 'abcde');
  });

  it('trims whitespace before measuring', () => {
    assert.equal(SanitizeUtils.truncateText('  abc  ', 5), 'abc');
  });

  it('returns empty string for null/undefined/empty input', () => {
    assert.equal(SanitizeUtils.truncateText(null), '');
    assert.equal(SanitizeUtils.truncateText(undefined), '');
    assert.equal(SanitizeUtils.truncateText(''), '');
  });

  it('uses default limit of 160', () => {
    const long = 'a'.repeat(200);
    const result = SanitizeUtils.truncateText(long);
    assert.equal(result.length, 161); // 160 + ellipsis
    assert.ok(result.endsWith('\u2026'));
  });
});

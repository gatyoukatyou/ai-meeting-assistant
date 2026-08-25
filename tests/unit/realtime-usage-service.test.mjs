import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScript } from '../helpers/load-script.mjs';

const { RealtimeUsageService } = loadScript('js/services/realtime-usage-service.js');

test('normalizes response.done usage and calculates an approximate mixed audio/text cost', () => {
  const usage = RealtimeUsageService.withEstimate({
    total_tokens: 1234,
    input_tokens: 700,
    output_tokens: 534,
    input_token_details: {
      text_tokens: 200,
      audio_tokens: 500,
      cached_tokens: 100,
      cached_tokens_details: {
        text_tokens: 50,
        audio_tokens: 50
      }
    },
    output_token_details: {
      text_tokens: 100,
      audio_tokens: 434
    }
  });

  assert.equal(usage.totalTokens, 1234);
  assert.equal(usage.inputTextTokens, 200);
  assert.equal(usage.inputAudioTokens, 500);
  assert.equal(usage.cachedTextTokens, 50);
  assert.equal(usage.cachedAudioTokens, 50);
  assert.equal(usage.outputTextTokens, 100);
  assert.equal(usage.outputAudioTokens, 434);
  assert.equal(usage.estimate.available, true);
  assert.equal(usage.estimate.usd, 0.045216);
  assert.equal(usage.estimate.jpy, 6.7824);
  assert.match(RealtimeUsageService.formatEstimate(usage), /約¥6\.78/);
  assert.doesNotMatch(JSON.stringify(usage), /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
});

test('reports estimate unavailable when token detail categories are missing', () => {
  const usage = RealtimeUsageService.withEstimate({
    total_tokens: 12,
    input_tokens: 8,
    output_tokens: 4
  });

  assert.equal(usage.totalTokens, 12);
  assert.equal(usage.estimate.available, false);
  assert.equal(RealtimeUsageService.formatEstimate(usage), '算出不可');
});

test('adds usage from multiple response.done events without retaining raw events', () => {
  const first = RealtimeUsageService.withEstimate({
    total_tokens: 10,
    input_tokens: 6,
    output_tokens: 4,
    input_token_details: { text_tokens: 6 },
    output_token_details: { text_tokens: 4 }
  });
  const merged = RealtimeUsageService.addUsage(first, {
    total_tokens: 7,
    input_tokens: 3,
    output_tokens: 4,
    input_token_details: { audio_tokens: 3 },
    output_token_details: { audio_tokens: 4 }
  });

  assert.equal(merged.totalTokens, 17);
  assert.equal(merged.inputTextTokens, 6);
  assert.equal(merged.inputAudioTokens, 3);
  assert.equal(merged.outputTextTokens, 4);
  assert.equal(merged.outputAudioTokens, 4);
  assert.equal('event' in merged, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScript } from '../helpers/load-script.mjs';

const { RealtimeResponseService } = loadScript('js/services/realtime-response-service.js');

test('appends an AI response while preserving the existing response structure', () => {
  const previous = {
    summary: [{ timestamp: '10:00', content: '要約' }],
    opinion: [],
    idea: [],
    consult: [],
    minutes: '議事録',
    custom: [{ q: '質問', a: '回答' }]
  };
  const next = RealtimeResponseService.appendAssistantResponse(previous, {
    text: '  日本語のRealtime回答  ',
    timestamp: '10:01',
    usage: {
      totalTokens: 20,
      inputTokens: 12,
      outputTokens: 8,
      estimate: { available: true, usd: 0.01, jpy: 1.5 }
    }
  });

  assert.notEqual(next, previous);
  assert.equal(next.minutes, '議事録');
  assert.equal(next.summary.length, 1);
  assert.equal(next.realtime.length, 1);
  assert.equal(next.realtime[0].timestamp, '10:01');
  assert.equal(next.realtime[0].content, '日本語のRealtime回答');
  assert.equal(next.realtime[0].usage.totalTokens, 20);
  assert.equal(next.realtime[0].usage.inputTokens, 12);
  assert.equal(next.realtime[0].usage.outputTokens, 8);
  assert.equal(next.realtime[0].usage.estimate.available, true);
  assert.equal(next.realtime[0].usage.estimate.usd, 0.01);
  assert.equal(next.realtime[0].usage.estimate.jpy, 1.5);
  assert.doesNotMatch(JSON.stringify(next), /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
});

test('does not append blank assistant text', () => {
  const previous = { summary: [], realtime: [] };
  const next = RealtimeResponseService.appendAssistantResponse(previous, { text: ' \n ' });

  assert.deepEqual(next, previous);
});

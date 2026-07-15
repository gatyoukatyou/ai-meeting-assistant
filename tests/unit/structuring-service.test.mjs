import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../js/services/structuring-service.js', import.meta.url),
  'utf8'
);
const context = { window: {} };
vm.runInNewContext(source, context);
const service = context.window.StructuringService;

test('StructuringService parses fenced JSON and normalizes fields', () => {
  const result = service.parseResponse(`\`\`\`json
  {
    "title": " 相談メモ ",
    "category": "相談・確認",
    "tags": ["資金", " 銀行 ", "", "1", "2", "3", "too-many"],
    "keyPoints": [" 要点1 "],
    "decisions": ["決定1"],
    "actionCandidates": ["確認する"],
    "openQuestions": ["未解決1"]
  }
  \`\`\``);

  assert.equal(result.title, '相談メモ');
  assert.equal(result.category, '相談・確認');
  assert.deepEqual(Array.from(result.tags), ['資金', '銀行', '1', '2', '3']);
  assert.deepEqual(Array.from(result.actionCandidates), ['確認する']);
});

test('StructuringService corrects invalid category and non-array fields', () => {
  const result = service.normalizeResult({ category: 'invalid', tags: 'tag', keyPoints: null });
  assert.equal(result.category, '会議・打合せ');
  assert.deepEqual(Array.from(result.tags), []);
  assert.deepEqual(Array.from(result.keyPoints), []);
});

test('StructuringService rejects malformed responses', () => {
  assert.throws(() => service.parseResponse('not json'));
  assert.throws(() => service.parseResponse('{broken'));
});

test('StructuringService builds a transcript-only prompt with optional instruction', () => {
  const prompt = service.buildPrompt(
    'T:{transcript}\nI:{additionalInstruction}',
    '会話本文',
    '要点を短く'
  );
  assert.equal(prompt, 'T:会話本文\nI:要点を短く');
});

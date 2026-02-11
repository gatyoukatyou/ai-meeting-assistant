import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ExportService } = loadScript('js/services/export-service.js');

describe('ExportService', () => {
  it('extracts ai-work-order instructions from memo lines', () => {
    const result = ExportService.collectAiWorkOrderInstructions(
      [{ id: 'm1', timestamp: '10:00', content: 'AI: summarize blockers\nmemo line' }],
      (line) => line.startsWith('AI:') ? line.replace('AI:', '').trim() : null
    );
    assert.equal(result.instructions.length, 1);
    assert.equal(result.instructions[0].text, 'summarize blockers');
    assert.equal(result.cleanedContentById.m1, 'memo line');
  });

  it('generates markdown with title and transcript', () => {
    const markdown = ExportService.generateMarkdown({
      options: { transcript: true },
      t: (key) => key,
      title: 'Weekly Sync',
      transcriptText: 'hello world',
      aiResponses: { summary: [], opinion: [], idea: [], consult: [], minutes: '', custom: [] },
      meetingMemos: { items: [] },
      costs: {
        transcript: { duration: 0, calls: 0, byProvider: { openai: 0, deepgram: 0 }, total: 0 },
        llm: { inputTokens: 0, outputTokens: 0, calls: 0, byProvider: { gemini: 0, claude: 0, openai: 0, groq: 0 }, total: 0 }
      }
    });
    assert.match(markdown, /# Weekly Sync/);
    assert.match(markdown, /hello world/);
  });
});

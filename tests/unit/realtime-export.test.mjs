import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScript } from '../helpers/load-script.mjs';

const { ExportService } = loadScript('js/services/export-service.js');

const translations = {
  'export.document.datetime': '日時:',
  'export.document.sectionAI': 'AI回答',
  'export.document.sectionCost': 'コスト詳細',
  'export.document.costStt': '文字起こし',
  'export.document.costLlm': 'LLM',
  'export.document.costProcessingTime': '処理時間',
  'export.document.costApiCalls': 'API呼び出し',
  'export.document.costSubtotal': '小計',
  'export.document.costTotal': '合計',
  'export.document.costDisclaimer': '概算',
  'export.document.sectionTranscript': '文字起こし',
  'export.document.none': '（なし）',
  'export.document.noSelection': '未選択',
  'export.items.realtime': 'Realtime音声'
};

function createContext(realtime, realtimeUsage) {
  return {
    options: {
      minutes: false,
      summary: false,
      consult: false,
      opinion: false,
      idea: false,
      memos: false,
      todos: false,
      qa: false,
      realtime,
      transcript: false,
      aiWorkOrder: false,
      cost: true
    },
    t: key => translations[key] || key,
    title: 'テスト会議',
    now: '2026/08/25 10:00',
    aiResponses: {
      summary: [],
      opinion: [],
      idea: [],
      consult: [],
      minutes: '',
      custom: [],
      realtime: realtime ? [{ timestamp: '10:01', content: 'Realtime回答' }] : []
    },
    realtimeUsage,
    transcriptText: '（なし）',
    meetingMemos: { items: [] },
    costs: {
      transcript: { duration: 0, calls: 0, byProvider: { openai: 0, deepgram: 0 }, total: 0 },
      llm: {
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
        byProvider: { gemini: 0, claude: 0, openai: 0, groq: 0, deepseek: 0 },
        total: 0
      }
    },
    formatDuration: value => `${value}秒`,
    formatCost: value => `¥${value}`,
    formatNumber: value => String(value),
    formatRealtimeUsage: () => '約¥1.50'
  };
}

test('exports Realtime AI responses and usage without adding the standard key', () => {
  const markdown = ExportService.generateMarkdown(
    createContext(true, {
      responseCount: 1,
      totalTokens: 42,
      inputTokens: 24,
      outputTokens: 18,
      estimate: {
        pricing: { model: 'gpt-realtime-2.1', sourceDate: '2026-08-25' }
      }
    })
  );

  assert.match(markdown, /Realtime音声/);
  assert.match(markdown, /Realtime回答/);
  assert.match(markdown, /合計トークン: 42/);
  assert.match(markdown, /約¥1\.50/);
  assert.doesNotMatch(markdown, /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
});

test('does not add an empty Realtime usage section before a test runs', () => {
  const markdown = ExportService.generateMarkdown(
    createContext(false, {
      responseCount: 0,
      totalTokens: 0
    })
  );

  assert.doesNotMatch(markdown, /Realtime音声/);
});

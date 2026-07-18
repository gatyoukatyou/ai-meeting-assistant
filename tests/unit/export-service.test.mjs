import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ExportService } = loadScript('js/services/export-service.js');

describe('ExportService', () => {
  it('builds the markdown export file name with the existing date format', () => {
    const fileName = ExportService.buildMarkdownFileName('Weekly Sync', {
      sanitizeFileName: (value) => value.replace(/\s+/g, '-'),
      date: new Date('2026-06-14T23:59:59.000Z')
    });

    assert.equal(fileName, 'Weekly-Sync-2026-06-14.md');
  });

  it('uses the existing meeting fallback before sanitizing export file names', () => {
    const fileName = ExportService.buildMarkdownFileName('', {
      sanitizeFileName: (value) => `safe-${value}`,
      date: new Date('2026-06-14T00:00:00.000Z')
    });

    assert.equal(fileName, 'safe-meeting-2026-06-14.md');
  });

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

  it('generates the organized record contract with YAML-safe values', () => {
    const markdown = ExportService.generateRecordMarkdown({
      id: 'conversation-20260718-001',
      title: '資金: #確認\n次の行',
      createdAt: '2026-07-18T03:30:00.000Z',
      profile: 'meeting',
      category: '相談・確認',
      tags: ['顧客: 重要', '#至急', '引用 "あり"'],
      status: 'organized',
      durationSec: 312,
      structured: {
        keyPoints: ['資金計画を確認'],
        decisions: ['来週再確認'],
        actionCandidates: ['資料を更新'],
        openQuestions: ['支払日は未定']
      },
      minutes: '議事録本文',
      transcript: '文字起こし全文'
    });

    assert.match(markdown, /^---\nid: "conversation-20260718-001"\n/);
    assert.match(markdown, /created_at: "2026-07-18T03:30:00\.000Z"/);
    assert.match(markdown, /profile: "meeting"/);
    assert.match(markdown, /category: "相談・確認"/);
    assert.match(markdown, / {2}- "顧客: 重要"\n {2}- "#至急"\n {2}- "引用 \\"あり\\""/);
    assert.match(markdown, /status: "organized"\nduration_sec: 312/);
    assert.match(markdown, /# 資金: #確認 次の行/);
    assert.match(markdown, /## 要点\n\n- 資金計画を確認/);
    assert.match(markdown, /## アクション候補\n\n以下は候補であり、確定タスクではありません。\n\n- \[ \] 資料を更新/);
    assert.match(markdown, /## 議事録\n\n議事録本文/);
    assert.match(markdown, /## 文字起こし\n\n文字起こし全文/);
  });

  it('omits organized sections for raw records while preserving the transcript', () => {
    const markdown = ExportService.generateRecordMarkdown({
      id: 'raw-1',
      title: '未整理メモ',
      createdAt: '2026-07-18T04:00:00+09:00',
      profile: 'memo',
      category: 'その他',
      tags: [],
      status: 'raw',
      durationSec: 5,
      structured: {
        keyPoints: ['出力してはいけない']
      },
      minutes: 'メモプロファイルでは出力しない',
      transcript: 'raw transcript'
    });

    assert.match(markdown, /status: "raw"/);
    assert.match(markdown, /tags: \[\]/);
    assert.doesNotMatch(markdown, /## 要点|## 決定事項|## アクション候補|## 未解決事項/);
    assert.doesNotMatch(markdown, /## 議事録/);
    assert.match(markdown, /## 文字起こし\n\nraw transcript/);
  });

  it('preserves the stored legacy export payload after the new record contract', () => {
    const markdown = ExportService.generateRecordMarkdown({
      id: 'legacy-1',
      title: '互換性確認',
      createdAt: '2026-07-18T04:00:00.000Z',
      profile: 'meeting',
      category: '会議・打合せ',
      tags: [],
      status: 'raw',
      transcript: 'new contract transcript',
      exportMarkdown: '# 旧出力\n\n## 💬 AI回答\n\nlegacy-summary-marker\n\n## 💰 コスト詳細\n\nlegacy-cost-marker\n'
    });

    assert.match(markdown, /## 文字起こし\n\nnew contract transcript/);
    assert.match(markdown, /## 保存時の詳細出力（従来形式）/);
    assert.match(markdown, /legacy-summary-marker/);
    assert.match(markdown, /legacy-cost-marker/);
  });

  it('concatenates records with a blank line before each next front matter block', () => {
    const first = {
      id: 'newer', title: 'Newer', createdAt: '2026-07-18T00:00:00Z',
      profile: 'memo', category: 'その他', tags: [], status: 'raw', transcript: 'first'
    };
    const second = {
      id: 'older', title: 'Older', createdAt: '2026-07-17T00:00:00Z',
      profile: 'memo', category: 'その他', tags: [], status: 'raw', transcript: 'second'
    };
    const markdown = ExportService.generateRecordsMarkdown([first, second]);

    assert.equal((markdown.match(/^---\nid:/gm) || []).length, 2);
    assert.match(markdown, /first\n\n---\nid: "older"/);
    assert.ok(markdown.indexOf('id: "newer"') < markdown.indexOf('id: "older"'));
  });
});

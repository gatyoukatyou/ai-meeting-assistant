import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { HistoryListService } = loadScript('js/services/history-list-service.js', {
  window: {}
});

describe('HistoryListService.formatDuration', () => {
  it('keeps the existing minute display behavior', () => {
    assert.equal(HistoryListService.formatDuration(0), '0m');
    assert.equal(HistoryListService.formatDuration(null), '0m');
    assert.equal(HistoryListService.formatDuration(Number.NaN), '0m');
    assert.equal(HistoryListService.formatDuration(1), '1m');
    assert.equal(HistoryListService.formatDuration(89), '1m');
    assert.equal(HistoryListService.formatDuration(90), '2m');
  });
});

describe('HistoryListService.prepareDisplayRecord', () => {
  it('prepares display metadata without changing existing record values', () => {
    const display = HistoryListService.prepareDisplayRecord({
      id: 'history_1',
      title: 'Planning',
      createdAt: '2026-06-14T09:00:00.000Z',
      durationSec: 125,
      summaryPreview: 'summary text'
    }, {
      getDefaultTitle: () => 'Default title',
      formatTimestamp: value => `saved:${value}`,
      truncatePreview: value => `trimmed:${value}`
    });

    assert.equal(display.id, 'history_1');
    assert.equal(display.title, 'Planning');
    assert.equal(display.savedAt, 'saved:2026-06-14T09:00:00.000Z');
    assert.equal(display.duration, '2m');
    assert.equal(display.category, '会議・打合せ');
    assert.equal(display.status, 'raw');
    assert.deepEqual(Array.from(display.tags), []);
    assert.equal(display.hasSummaryPreview, true);
    assert.equal(display.summaryPreview, 'trimmed:summary text');
  });

  it('uses the same fallback title date shape as renderHistoryList', () => {
    let fallbackDate;
    const display = HistoryListService.prepareDisplayRecord({
      createdAt: '2026-06-14T09:00:00.000Z',
      durationSec: 0
    }, {
      getDefaultTitle: date => {
        fallbackDate = date;
        return 'Default meeting';
      }
    });

    assert.equal(display.title, 'Default meeting');
    assert.equal(typeof fallbackDate.toISOString, 'function');
    assert.equal(fallbackDate.toISOString(), '2026-06-14T09:00:00.000Z');
  });

  it('preserves summary preview presence separately from truncated text', () => {
    const display = HistoryListService.prepareDisplayRecord({
      summaryPreview: '   '
    }, {
      truncatePreview: () => ''
    });

    assert.equal(display.hasSummaryPreview, true);
    assert.equal(display.summaryPreview, '');
  });
});

describe('HistoryListService.filterRecords', () => {
  const records = [
    {
      id: 'new',
      title: 'Budget Review',
      createdAt: '2026-07-18T09:00:00.000Z',
      category: '会議・打合せ',
      tags: ['Finance'],
      status: 'organized',
      transcript: 'revenue discussion',
      structured: { decisions: ['Approve the plan'] }
    },
    {
      id: 'old',
      title: '相談',
      createdAt: '2026-07-10T09:00:00.000Z',
      category: '相談・確認',
      tags: ['顧客'],
      status: 'raw',
      transcript: '更新契約について確認',
      structured: null
    }
  ];

  it('combines category, status, and date filters with AND', () => {
    const result = HistoryListService.filterRecords(records, {
      category: '会議・打合せ',
      status: 'organized',
      startDate: '2026-07-18',
      endDate: '2026-07-18'
    });
    assert.deepEqual(Array.from(result, record => record.id), ['new']);
  });

  it('searches title, tags, transcript, and structured fields case-insensitively', () => {
    assert.equal(HistoryListService.filterRecords(records, { query: 'BUDGET' })[0].id, 'new');
    assert.equal(HistoryListService.filterRecords(records, { query: 'finance' })[0].id, 'new');
    assert.equal(HistoryListService.filterRecords(records, { query: '更新契約' })[0].id, 'old');
    assert.equal(HistoryListService.filterRecords(records, { query: 'approve' })[0].id, 'new');
  });

  it('sorts results newest first without mutating the input', () => {
    const input = [records[1], records[0]];
    const result = HistoryListService.filterRecords(input);
    assert.deepEqual(Array.from(result, record => record.id), ['new', 'old']);
    assert.deepEqual(input.map(record => record.id), ['old', 'new']);
  });
});

describe('HistoryListService.prepareDetailRecord', () => {
  it('normalizes structured sections and keeps minutes before transcript data', () => {
    const detail = HistoryListService.prepareDetailRecord({
      id: 'detail',
      status: 'organized',
      tags: ['one'],
      structured: {
        keyPoints: ['point'],
        decisions: ['decision'],
        actionCandidates: ['candidate'],
        openQuestions: ['question']
      },
      minutes: 'minutes text',
      transcript: 'transcript text'
    });

    assert.deepEqual(Array.from(detail.structured.keyPoints), ['point']);
    assert.equal(detail.minutes, 'minutes text');
    assert.equal(detail.transcript, 'transcript text');
  });
});

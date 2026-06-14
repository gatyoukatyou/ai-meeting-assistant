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

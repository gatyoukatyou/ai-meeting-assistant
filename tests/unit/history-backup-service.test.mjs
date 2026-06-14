import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { HistoryBackupService } = loadScript('js/services/history-backup-service.js', {
  window: {}
});

describe('HistoryBackupService.parseRecords', () => {
  it('parses array backup files and sorts records by createdAt ascending', () => {
    const records = HistoryBackupService.parseRecords(JSON.stringify([
      { id: 'newer', createdAt: '2026-06-14T10:00:00.000Z', updatedAt: '2026-06-14T10:00:00.000Z' },
      { id: 'older', createdAt: '2026-06-13T10:00:00.000Z', updatedAt: '2026-06-13T10:00:00.000Z' }
    ]));

    assert.deepEqual(Array.from(records, record => record.id), ['older', 'newer']);
  });

  it('parses wrapped backup files with a records array', () => {
    const records = HistoryBackupService.parseRecords(JSON.stringify({
      schemaVersion: 1,
      records: [
        { id: 'history_1', createdAt: '2026-06-14T10:00:00.000Z', updatedAt: '2026-06-14T10:00:00.000Z' }
      ]
    }));

    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'history_1');
  });

  it('normalizes missing id and invalid timestamps without changing valid fields', () => {
    const records = HistoryBackupService.parseRecords(JSON.stringify([
      { title: 'Imported', createdAt: 'bad-date', updatedAt: '' }
    ]), {
      nowIso: '2026-06-14T12:00:00.000Z',
      createId: index => `test_id_${index}`
    });

    assert.equal(records[0].id, 'test_id_0');
    assert.equal(records[0].title, 'Imported');
    assert.equal(records[0].createdAt, '2026-06-14T12:00:00.000Z');
    assert.equal(records[0].updatedAt, '2026-06-14T12:00:00.000Z');
  });

  it('filters non-object entries', () => {
    const records = HistoryBackupService.parseRecords(JSON.stringify([
      null,
      'bad',
      { id: 'valid', createdAt: '2026-06-14T10:00:00.000Z', updatedAt: '2026-06-14T10:00:00.000Z' }
    ]));

    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'valid');
  });

  it('throws caller supplied invalid format messages', () => {
    assert.throws(
      () => HistoryBackupService.parseRecords('{', { invalidFormatMessage: 'localized invalid' }),
      /localized invalid/
    );
    assert.throws(
      () => HistoryBackupService.parseRecords('{"notRecords":[]}', { invalidFormatMessage: 'localized invalid' }),
      /localized invalid/
    );
  });
});

describe('HistoryBackupService.buildBackupPayload', () => {
  it('builds the existing backup envelope and deep copies records', () => {
    const source = [{ id: 'history_1', nested: { value: 'original' } }];
    const payload = HistoryBackupService.buildBackupPayload(source, {
      exportedAt: '2026-06-14T12:34:00.000Z'
    });

    source[0].nested.value = 'changed';

    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.exportedAt, '2026-06-14T12:34:00.000Z');
    assert.equal(payload.app, 'ai-meeting-assistant');
    assert.equal(payload.recordCount, 1);
    assert.equal(payload.records[0].nested.value, 'original');
  });
});

describe('HistoryBackupService.hasImportableRecords', () => {
  it('returns true only for non-empty record arrays', () => {
    assert.equal(HistoryBackupService.hasImportableRecords([{ id: 'history_1' }]), true);
    assert.equal(HistoryBackupService.hasImportableRecords([]), false);
    assert.equal(HistoryBackupService.hasImportableRecords(null), false);
    assert.equal(HistoryBackupService.hasImportableRecords({ records: [{ id: 'history_1' }] }), false);
  });
});

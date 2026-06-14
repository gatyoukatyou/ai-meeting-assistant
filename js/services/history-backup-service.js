const HistoryBackupService = (function() {
  'use strict';

  const DEFAULT_INVALID_FORMAT_MESSAGE = 'Invalid history backup format';

  function deepCopy(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function createImportedRecordId(index) {
    return `history_import_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeRecord(record, index, options = {}) {
    const nowIso = options.nowIso || new Date().toISOString();
    const normalized = deepCopy(record || {});

    if (!normalized.id || typeof normalized.id !== 'string') {
      const createId = typeof options.createId === 'function' ? options.createId : createImportedRecordId;
      normalized.id = createId(index);
    }
    if (!normalized.createdAt || Number.isNaN(new Date(normalized.createdAt).getTime())) {
      normalized.createdAt = nowIso;
    }
    if (!normalized.updatedAt || Number.isNaN(new Date(normalized.updatedAt).getTime())) {
      normalized.updatedAt = nowIso;
    }
    return normalized;
  }

  function parseRecords(rawJson, options = {}) {
    const invalidFormatMessage = options.invalidFormatMessage || DEFAULT_INVALID_FORMAT_MESSAGE;
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      throw new Error(invalidFormatMessage);
    }

    const records = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.records) ? parsed.records : null);

    if (!records) {
      throw new Error(invalidFormatMessage);
    }

    return records
      .filter(record => record && typeof record === 'object')
      .map((record, index) => normalizeRecord(record, index, options))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  function buildBackupPayload(records, options = {}) {
    const sourceRecords = Array.isArray(records) ? records : [];
    return {
      schemaVersion: 1,
      exportedAt: options.exportedAt || new Date().toISOString(),
      app: 'ai-meeting-assistant',
      recordCount: sourceRecords.length,
      records: sourceRecords.map(record => deepCopy(record))
    };
  }

  function hasImportableRecords(records) {
    return Array.isArray(records) && records.length > 0;
  }

  return {
    normalizeRecord,
    parseRecords,
    buildBackupPayload,
    hasImportableRecords
  };
})();

if (typeof window !== 'undefined') {
  window.HistoryBackupService = HistoryBackupService;
}

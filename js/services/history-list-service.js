const HistoryListService = (function() {
  'use strict';

  const CATEGORIES = ['会議・打合せ', '相談・確認', '指示・依頼', 'アイデア', 'その他'];

  function normalizeSearchText(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function flattenStructured(structured) {
    if (!structured || typeof structured !== 'object') return '';
    return Object.values(structured)
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .filter(value => value !== null && value !== undefined)
      .join('\n');
  }

  function getLocalDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function filterRecords(records, filters = {}) {
    const category = CATEGORIES.includes(filters.category) ? filters.category : '';
    const status = filters.status === 'raw' || filters.status === 'organized' ? filters.status : '';
    const startDate = String(filters.startDate || '');
    const endDate = String(filters.endDate || '');
    const query = normalizeSearchText(filters.query);

    return (Array.isArray(records) ? records : [])
      .filter(record => {
        const source = record || {};
        if (category && source.category !== category) return false;
        if (status && source.status !== status) return false;

        const dateKey = getLocalDateKey(source.createdAt);
        if (startDate && (!dateKey || dateKey < startDate)) return false;
        if (endDate && (!dateKey || dateKey > endDate)) return false;

        if (query) {
          const searchable = normalizeSearchText([
            source.title,
            ...(Array.isArray(source.tags) ? source.tags : []),
            source.transcript,
            flattenStructured(source.structured)
          ].join('\n'));
          if (!searchable.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a?.createdAt || 0).getTime() || 0;
        const bTime = new Date(b?.createdAt || 0).getTime() || 0;
        return bTime - aTime;
      });
  }

  function formatDuration(seconds) {
    if (!seconds || Number.isNaN(seconds)) return '0m';
    const mins = Math.max(1, Math.round(seconds / 60));
    return `${mins}m`;
  }

  function prepareDisplayRecord(record, options = {}) {
    const source = record || {};
    const getDefaultTitle = typeof options.getDefaultTitle === 'function'
      ? options.getDefaultTitle
      : function() { return ''; };
    const formatTimestamp = typeof options.formatTimestamp === 'function'
      ? options.formatTimestamp
      : function() { return ''; };
    const truncatePreview = typeof options.truncatePreview === 'function'
      ? options.truncatePreview
      : function(value) { return value || ''; };

    const titleDate = source.createdAt ? new Date(source.createdAt) : undefined;
    const hasSummaryPreview = Boolean(source.summaryPreview);

    return {
      id: source.id || '',
      title: source.title || getDefaultTitle(titleDate),
      savedAt: formatTimestamp(source.createdAt),
      duration: formatDuration(source.durationSec),
      category: CATEGORIES.includes(source.category) ? source.category : CATEGORIES[0],
      tags: Array.isArray(source.tags) ? source.tags.filter(tag => typeof tag === 'string' && tag.trim()) : [],
      status: source.status === 'organized' ? 'organized' : 'raw',
      hasSummaryPreview,
      summaryPreview: hasSummaryPreview ? truncatePreview(source.summaryPreview) : ''
    };
  }

  function prepareDetailRecord(record, options = {}) {
    const source = record || {};
    const display = prepareDisplayRecord(source, options);
    const structured = source.structured && typeof source.structured === 'object'
      ? source.structured
      : null;
    const normalizeList = value => Array.isArray(value)
      ? value.filter(item => typeof item === 'string' && item.trim())
      : [];

    return {
      ...display,
      structured: structured ? {
        keyPoints: normalizeList(structured.keyPoints),
        decisions: normalizeList(structured.decisions),
        actionCandidates: normalizeList(structured.actionCandidates),
        openQuestions: normalizeList(structured.openQuestions)
      } : null,
      minutes: typeof source.minutes === 'string'
        ? source.minutes
        : (typeof source.aiResponses?.minutes === 'string' ? source.aiResponses.minutes : ''),
      transcript: typeof source.transcript === 'string' ? source.transcript : ''
    };
  }

  return {
    CATEGORIES,
    formatDuration,
    filterRecords,
    prepareDisplayRecord,
    prepareDetailRecord
  };
})();

if (typeof window !== 'undefined') {
  window.HistoryListService = HistoryListService;
}

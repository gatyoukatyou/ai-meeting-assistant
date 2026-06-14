const HistoryListService = (function() {
  'use strict';

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
      hasSummaryPreview,
      summaryPreview: hasSummaryPreview ? truncatePreview(source.summaryPreview) : ''
    };
  }

  return {
    formatDuration,
    prepareDisplayRecord
  };
})();

if (typeof window !== 'undefined') {
  window.HistoryListService = HistoryListService;
}

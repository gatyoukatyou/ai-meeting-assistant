const ActiveMeetingDraftService = (function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const EMPTY_AI_RESPONSES = { summary: [], opinion: [], idea: [], consult: [], minutes: '', custom: [] };

  const FORBIDDEN_KEY_PATTERN = /api.?key|apikey|authorization|auth.?token|(^|[_-])token($|[_-])|bearer|secret|password|credential/i;

  function deepCopy(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function stripSensitiveKeys(value) {
    if (Array.isArray(value)) {
      return value.map(stripSensitiveKeys);
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    const sanitized = {};
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) return;
      sanitized[key] = stripSensitiveKeys(value[key]);
    });
    return sanitized;
  }

  function normalizeAiResponses(aiResponses) {
    const source = aiResponses || {};
    return {
      summary: Array.isArray(source.summary) ? source.summary : [],
      opinion: Array.isArray(source.opinion) ? source.opinion : [],
      idea: Array.isArray(source.idea) ? source.idea : [],
      consult: Array.isArray(source.consult) ? source.consult : [],
      minutes: typeof source.minutes === 'string' ? source.minutes : '',
      custom: Array.isArray(source.custom) ? source.custom : []
    };
  }

  function hasRecoverableContent(draft) {
    if (!draft) return false;
    if (Array.isArray(draft.transcriptChunks) && draft.transcriptChunks.length > 0) return true;
    if (draft.fullTranscript && String(draft.fullTranscript).trim()) return true;

    const ai = normalizeAiResponses(draft.aiResponses);
    if (
      ai.summary.length > 0 ||
      ai.opinion.length > 0 ||
      ai.idea.length > 0 ||
      ai.consult.length > 0 ||
      ai.minutes.trim() ||
      ai.custom.length > 0
    ) {
      return true;
    }

    return Boolean(
      draft.meetingMemos &&
      Array.isArray(draft.meetingMemos.items) &&
      draft.meetingMemos.items.length > 0
    );
  }

  function buildDraft(input) {
    const source = input || {};
    const now = source.now || new Date().toISOString();
    const sessionId = source.sessionId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = source.startedAt || now;

    const draft = {
      schemaVersion: SCHEMA_VERSION,
      sessionId,
      id: sessionId,
      status: source.status || 'active',
      finalized: Boolean(source.finalized),
      startedAt,
      updatedAt: now,
      title: source.title || '',
      fullTranscript: source.fullTranscript || '',
      transcriptChunks: deepCopy(source.transcriptChunks || []),
      meetingStartMarkerId: source.meetingStartMarkerId || null,
      chunkIdCounter: Number.isFinite(source.chunkIdCounter) ? source.chunkIdCounter : 0,
      aiResponses: normalizeAiResponses(deepCopy(source.aiResponses || EMPTY_AI_RESPONSES)),
      costs: deepCopy(source.costs || null),
      meetingMemos: {
        items: deepCopy((source.meetingMemos && source.meetingMemos.items) || [])
      },
      memoIdCounter: Number.isFinite(source.memoIdCounter) ? source.memoIdCounter : 0,
      settings: stripSensitiveKeys(deepCopy(source.settings || {}))
    };

    return stripSensitiveKeys(draft);
  }

  function normalizeDraftForRestore(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const normalized = buildDraft({
      sessionId: draft.sessionId || draft.id,
      status: draft.status || 'active',
      finalized: draft.finalized,
      startedAt: draft.startedAt,
      now: draft.updatedAt || new Date().toISOString(),
      title: draft.title || '',
      fullTranscript: draft.fullTranscript || '',
      transcriptChunks: Array.isArray(draft.transcriptChunks) ? draft.transcriptChunks : [],
      meetingStartMarkerId: draft.meetingStartMarkerId || null,
      chunkIdCounter: Number.isFinite(draft.chunkIdCounter) ? draft.chunkIdCounter : 0,
      aiResponses: draft.aiResponses || EMPTY_AI_RESPONSES,
      costs: draft.costs || null,
      meetingMemos: draft.meetingMemos || { items: [] },
      memoIdCounter: Number.isFinite(draft.memoIdCounter) ? draft.memoIdCounter : 0,
      settings: draft.settings || {}
    });
    normalized.updatedAt = draft.updatedAt || normalized.updatedAt;
    return normalized;
  }

  return {
    SCHEMA_VERSION,
    buildDraft,
    normalizeDraftForRestore,
    hasRecoverableContent,
    stripSensitiveKeys
  };
})();

if (typeof window !== 'undefined') {
  window.ActiveMeetingDraftService = ActiveMeetingDraftService;
}

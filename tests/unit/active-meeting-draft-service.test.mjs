import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { ActiveMeetingDraftService } = loadScript('js/services/active-meeting-draft-service.js');

describe('ActiveMeetingDraftService', () => {
  it('builds a restorable draft without API keys or credentials', () => {
    const draft = ActiveMeetingDraftService.buildDraft({
      sessionId: 'draft_1',
      title: 'Weekly sync',
      transcriptChunks: [{ id: 'chunk_1', timestamp: '10:00', text: 'hello' }],
      aiResponses: { summary: [{ content: 'summary' }] },
      meetingMemos: { items: [{ id: 'memo_1', content: 'note' }] },
      settings: {
        sttProvider: 'openai_stt',
        openaiApiKey: 'sk-secret',
        anthropicApiKey: 'anthropic-secret',
        geminiApiKey: 'gemini-secret',
        deepgramApiKey: 'deepgram-secret',
        'x-goog-api-key': 'google-secret',
        bearer: 'bearer-secret',
        token: 'token-secret',
        password: 'password-secret',
        credential: 'credential-secret',
        nested: {
          authorization: 'Bearer secret',
          authToken: 'auth-token-secret',
          access_token: 'access-token-secret',
          inputTokens: 123,
          model: 'whisper-1'
        }
      }
    });

    const serialized = JSON.stringify(draft);
    assert.equal(draft.sessionId, 'draft_1');
    assert.match(serialized, /openai_stt/);
    assert.match(serialized, /whisper-1/);
    assert.match(serialized, /inputTokens/);
    assert.doesNotMatch(serialized, /sk-secret/);
    assert.doesNotMatch(serialized, /Bearer secret/);
    [
      'openaiApiKey',
      'anthropicApiKey',
      'geminiApiKey',
      'deepgramApiKey',
      'x-goog-api-key',
      'bearer',
      'token',
      'password',
      'credential',
      'authorization',
      'authToken',
      'access_token',
      'anthropic-secret',
      'gemini-secret',
      'deepgram-secret',
      'google-secret',
      'bearer-secret',
      'token-secret',
      'password-secret',
      'credential-secret',
      'auth-token-secret',
      'access-token-secret'
    ].forEach((secretText) => {
      assert.doesNotMatch(serialized, new RegExp(secretText));
    });
  });

  it('detects recoverable draft content across transcript, memo, and AI response data', () => {
    assert.equal(ActiveMeetingDraftService.hasRecoverableContent({ transcriptChunks: [] }), false);
    assert.equal(ActiveMeetingDraftService.hasRecoverableContent({ transcriptChunks: [{ text: 'hello' }] }), true);
    assert.equal(ActiveMeetingDraftService.hasRecoverableContent({ meetingMemos: { items: [{ content: 'memo' }] } }), true);
    assert.equal(ActiveMeetingDraftService.hasRecoverableContent({ aiResponses: { minutes: 'minutes' } }), true);
  });

  it('normalizes legacy or partial draft payloads for restore', () => {
    const draft = ActiveMeetingDraftService.normalizeDraftForRestore({
      id: 'legacy_draft',
      aiResponses: { custom: [{ q: 'q', a: 'a' }] }
    });

    assert.equal(draft.sessionId, 'legacy_draft');
    assert.equal(draft.aiResponses.summary.length, 0);
    assert.equal(draft.aiResponses.custom.length, 1);
    assert.equal(draft.aiResponses.custom[0].q, 'q');
    assert.equal(draft.aiResponses.custom[0].a, 'a');
    assert.equal(draft.meetingMemos.items.length, 0);
  });
});

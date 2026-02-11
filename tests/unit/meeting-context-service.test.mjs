import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

const { MeetingContextService } = loadScript('js/services/meeting-context-service.js');

describe('MeetingContextService', () => {
  it('creates empty meeting context with schema version', () => {
    const context = MeetingContextService.createEmptyMeetingContext(3);
    assert.equal(context.schemaVersion, 3);
    assert.equal(context.goal, '');
    assert.deepEqual(Array.from(context.files), []);
  });

  it('detects text-based context', () => {
    assert.equal(
      MeetingContextService.hasMeetingContext({
        goal: 'Kickoff agenda',
        files: []
      }),
      true
    );
  });

  it('builds prompt block when context exists', () => {
    const prompt = MeetingContextService.buildContextPrompt(
      {
        goal: 'Define milestones',
        participants: 'PM, Eng',
        handoff: '',
        reference: '',
        files: []
      },
      { budget: 8000, enhancedEnabled: false }
    );
    assert.match(prompt, /\[MEETING_CONTEXT\]/);
    assert.match(prompt, /Goal:/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function loadService(consoleOverride = console) {
  return loadScript('js/services/recorder-lifecycle-service.js', {
    console: consoleOverride
  }).RecorderLifecycleService;
}

describe('RecorderLifecycleService', () => {
  it('moves through recording, pause, resume, and stop states', () => {
    const service = loadService();
    const lifecycle = service.create();

    assert.equal(lifecycle.getState(), service.STATES.IDLE);
    assert.equal(lifecycle.transition(service.EVENTS.PREPARE), true);
    assert.equal(lifecycle.getState(), service.STATES.PREPARING);
    assert.equal(lifecycle.transition(service.EVENTS.START), true);
    assert.equal(lifecycle.getState(), service.STATES.RECORDING);
    assert.equal(lifecycle.transition(service.EVENTS.PAUSE), true);
    assert.equal(lifecycle.getState(), service.STATES.PAUSED);
    assert.equal(lifecycle.transition(service.EVENTS.RESUME), true);
    assert.equal(lifecycle.getState(), service.STATES.RECORDING);
    assert.equal(lifecycle.transition(service.EVENTS.STOP), true);
    assert.equal(lifecycle.getState(), service.STATES.STOPPING);
    assert.equal(lifecycle.transition(service.EVENTS.FINISH), true);
    assert.equal(lifecycle.getState(), service.STATES.IDLE);
  });

  it('defines the suspended and resuming path for the next implementation phase', () => {
    const service = loadService();
    const lifecycle = service.create();

    lifecycle.transition(service.EVENTS.PREPARE);
    lifecycle.transition(service.EVENTS.START);
    lifecycle.transition(service.EVENTS.SUSPEND);
    assert.equal(lifecycle.getState(), service.STATES.SUSPENDED);

    lifecycle.transition(service.EVENTS.RESUME);
    assert.equal(lifecycle.getState(), service.STATES.RESUMING);

    lifecycle.transition(service.EVENTS.RESUME_COMPLETE);
    assert.equal(lifecycle.getState(), service.STATES.RECORDING);
  });

  it('can return from resuming to suspended when recovery is interrupted', () => {
    const service = loadService();
    const lifecycle = service.create();

    lifecycle.transition(service.EVENTS.PREPARE);
    lifecycle.transition(service.EVENTS.START);
    lifecycle.transition(service.EVENTS.SUSPEND);
    lifecycle.transition(service.EVENTS.RESUME);
    lifecycle.transition(service.EVENTS.SUSPEND);

    assert.equal(lifecycle.getState(), service.STATES.SUSPENDED);
  });

  it('can cancel preparation without entering a recording state', () => {
    const service = loadService();
    const lifecycle = service.create();

    lifecycle.transition(service.EVENTS.PREPARE);
    assert.equal(lifecycle.transition(service.EVENTS.CANCEL), true);
    assert.equal(lifecycle.getState(), service.STATES.IDLE);
  });

  it('derives legacy recording flags from the lifecycle state', () => {
    const service = loadService();
    const lifecycle = service.create();

    assert.equal(lifecycle.isRecording(), false);
    assert.equal(lifecycle.isPaused(), false);
    assert.equal(lifecycle.isStopping(), false);

    lifecycle.transition(service.EVENTS.PREPARE);
    lifecycle.transition(service.EVENTS.START);
    assert.equal(lifecycle.isRecording(), true);

    lifecycle.transition(service.EVENTS.PAUSE);
    assert.equal(lifecycle.isRecording(), true);
    assert.equal(lifecycle.isPaused(), true);

    lifecycle.transition(service.EVENTS.STOP);
    assert.equal(lifecycle.isRecording(), false);
    assert.equal(lifecycle.isPaused(), false);
    assert.equal(lifecycle.isStopping(), true);
  });

  it('notifies listeners after a valid state change and supports unsubscribe', () => {
    const service = loadService();
    const lifecycle = service.create();
    const notifications = [];
    const unsubscribe = lifecycle.onStateChange((nextState, previousState, event) => {
      notifications.push({ nextState, previousState, event });
    });

    lifecycle.transition(service.EVENTS.PREPARE);
    unsubscribe();
    lifecycle.transition(service.EVENTS.START);

    assert.deepEqual(notifications, [
      {
        nextState: service.STATES.PREPARING,
        previousState: service.STATES.IDLE,
        event: service.EVENTS.PREPARE
      }
    ]);
  });

  it('warns and rejects an invalid transition without changing state', () => {
    const warnings = [];
    const service = loadService({
      warn(message) {
        warnings.push(message);
      }
    });
    const lifecycle = service.create();

    assert.equal(lifecycle.transition(service.EVENTS.SUSPEND), false);
    assert.equal(lifecycle.getState(), service.STATES.IDLE);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Rejected transition/);
  });

  it('reports a live, unmuted microphone pipeline as healthy', () => {
    const service = loadService();

    const result = service.evaluatePipelineHealth({
      tracks: [{ readyState: 'live', muted: false }],
      audioContextState: 'running'
    });

    assert.equal(result.healthy, true);
    assert.deepEqual([...result.reasons], []);
  });

  it('reports missing, ended, muted, and suspended pipeline signals', () => {
    const service = loadService();

    assert.deepEqual([...service.evaluatePipelineHealth().reasons], ['missing_audio_track']);
    assert.deepEqual(
      [
        ...service.evaluatePipelineHealth({
          tracks: [{ readyState: 'ended', muted: true }],
          audioContextState: 'suspended'
        }).reasons
      ],
      ['audio_track_ended', 'audio_track_muted', 'audio_context_suspended']
    );
  });

  it('suspends only for confirmed interruption reasons', () => {
    const service = loadService();

    assert.equal(service.shouldSuspendForInterruption('stream_ended'), true);
    assert.equal(
      service.shouldSuspendForInterruption('audiocontext_suspended', {
        audioContextResumed: false
      }),
      true
    );
    assert.equal(
      service.shouldSuspendForInterruption('audiocontext_suspended', {
        audioContextResumed: true
      }),
      false
    );
    assert.equal(service.shouldSuspendForInterruption('background'), false);
    assert.equal(service.shouldSuspendForInterruption('page_frozen'), false);
  });
});

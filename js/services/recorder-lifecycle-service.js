const RecorderLifecycleService = (function () {
  'use strict';

  const STATES = Object.freeze({
    IDLE: 'idle',
    PREPARING: 'preparing',
    RECORDING: 'recording',
    PAUSED: 'paused',
    SUSPENDED: 'suspended',
    RESUMING: 'resuming',
    STOPPING: 'stopping'
  });

  const EVENTS = Object.freeze({
    PREPARE: 'prepare',
    START: 'start',
    PAUSE: 'pause',
    RESUME: 'resume',
    SUSPEND: 'suspend',
    RESUME_COMPLETE: 'resume_complete',
    STOP: 'stop',
    FINISH: 'finish',
    CANCEL: 'cancel'
  });

  const TRANSITIONS = Object.freeze({
    [STATES.IDLE]: Object.freeze({
      [EVENTS.PREPARE]: STATES.PREPARING
    }),
    [STATES.PREPARING]: Object.freeze({
      [EVENTS.START]: STATES.RECORDING,
      [EVENTS.STOP]: STATES.STOPPING,
      [EVENTS.CANCEL]: STATES.IDLE
    }),
    [STATES.RECORDING]: Object.freeze({
      [EVENTS.PAUSE]: STATES.PAUSED,
      [EVENTS.SUSPEND]: STATES.SUSPENDED,
      [EVENTS.STOP]: STATES.STOPPING
    }),
    [STATES.PAUSED]: Object.freeze({
      [EVENTS.RESUME]: STATES.RECORDING,
      [EVENTS.SUSPEND]: STATES.SUSPENDED,
      [EVENTS.STOP]: STATES.STOPPING
    }),
    [STATES.SUSPENDED]: Object.freeze({
      [EVENTS.RESUME]: STATES.RESUMING,
      [EVENTS.STOP]: STATES.STOPPING
    }),
    [STATES.RESUMING]: Object.freeze({
      [EVENTS.RESUME_COMPLETE]: STATES.RECORDING,
      [EVENTS.SUSPEND]: STATES.SUSPENDED,
      [EVENTS.STOP]: STATES.STOPPING
    }),
    [STATES.STOPPING]: Object.freeze({
      [EVENTS.FINISH]: STATES.IDLE
    })
  });

  const ACTIVE_RECORDING_STATES = new Set([
    STATES.RECORDING,
    STATES.PAUSED,
    STATES.SUSPENDED,
    STATES.RESUMING
  ]);

  function evaluatePipelineHealth({ tracks = [], audioContextState = null } = {}) {
    const reasons = [];
    if (!Array.isArray(tracks) || tracks.length === 0) {
      reasons.push('missing_audio_track');
    } else {
      if (tracks.some(track => track?.readyState !== 'live')) {
        reasons.push('audio_track_ended');
      }
      if (tracks.some(track => track?.muted === true)) {
        reasons.push('audio_track_muted');
      }
    }

    if (['suspended', 'interrupted', 'closed'].includes(audioContextState)) {
      reasons.push(`audio_context_${audioContextState}`);
    }

    return Object.freeze({
      healthy: reasons.length === 0,
      reasons: Object.freeze(reasons)
    });
  }

  function shouldSuspendForInterruption(reason, { audioContextResumed = false } = {}) {
    if (reason === 'stream_ended') return true;
    if (reason === 'audiocontext_suspended') return audioContextResumed !== true;
    return false;
  }

  function create() {
    let state = STATES.IDLE;
    const listeners = new Set();

    function getState() {
      return state;
    }

    function transition(event) {
      const previousState = state;
      const nextState = TRANSITIONS[previousState]?.[event];
      if (!nextState) {
        console.warn(`[RecorderLifecycle] Rejected transition: ${previousState} --${event}--> ?`);
        return false;
      }

      state = nextState;
      listeners.forEach(listener => listener(nextState, previousState, event));
      return true;
    }

    function onStateChange(callback) {
      if (typeof callback !== 'function') {
        console.warn('[RecorderLifecycle] State change listener must be a function');
        return function () {};
      }
      listeners.add(callback);
      return function unsubscribe() {
        listeners.delete(callback);
      };
    }

    function isRecording() {
      return ACTIVE_RECORDING_STATES.has(state);
    }

    function isPaused() {
      return state === STATES.PAUSED;
    }

    function isStopping() {
      return state === STATES.STOPPING;
    }

    return Object.freeze({
      getState,
      transition,
      onStateChange,
      isRecording,
      isPaused,
      isStopping
    });
  }

  return Object.freeze({
    STATES,
    EVENTS,
    evaluatePipelineHealth,
    shouldSuspendForInterruption,
    create
  });
})();

if (typeof window !== 'undefined') {
  window.RecorderLifecycleService = RecorderLifecycleService;
}

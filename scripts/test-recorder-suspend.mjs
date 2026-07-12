/**
 * Recorder lifecycle regression tests.
 *
 * These tests use synthetic MediaStream/MediaRecorder objects so that the
 * visible-resume health policy can be exercised without a provider API key.
 * Chromium still starts with fake capture flags to keep the harness compatible
 * with future tests that use the real getUserMedia path.
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);
const { baseUrl } = getLocalServerConfig({ port: PORT });
const STATES = Object.freeze({
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  SUSPENDED: 'suspended'
});

const scenarios = [
  ['S1', 'muted recovers within grace period', runMutedRecovery],
  ['S2', 'muted persists beyond grace period', runMutedPersistence],
  ['S3', 'audio track ends during recording', runEndedTrack],
  ['S4', 'STT disconnect suspends active recording', runSttDisconnect],
  ['S5', 'STT reconnecting waits without suspension', runSttReconnecting],
  ['S6', 'inactive chunk recorder suspends recording', runInactiveRecorder],
  ['S7', 'chunk recorder restart gap does not suspend', runRecorderRestartGap],
  ['S8', 'healthy visible restore keeps recording', runHealthyRestore],
  ['S9', 'paused visible restore does not suspend', runPausedRestore],
  ['S10', 'normal stop does not become suspended', runNormalStop],
  ['S11', 'resume failure stops safely and preserves history', runResumeFailure]
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () =>
      typeof AppState !== 'undefined' && typeof handleVisibleRecordingHealthCheck === 'function',
    { timeout: 30000 }
  );
  return { page, context };
}

async function setupRecording(page, { provider = 'openai_stt' } = {}) {
  await page.evaluate(
    ({ provider }) => {
      const track = {
        kind: 'audio',
        readyState: 'live',
        _muted: false,
        stop() {
          this.readyState = 'ended';
        }
      };
      Object.defineProperty(track, 'muted', {
        configurable: true,
        get() {
          return this._muted;
        }
      });

      const stream = {
        active: true,
        getAudioTracks: () => [track],
        getTracks: () => [track]
      };
      const recorder = {
        state: 'recording',
        requestData() {},
        stop() {
          this.state = 'inactive';
        }
      };

      AppState.currentAudioStream = stream;
      AppState.activeProviderId = provider;
      AppState.sttConnectionStatus = provider === 'deepgram_realtime' ? 'connected' : null;
      AppState.currentSTTProvider = null;
      AppState.pcmStreamProcessor = null;
      AppState.mediaRecorder = recorder;
      AppState.recorderRestartTimeoutId = null;
      AppState.recorderStopReason = null;
      AppState.pauseStartedAt = null;
      AppState.finalStopPromise = null;
      AppState.queueDrainResolvers = [];
      AppState.isProcessingQueue = false;

      recorderLifecycle.transition(window.RecorderLifecycleService.EVENTS.PREPARE);
      recorderLifecycle.transition(window.RecorderLifecycleService.EVENTS.START);
      updateUI();
    },
    { provider }
  );
}

async function runMutedRecovery(page) {
  await setupRecording(page);
  const result = await page.evaluate(() => {
    const track = AppState.currentAudioStream.getAudioTracks()[0];
    track._muted = true;
    setTimeout(() => {
      track._muted = false;
    }, 500);
    return handleVisibleRecordingHealthCheck().then(() => ({
      state: AppState.recorderLifecycleState,
      badgeRecording: document.getElementById('statusBadge')?.classList.contains('status-recording')
    }));
  });
  assert(result.state === STATES.RECORDING, `expected recording, got ${result.state}`);
  assert(result.badgeRecording, 'expected REC badge after transient mute recovery');
}

async function runMutedPersistence(page) {
  await setupRecording(page);
  const result = await page.evaluate(() => {
    AppState.currentAudioStream.getAudioTracks()[0]._muted = true;
    return handleVisibleRecordingHealthCheck().then(() => ({
      state: AppState.recorderLifecycleState,
      badgeSuspended: document.getElementById('statusBadge')?.classList.contains('status-suspended')
    }));
  });
  assert(result.state === STATES.SUSPENDED, `expected suspended, got ${result.state}`);
  assert(result.badgeSuspended, 'expected suspended badge after persistent mute');
}

async function runEndedTrack(page) {
  await setupRecording(page);
  const result = await page.evaluate(() => {
    AppState.currentAudioStream.getAudioTracks()[0].readyState = 'ended';
    return handleVisibleRecordingHealthCheck().then(() => AppState.recorderLifecycleState);
  });
  assert(result === STATES.SUSPENDED, `expected suspended, got ${result}`);
}

async function runSttDisconnect(page) {
  await setupRecording(page, { provider: 'deepgram_realtime' });
  const result = await page.evaluate(async () => {
    // Stub provider internals, but use startStreamingRecording() so the test
    // exercises the production setOnStatusChange callback wiring.
    DeepgramWSProvider.prototype.start = async function () {
      this._stopped = false;
      this.updateStatus('connected');
    };
    PCMStreamProcessor.prototype.start = async function () {
      this.isProcessing = true;
    };
    await startStreamingRecording('deepgram_realtime');
    AppState.currentSTTProvider.onStatusChange('disconnected');
    await new Promise(resolve => setTimeout(resolve, 50));
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.SUSPENDED, `expected suspended, got ${result}`);
}

async function runSttReconnecting(page) {
  await setupRecording(page, { provider: 'deepgram_realtime' });
  const result = await page.evaluate(async () => {
    AppState.sttConnectionStatus = 'reconnecting';
    AppState.pcmStreamProcessor = {
      isActive: () => true,
      audioContext: { state: 'running' },
      stop: async () => {}
    };
    await handleVisibleRecordingHealthCheck();
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.RECORDING, `expected recording, got ${result}`);
}

async function runInactiveRecorder(page) {
  await setupRecording(page);
  const result = await page.evaluate(async () => {
    AppState.mediaRecorder.state = 'inactive';
    await handleVisibleRecordingHealthCheck();
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.SUSPENDED, `expected suspended, got ${result}`);
}

async function runRecorderRestartGap(page) {
  await setupRecording(page);
  const result = await page.evaluate(async () => {
    AppState.mediaRecorder.state = 'inactive';
    AppState.recorderRestartTimeoutId = 1;
    await handleVisibleRecordingHealthCheck();
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.RECORDING, `expected recording, got ${result}`);
}

async function runHealthyRestore(page) {
  await setupRecording(page);
  const result = await page.evaluate(async () => {
    await handleVisibleRecordingHealthCheck();
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.RECORDING, `expected recording, got ${result}`);
}

async function runPausedRestore(page) {
  await setupRecording(page);
  const result = await page.evaluate(async () => {
    recorderLifecycle.transition(window.RecorderLifecycleService.EVENTS.PAUSE);
    AppState.mediaRecorder.state = 'inactive';
    await handleVisibleRecordingHealthCheck();
    return AppState.recorderLifecycleState;
  });
  assert(result === STATES.PAUSED, `expected paused, got ${result}`);
}

async function runNormalStop(page) {
  await setupRecording(page, { provider: 'deepgram_realtime' });
  const result = await page.evaluate(async () => {
    DeepgramWSProvider.prototype.start = async function () {
      this._stopped = false;
      this.updateStatus('connected');
    };
    // 本番のoncloseと同様、意図的stopでもdisconnectedを発火させる。
    DeepgramWSProvider.prototype.stop = async function () {
      this.updateStatus('disconnected');
    };
    PCMStreamProcessor.prototype.start = async function () {
      this.isProcessing = true;
    };
    await startStreamingRecording('deepgram_realtime');

    let suspendCalled = false;
    const originalSuspend = suspendRecording;
    suspendRecording = async (...args) => {
      suspendCalled = true;
      return originalSuspend(...args);
    };
    await stopRecording();
    return { state: AppState.recorderLifecycleState, suspendCalled };
  });
  assert(result.state === STATES.IDLE, `expected idle after stop, got ${result.state}`);
  assert(!result.suspendCalled, 'suspend hook must not fire during intentional stop');
}

async function runResumeFailure(page) {
  await setupRecording(page);
  const result = await page.evaluate(async () => {
    let historySaved = false;
    persistStoppedRecordingHistory = async () => {
      historySaved = true;
    };
    await suspendRecording('test_scenario');
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('synthetic microphone failure');
    };
    await resumeSuspendedRecording();
    return {
      state: AppState.recorderLifecycleState,
      historySaved
    };
  });
  assert(result.state === STATES.IDLE, `expected idle after failed resume, got ${result.state}`);
  assert(result.historySaved, 'expected preserved history after failed resume');
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-capture', '--use-fake-ui-for-media-capture']
  });
  const results = [];

  try {
    for (const [id, title, scenario] of scenarios) {
      const { page, context } = await openPage(browser);
      try {
        await scenario(page);
        results.push({ id, title, status: 'pass' });
        console.log(`\u001b[32m✓\u001b[0m ${id} ${title}`);
      } catch (error) {
        results.push({ id, title, status: 'fail', error: error.message });
        console.error(`\u001b[31m✗\u001b[0m ${id} ${title}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (!server.reused) await server.stop();
  }

  const failed = results.filter(result => result.status === 'fail');
  console.log(
    `\nRecorder suspend tests: ${results.length - failed.length} passed, ${failed.length} failed`
  );
  if (failed.length > 0) {
    console.error(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

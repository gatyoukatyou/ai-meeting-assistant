/**
 * Memo / meeting recording profile regression test.
 * Recording entry is stubbed at the UI boundary; no microphone or API key is used.
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);
const { baseUrl } = getLocalServerConfig({ port: PORT });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getProfileUi(page) {
  return page.evaluate(() => ({
    profile: AppState.recordingProfile,
    storedProfile: localStorage.getItem('_recordingProfile'),
    chipProfile: document.getElementById('recordingProfileChip')?.dataset.profile,
    chipLabel: document.getElementById('recordingProfileLabel')?.textContent,
    aiVisible: getComputedStyle(document.getElementById('aiPanel')).display !== 'none',
    contextVisible: getComputedStyle(document.getElementById('openContextModalBtn')).display !== 'none',
    meetingModeVisible: getComputedStyle(document.getElementById('meetingModeChip')).display !== 'none',
    transcriptVisible: getComputedStyle(document.getElementById('transcriptPanel')).display !== 'none',
    statusVisible: getComputedStyle(document.getElementById('statusBadge')).display !== 'none',
    historyVisible: getComputedStyle(document.getElementById('openHistoryBtn')).display !== 'none',
    exportVisible: getComputedStyle(document.getElementById('openExportBtn')).display !== 'none'
  }));
}

async function saveRawProfileRecord(page, suffix) {
  return page.evaluate(async suffix => {
    AppState.transcriptChunks = [{
      id: `profile-${suffix}`,
      timestamp: '10:00',
      text: `profile transcript ${suffix}`,
      excluded: false,
      isMarkerStart: false
    }];
    AppState.fullTranscript = `[10:00] profile transcript ${suffix}`;
    document.getElementById('meetingTitleInput').value = `profile ${suffix}`;
    await persistStoppedRecordingHistory();
    const record = await HistoryStore.get(AppState.lastSavedHistoryId);
    return {
      id: record.id,
      profile: record.profile,
      status: record.status,
      structured: record.structured,
      transcript: record.transcript,
      organizeVisible: !document.getElementById('structuringAction').hidden
    };
  }, suffix);
}

async function runProfileFlow(page) {
  await page.evaluate(async () => HistoryStore.clear());

  const memoUi = await getProfileUi(page);
  assert(memoUi.profile === 'memo', `default profile should be memo, got ${memoUi.profile}`);
  assert(memoUi.chipProfile === 'memo' && memoUi.chipLabel === 'メモ', 'memo chip state is incorrect');
  assert(!memoUi.aiVisible, 'AI panel should be hidden in memo profile');
  assert(!memoUi.contextVisible, 'meeting context entry should be hidden in memo profile');
  assert(!memoUi.meetingModeVisible, 'meeting mode chip should be hidden in memo profile');
  assert(memoUi.transcriptVisible && memoUi.statusVisible, 'memo transcript or status is hidden');
  assert(memoUi.historyVisible && memoUi.exportVisible, 'memo history or export is hidden');

  await page.evaluate(() => {
    window.__profileRecordTaps = 0;
    document.getElementById('recordBtn').addEventListener('click', () => {
      window.__profileRecordTaps += 1;
    });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('expected profile test microphone rejection');
    };
    alert = () => {};
    document.getElementById('recordBtn').disabled = false;
  });
  await page.click('#recordBtn');
  await page.waitForFunction(() => window.__profileRecordTaps === 1);
  assert(
    !await page.locator('#contextModal').evaluate(node => node.classList.contains('active')),
    'memo record tap unexpectedly opened meeting context'
  );

  const memoRecord = await saveRawProfileRecord(page, 'memo');
  assert(memoRecord.profile === 'memo', `memo record profile mismatch: ${memoRecord.profile}`);
  assert(memoRecord.status === 'raw' && memoRecord.structured === null, 'memo raw autosave regressed');
  assert(memoRecord.transcript.includes('profile transcript memo'), 'memo transcript was not saved');
  assert(memoRecord.organizeVisible, 'memo organize action is not available after raw save');
  await page.evaluate(() => openHistoryModal());
  await page.waitForSelector('#historyModal.active');
  const memoAfterHistory = await page.evaluate(id => HistoryStore.get(id), memoRecord.id);
  assert(memoAfterHistory.status === 'raw', 'opening history changed the raw memo record');
  await page.click('#closeHistoryModalBtn');

  await page.click('#recordingProfileChip');
  const meetingUi = await getProfileUi(page);
  assert(meetingUi.profile === 'meeting' && meetingUi.storedProfile === 'meeting', 'meeting profile was not persisted');
  assert(meetingUi.aiVisible, 'AI panel should be available in meeting profile');
  assert(meetingUi.contextVisible, 'meeting context entry should be available in meeting profile');
  assert(meetingUi.meetingModeVisible, 'meeting mode chip should be available in meeting profile');

  await page.click('#openContextModalBtn');
  await page.waitForSelector('#contextModal.active');
  await page.click('#cancelContextBtn');
  await page.waitForFunction(() => !document.getElementById('contextModal').classList.contains('active'));
  await page.waitForTimeout(600);
  await page.click('#recordBtn');
  await page.waitForFunction(() => window.__profileRecordTaps === 2);

  const meetingRecord = await saveRawProfileRecord(page, 'meeting');
  assert(meetingRecord.profile === 'meeting', `meeting record profile mismatch: ${meetingRecord.profile}`);
  assert(meetingRecord.status === 'raw', 'meeting raw autosave regressed');

  const restoredMemoRecord = await page.evaluate(async id => {
    confirm = () => true;
    await restoreFromHistory(id);
    await saveHistorySnapshot();
    const record = await HistoryStore.get(id);
    return {
      id: record.id,
      profile: record.profile,
      restoredHistoryId: AppState.restoredHistoryId,
      lastSavedHistoryId: AppState.lastSavedHistoryId
    };
  }, memoRecord.id);
  assert(restoredMemoRecord.id === memoRecord.id, 'restored memo was not overwritten in place');
  assert(
    restoredMemoRecord.profile === 'memo',
    `restored memo profile changed to the active UI profile: ${restoredMemoRecord.profile}`
  );
  assert(restoredMemoRecord.restoredHistoryId === null, 'restored history id was not reset after overwrite');
  assert(restoredMemoRecord.lastSavedHistoryId === memoRecord.id, 'last saved history id was not preserved');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof AppState !== 'undefined' && document.documentElement.dataset.recordingProfile
  );
  const restoredMeetingUi = await getProfileUi(page);
  assert(restoredMeetingUi.profile === 'meeting', 'meeting profile was not restored after reload');
  assert(restoredMeetingUi.aiVisible && restoredMeetingUi.contextVisible, 'meeting UI regressed after reload');

  await page.click('#recordingProfileChip');
  const badgeStates = await page.evaluate(() => {
    recorderLifecycle.transition(RecorderLifecycleService.EVENTS.PREPARE);
    recorderLifecycle.transition(RecorderLifecycleService.EVENTS.START);
    updateUI();
    const recording = {
      visible: getComputedStyle(document.getElementById('statusBadge')).display !== 'none',
      active: document.getElementById('statusBadge').classList.contains('status-recording'),
      profileDisabled: document.getElementById('recordingProfileChip').disabled
    };
    recorderLifecycle.transition(RecorderLifecycleService.EVENTS.SUSPEND);
    updateUI();
    const suspended = document.getElementById('statusBadge').classList.contains('status-suspended');
    updateStatusBadge('⏳ 処理中', 'processing');
    return {
      recording,
      suspended,
      processingText: document.getElementById('statusBadge').textContent
    };
  });
  assert(badgeStates.recording.visible && badgeStates.recording.active, 'memo recording badge is not active');
  assert(badgeStates.recording.profileDisabled, 'profile switch should be disabled while recording');
  assert(badgeStates.suspended, 'memo suspended badge is not active');
  assert(badgeStates.processingText.includes('処理中'), 'memo processing state is not visible');
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => console.error(`[pageerror] ${error.message}`));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('_profile_test_initialized')) {
        localStorage.clear();
        sessionStorage.setItem('_profile_test_initialized', '1');
      }
      localStorage.setItem('_visited', 'true');
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => typeof AppState !== 'undefined' && typeof setRecordingProfile === 'function',
      { timeout: 30000 }
    );
    await runProfileFlow(page);
    console.log('\u001b[32m✓\u001b[0m P1 memo/meeting entry, persistence, restored overwrite, raw save, and status UI');
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (!server.reused) await server.stop();
  }
}

run().catch(error => {
  console.error(`\u001b[31m✗\u001b[0m P1 ${error.stack || error.message}`);
  process.exitCode = 1;
});

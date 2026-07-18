/**
 * Recording follow-up structuring regression tests.
 * LLM calls are mocked; no API key or external request is used.
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);
const { baseUrl } = getLocalServerConfig({ port: PORT });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('_visited', 'true'));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () =>
      typeof AppState !== 'undefined' &&
      typeof HistoryStore !== 'undefined' &&
      typeof persistStoppedRecordingHistory === 'function',
    { timeout: 30000 }
  );
  return { context, page };
}

async function createRawStoppedRecord(page, suffix) {
  return page.evaluate(async suffix => {
    AppState.transcriptChunks = [
      {
        id: `chunk-${suffix}`,
        timestamp: '10:00',
        text: `会話の文字起こし ${suffix}`,
        excluded: false,
        isMarkerStart: false
      }
    ];
    AppState.fullTranscript = `[10:00] 会話の文字起こし ${suffix}`;
    document.getElementById('meetingTitleInput').value = `raw ${suffix}`;
    await persistStoppedRecordingHistory();
    const records = await HistoryStore.list();
    const record = records.find(item => item.id === AppState.lastSavedHistoryId);
    return {
      id: record.id,
      count: records.length,
      status: record.status,
      profile: record.profile,
      createdAt: record.createdAt,
      transcript: record.transcript,
      buttonVisible: !document.getElementById('structuringAction').hidden
    };
  }, suffix);
}

async function runOrganizedFlow(page) {
  const raw = await createRawStoppedRecord(page, 'organized');
  assert(raw.status === 'raw', `expected raw before structuring, got ${raw.status}`);
  assert(raw.profile === 'memo', `expected memo profile before structuring, got ${raw.profile}`);
  assert(raw.buttonVisible, 'organize action should be visible after stopped-record save');

  await page.evaluate(() => {
    window.__structuringPrompts = [];
    window.__regenerateConfirmed = false;
    getAvailableLlm = () => ({ provider: 'gemini' });
    callLLM = async (_provider, prompt) => {
      window.__structuringPrompts.push(prompt);
      const regenerated = prompt.includes('候補を具体的に');
      return JSON.stringify({
        title: regenerated ? '再生成後のタイトル' : 'AI提案タイトル',
        category: '相談・確認',
        tags: ['資金', '確認'],
        keyPoints: ['要点'],
        decisions: ['決定'],
        actionCandidates: [regenerated ? '具体化した候補' : '確認候補'],
        openQuestions: ['未解決']
      });
    };
    confirm = () => {
      window.__regenerateConfirmed = true;
      return true;
    };
  });

  await page.click('#organizeTranscriptBtn');
  await page.waitForSelector('#structuringModal.active');
  await page.fill('#structuringInstructionInput', '候補を具体的に');
  await page.click('#regenerateStructuringBtn');
  await page.waitForFunction(
    () => document.getElementById('structuringTitleInput').value === '再生成後のタイトル'
  );
  await page.fill('#structuringTitleInput', 'HUMAN確認済みタイトル');
  await page.click('#saveStructuringBtn');
  await page.waitForFunction(
    () => !document.getElementById('structuringModal').classList.contains('active')
  );

  const result = await page.evaluate(async id => {
    const records = await HistoryStore.list();
    const record = await HistoryStore.get(id);
    return {
      count: records.length,
      record,
      promptCount: window.__structuringPrompts.length,
      additionalInstructionUsed: window.__structuringPrompts[1]?.includes('候補を具体的に'),
      regenerateConfirmed: window.__regenerateConfirmed
    };
  }, raw.id);

  assert(result.count === raw.count, 'structuring must not create a second history record');
  assert(result.record.id === raw.id, 'structuring must update the same record id');
  assert(result.record.createdAt === raw.createdAt, 'structuring must preserve createdAt');
  assert(result.record.transcript === raw.transcript, 'structuring must preserve the transcript');
  assert(result.record.status === 'organized', 'saved review must set status organized');
  assert(result.record.profile === 'memo', 'structured save must preserve the memo profile');
  assert(result.record.title === 'HUMAN確認済みタイトル', 'edited title was not saved');
  assert(
    result.record.structured.actionCandidates[0] === '具体化した候補',
    'action candidate was not saved'
  );
  assert(
    result.promptCount === 2,
    `expected initial and regeneration calls, got ${result.promptCount}`
  );
  assert(
    result.additionalInstructionUsed,
    'regeneration prompt did not include the additional instruction'
  );
  assert(result.regenerateConfirmed, 'regeneration did not confirm discarding current edits');
}

async function runCancelLeavesRaw(page) {
  const raw = await createRawStoppedRecord(page, 'cancel');
  await page.evaluate(() => {
    getAvailableLlm = () => ({ provider: 'gemini' });
    callLLM = async () =>
      JSON.stringify({
        title: '提案',
        category: 'その他',
        tags: [],
        keyPoints: [],
        decisions: [],
        actionCandidates: [],
        openQuestions: []
      });
  });
  await page.click('#organizeTranscriptBtn');
  await page.waitForSelector('#structuringModal.active');
  await page.click('#cancelStructuringBtn');
  const result = await page.evaluate(async id => {
    const records = await HistoryStore.list();
    return { record: await HistoryStore.get(id), count: records.length };
  }, raw.id);
  assert(result.record.status === 'raw', 'cancel must leave the record raw');
  assert(result.record.structured === null, 'cancel must not write structured content');
  assert(result.count === raw.count, 'cancel must not change the record count');
}

async function runFailureLeavesRaw(page) {
  const raw = await createRawStoppedRecord(page, 'failure');
  await page.evaluate(() => {
    window.__structuringFailureCalls = 0;
    getAvailableLlm = () => ({ provider: 'gemini' });
    callLLM = async () => {
      window.__structuringFailureCalls += 1;
      return 'not valid JSON';
    };
  });
  await page.click('#organizeTranscriptBtn');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.toast.error .toast-message')).some(node =>
      node.textContent.includes('元の文字起こし')
    )
  );
  const result = await page.evaluate(async id => {
    const records = await HistoryStore.list();
    return {
      record: await HistoryStore.get(id),
      count: records.length,
      llmCalls: window.__structuringFailureCalls
    };
  }, raw.id);
  assert(result.llmCalls === 2, 'invalid JSON must be retried exactly once');
  assert(result.record.status === 'raw', 'LLM failure must leave the record raw');
  assert(result.record.structured === null, 'LLM failure must not write structured content');
  assert(result.record.transcript === raw.transcript, 'LLM failure must preserve the transcript');
  assert(result.count === raw.count, 'LLM failure must not change the record count');
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  let browser = null;
  const scenarios = [
    ['T1', 'stopped raw record is organized in place', runOrganizedFlow],
    ['T2', 'cancel leaves the stopped record raw', runCancelLeavesRaw],
    ['T3', 'invalid LLM JSON leaves the stopped record untouched', runFailureLeavesRaw]
  ];
  const failures = [];

  try {
    browser = await chromium.launch();
    for (const [id, title, scenario] of scenarios) {
      const { context, page } = await openPage(browser);
      try {
        await scenario(page);
        console.log(`\u001b[32m✓\u001b[0m ${id} ${title}`);
      } catch (error) {
        failures.push({ id, title, error: error.message });
        console.error(`\u001b[31m✗\u001b[0m ${id} ${title}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (!server.reused) await server.stop();
  }

  console.log(
    `\nStructuring review tests: ${scenarios.length - failures.length} passed, ${failures.length} failed`
  );
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

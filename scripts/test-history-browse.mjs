/**
 * History notebook browse regression test.
 * Seeds IndexedDB directly; no API key or external request is used.
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);
const { baseUrl } = getLocalServerConfig({ port: PORT });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedRecords(page) {
  await page.evaluate(async () => {
    await HistoryStore.clear();
    const records = [
      {
        id: 'browse-1',
        title: '予算相談',
        createdAt: '2026-07-18T03:00:00.000Z',
        durationSec: 180,
        category: '相談・確認',
        tags: ['財務', '重要'],
        status: 'organized',
        summaryPreview: '来期予算の要約',
        transcript: 'transcript-needle 来期の予算を確認する',
        structured: {
          keyPoints: ['売上見込みを確認'],
          decisions: ['予算案を承認'],
          actionCandidates: ['見積を更新'],
          openQuestions: ['structured-needle 支払時期']
        },
        minutes: '議事録の本文'
      },
      {
        id: 'browse-2', title: '週次会議', createdAt: '2026-07-17T03:00:00.000Z',
        durationSec: 90, category: '会議・打合せ', tags: ['週次'], status: 'raw',
        transcript: '週次の文字起こし', structured: null
      },
      {
        id: 'browse-3', title: '依頼整理', createdAt: '2026-07-16T03:00:00.000Z',
        durationSec: 60, category: '指示・依頼', tags: ['開発'], status: 'organized',
        transcript: '依頼内容', structured: { keyPoints: ['実装範囲'] }
      },
      {
        id: 'browse-4', title: '案出し', createdAt: '2026-07-15T03:00:00.000Z',
        durationSec: 30, category: 'アイデア', tags: ['新規'], status: 'raw',
        transcript: 'アイデア内容', structured: null
      },
      {
        id: 'browse-5', title: '追加相談', createdAt: '2026-07-14T03:00:00.000Z',
        durationSec: 120, category: '相談・確認', tags: ['顧客'], status: 'raw',
        transcript: '顧客相談', structured: null
      },
      {
        id: 'browse-6', title: 'その他メモ', createdAt: '2026-07-13T03:00:00.000Z',
        durationSec: 10, category: 'その他', tags: [], status: 'organized',
        transcript: 'その他の内容', structured: { decisions: ['保存'] }
      }
    ];
    for (const record of records) await HistoryStore.save(record);
    await openHistoryModal();
  });
}

async function visibleRecordIds(page) {
  return page.locator('#historyList .history-item-open').evaluateAll(nodes =>
    nodes.map(node => node.dataset.id)
  );
}

async function clearFilters(page) {
  await page.fill('#historySearchInput', '');
  await page.selectOption('#historyCategoryFilter', '');
  await page.selectOption('#historyStatusFilter', '');
  await page.fill('#historyStartDateFilter', '');
  await page.fill('#historyEndDateFilter', '');
}

async function runHistoryBrowse(page) {
  await seedRecords(page);
  await page.waitForSelector('#historyModal.active');

  let ids = await visibleRecordIds(page);
  assert(ids.length === 6, `expected 6 records, got ${ids.length}`);
  assert(ids[0] === 'browse-1' && ids[5] === 'browse-6', 'records are not newest first');
  const listText = await page.locator('#historyList').textContent();
  assert(listText.includes('財務') && listText.includes('整理済み'), 'list metadata is missing');
  assert(!listText.includes('transcript-needle'), 'full transcript leaked into list DOM');

  await page.selectOption('#historyCategoryFilter', '相談・確認');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-1,browse-5', `category filter mismatch: ${ids}`);

  await clearFilters(page);
  await page.selectOption('#historyStatusFilter', 'organized');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-1,browse-3,browse-6', `status filter mismatch: ${ids}`);

  await clearFilters(page);
  await page.fill('#historyStartDateFilter', '2026-07-14');
  await page.fill('#historyEndDateFilter', '2026-07-16');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-3,browse-4,browse-5', `date filter mismatch: ${ids}`);

  await page.selectOption('#historyCategoryFilter', '指示・依頼');
  await page.selectOption('#historyStatusFilter', 'organized');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-3', `AND filter mismatch: ${ids}`);

  await clearFilters(page);
  await page.fill('#historySearchInput', 'transcript-needle');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-1', 'transcript full-text search failed');

  await page.fill('#historySearchInput', 'structured-needle');
  ids = await visibleRecordIds(page);
  assert(ids.join(',') === 'browse-1', 'structured full-text search failed');

  await clearFilters(page);
  await page.click('.history-item-open[data-id="browse-1"]');
  await page.waitForSelector('#historyDetailView:not([hidden])');
  const headings = await page.locator('#historyDetailContent .history-detail-section h4').allTextContents();
  assert(
    headings.join('|') === '要点|決定事項|アクション候補|未解決事項|議事録|文字起こし',
    `detail section order mismatch: ${headings.join('|')}`
  );
  const detailText = await page.locator('#historyDetailContent').textContent();
  assert(detailText.includes('予算案を承認'), 'structured detail content is missing');
  assert(detailText.includes('議事録の本文'), 'minutes detail content is missing');
  assert(detailText.includes('transcript-needle'), 'transcript detail content is missing');

  await page.evaluate(() => {
    window.__historyDeleteConfirmCalls = 0;
    confirm = () => {
      window.__historyDeleteConfirmCalls += 1;
      return true;
    };
  });
  await page.click('#historyDetailDeleteBtn');
  await page.waitForSelector('#historyListView:not([hidden])');
  const deletion = await page.evaluate(async () => ({
    record: await HistoryStore.get('browse-1'),
    count: (await HistoryStore.list()).length,
    confirmCalls: window.__historyDeleteConfirmCalls
  }));
  assert(deletion.record === null, 'confirmed detail deletion did not remove the record');
  assert(deletion.count === 5, `expected 5 records after deletion, got ${deletion.count}`);
  assert(deletion.confirmCalls === 1, 'detail deletion did not ask for confirmation exactly once');
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('_visited', 'true'));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => typeof HistoryStore !== 'undefined' && typeof openHistoryModal === 'function',
      { timeout: 30000 }
    );
    await runHistoryBrowse(page);
    console.log('\u001b[32m✓\u001b[0m H1 history filters, search, detail order, and deletion');
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (!server.reused) await server.stop();
  }
}

run().catch(error => {
  console.error(`\u001b[31m✗\u001b[0m H1 ${error.message}`);
  process.exitCode = 1;
});

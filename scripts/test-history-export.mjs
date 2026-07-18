/**
 * History Markdown export regression test.
 * Seeds IndexedDB directly; no API key or external request is used.
 */

import { readFile } from 'node:fs/promises';
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
        id: 'export-1',
        title: '資金: #確認',
        createdAt: '2026-07-18T03:00:00.000Z',
        durationSec: 180,
        profile: 'meeting',
        category: '相談・確認',
        tags: ['財務: 重要', '#至急'],
        status: 'organized',
        transcript: 'newest consultation transcript',
        structured: {
          keyPoints: ['売上見込みを確認'],
          decisions: ['予算案を承認'],
          actionCandidates: ['見積を更新'],
          openQuestions: ['支払時期']
        },
        minutes: '議事録の本文'
      },
      {
        id: 'export-2',
        title: '対象外メモ',
        createdAt: '2026-07-17T03:00:00.000Z',
        durationSec: 60,
        profile: 'memo',
        category: 'その他',
        tags: [],
        status: 'raw',
        transcript: 'must not appear in filtered export',
        structured: null
      },
      {
        id: 'export-3',
        title: '以前の相談',
        createdAt: '2026-07-16T03:00:00.000Z',
        durationSec: 90,
        profile: 'memo',
        category: '相談・確認',
        tags: ['顧客'],
        status: 'organized',
        transcript: 'older consultation transcript',
        structured: {
          keyPoints: ['顧客要望'],
          decisions: [],
          actionCandidates: [],
          openQuestions: []
        }
      }
    ];
    for (const record of records) await HistoryStore.save(record);
    await openHistoryModal();
  });
}

async function captureDownload(page, click) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    click()
  ]);
  const filePath = await download.path();
  return {
    fileName: download.suggestedFilename(),
    content: await readFile(filePath, 'utf8')
  };
}

async function runHistoryExport(page) {
  await seedRecords(page);
  await page.waitForSelector('#historyModal.active');

  await page.click('.history-item-open[data-id="export-1"]');
  await page.waitForSelector('#historyDetailView:not([hidden])');
  const single = await captureDownload(page, () => page.click('#historyDetailExportBtn'));
  assert(single.fileName === 'export-1.md', `single export filename mismatch: ${single.fileName}`);
  assert(single.content.startsWith('---\nid: "export-1"\n'), 'single export front matter is missing');
  assert(single.content.includes('category: "相談・確認"'), 'single export category is missing');
  assert(single.content.includes('  - "財務: 重要"\n  - "#至急"'), 'YAML-safe tags are missing');
  assert(single.content.includes('## アクション候補\n\n以下は候補であり、確定タスクではありません。'), 'action candidate notice is missing');
  assert(single.content.includes('## 議事録\n\n議事録の本文'), 'meeting minutes are missing');
  assert(single.content.includes('## 文字起こし\n\nnewest consultation transcript'), 'single transcript is missing');

  await page.click('[data-action="back-to-list"]');
  await page.selectOption('#historyCategoryFilter', '相談・確認');
  await page.selectOption('#historyStatusFilter', 'raw');
  assert(await page.locator('#historyBulkExportBtn').isDisabled(), 'bulk export should be disabled for zero matches');
  await page.selectOption('#historyStatusFilter', 'organized');
  assert(await page.locator('#historyBulkExportBtn').isEnabled(), 'bulk export should be enabled for matches');

  const bulk = await captureDownload(page, () => page.click('#historyBulkExportBtn'));
  assert(/^conversations-\d{8}\.md$/.test(bulk.fileName), `bulk export filename mismatch: ${bulk.fileName}`);
  assert((bulk.content.match(/^---\nid:/gm) || []).length === 2, 'bulk export record count mismatch');
  assert(bulk.content.indexOf('id: "export-1"') < bulk.content.indexOf('id: "export-3"'), 'bulk export order is not newest first');
  assert(!bulk.content.includes('id: "export-2"'), 'filtered-out record leaked into bulk export');
  assert(
    bulk.content.includes('newest consultation transcript\n\n---\nid: "export-3"'),
    'bulk export separator contract mismatch'
  );
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  let browser = null;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('_visited', 'true'));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => typeof HistoryStore !== 'undefined' && typeof openHistoryModal === 'function',
      { timeout: 30000 }
    );
    await runHistoryExport(page);
    console.log('\u001b[32m✓\u001b[0m H2 single and filtered bulk Markdown export');
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (!server.reused) await server.stop();
  }
}

run().catch(error => {
  console.error(`\u001b[31m✗\u001b[0m H2 ${error.message}`);
  process.exitCode = 1;
});

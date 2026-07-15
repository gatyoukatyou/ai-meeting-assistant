/**
 * HistoryStore v2 -> v3 migration and retention regression test.
 */

import { chromium } from 'playwright';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.PORT || 8080);
const { baseUrl } = getLocalServerConfig({ port: PORT });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedV2Database(page) {
  await page.goto(`${baseUrl}/manifest.json`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('aiMeetingHistory');
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('v2 database deletion was blocked'));
    });

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('aiMeetingHistory', 2);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        const records = db.createObjectStore('records', { keyPath: 'id' });
        records.createIndex('createdAt', 'createdAt', { unique: false });
        const drafts = db.createObjectStore('activeMeetingDrafts', { keyPath: 'sessionId' });
        drafts.createIndex('updatedAt', 'updatedAt', { unique: false });
        drafts.createIndex('status', 'status', { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({
          id: 'v2-existing',
          title: '既存レコード',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          transcript: '既存の文字起こし',
          durationSec: 42,
          summaryPreview: '既存の要約',
          exportMarkdown: '# 既存'
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

async function run() {
  const server = await ensureLocalStaticServer({ port: PORT });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    const storage = navigator.storage;
    if (!storage) return;
    Object.defineProperty(storage, 'persist', {
      configurable: true,
      value: async () => {
        const calls = Number(sessionStorage.getItem('history-persist-calls') || '0') + 1;
        sessionStorage.setItem('history-persist-calls', String(calls));
        return true;
      }
    });
    Object.defineProperty(storage, 'estimate', {
      configurable: true,
      value: async () => ({ usage: 81, quota: 100 })
    });
  });

  try {
    await seedV2Database(page);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => typeof HistoryStore !== 'undefined' && typeof showToast === 'function',
      { timeout: 30000 }
    );

    const result = await page.evaluate(async () => {
      const migrated = await HistoryStore.get('v2-existing');
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('aiMeetingHistory', 3);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('records', 'readonly');
      const indexNames = Array.from(tx.objectStore('records').indexNames);
      db.close();

      for (let index = 0; index < 7; index++) {
        await HistoryStore.save({
          id: `new-${index}`,
          title: `record ${index}`,
          createdAt: new Date(Date.UTC(2026, 6, 2, 0, 0, index)).toISOString(),
          transcript: `transcript ${index}`
        });
      }
      const retained = await HistoryStore.list();

      for (let index = 0; index < 4; index++) {
        await HistoryStore.saveDraft({
          sessionId: `draft-${index}`,
          updatedAt: new Date(Date.UTC(2026, 6, 3, 0, 0, index)).toISOString()
        });
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const drafts = await HistoryStore.listDrafts();

      await HistoryStore.delete('new-0');
      const deleted = await HistoryStore.get('new-0');
      await HistoryStore.clear();
      const afterClear = await HistoryStore.list();

      return {
        migrated,
        indexNames,
        retainedCount: retained.length,
        retainedExisting: retained.some(record => record.id === 'v2-existing'),
        allV3Complete: retained.every(
          record =>
            record.schemaVersion === 3 &&
            ['meeting', 'memo'].includes(record.profile) &&
            ['会議・打合せ', '相談・確認', '指示・依頼', 'アイデア', 'その他'].includes(
              record.category
            ) &&
            Array.isArray(record.tags) &&
            ['raw', 'organized'].includes(record.status) &&
            Object.prototype.hasOwnProperty.call(record, 'structured')
        ),
        draftIds: drafts.map(draft => draft.sessionId),
        deleted,
        afterClearCount: afterClear.length,
        persistCalls: Number(sessionStorage.getItem('history-persist-calls') || '0'),
        warningShown: Array.from(document.querySelectorAll('.toast.warning .toast-message')).some(
          node => node.textContent.includes('81%')
        )
      };
    });

    assert(result.migrated.schemaVersion === 3, 'v2 record was not marked schemaVersion 3');
    assert(result.migrated.profile === 'meeting', 'v2 profile default was not applied');
    assert(result.migrated.category === '会議・打合せ', 'v2 category default was not applied');
    assert(
      Array.isArray(result.migrated.tags) && result.migrated.tags.length === 0,
      'v2 tags default was not applied'
    );
    assert(result.migrated.status === 'raw', 'v2 status default was not applied');
    assert(result.migrated.structured === null, 'v2 structured default was not applied');
    assert(
      result.migrated.transcript === '既存の文字起こし',
      'v2 transcript changed during migration'
    );
    assert(
      result.migrated.exportMarkdown === '# 既存',
      'v2 exportMarkdown changed during migration'
    );
    assert(result.indexNames.includes('category'), 'category index is missing');
    assert(result.indexNames.includes('status'), 'status index is missing');
    assert(result.retainedCount === 8, `expected 8 retained records, got ${result.retainedCount}`);
    assert(
      result.retainedExisting,
      'existing record was deleted after saving more than five records'
    );
    assert(result.allV3Complete, 'saved records do not all have complete v3 fields');
    assert(
      result.draftIds.length === 3,
      `expected 3 retained drafts, got ${result.draftIds.length}`
    );
    assert(!result.draftIds.includes('draft-0'), 'oldest draft was not removed');
    assert(result.deleted === null, 'explicit record deletion no longer works');
    assert(result.afterClearCount === 0, 'clearRecords no longer clears records');
    assert(result.persistCalls === 1, `expected one persist request, got ${result.persistCalls}`);
    assert(result.warningShown, 'storage warning toast was not shown above 80% usage');

    console.log('\u001b[32m✓\u001b[0m HistoryStore v2 -> v3 migration preserves data');
    console.log('\u001b[32m✓\u001b[0m HistoryStore retains more than five records');
    console.log(
      '\u001b[32m✓\u001b[0m Explicit deletion, clear, and three-draft limit remain intact'
    );
    console.log('\u001b[32m✓\u001b[0m Persistent storage and capacity warning are active');
  } finally {
    await context.close();
    await browser.close();
    if (!server.reused) await server.stop();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

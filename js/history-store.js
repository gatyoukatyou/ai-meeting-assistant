// =====================================
// 会議履歴 IndexedDB ストア
// =====================================
(function(global) {
  const DB_NAME = 'aiMeetingHistory';
  const DB_VERSION = 3;
  const STORE_NAME = 'records';
  const DRAFT_STORE_NAME = 'activeMeetingDrafts';
  const MAX_DRAFTS = 3;
  const STORAGE_WARNING_THRESHOLD = 0.8;
  const DEFAULT_CATEGORY = '会議・打合せ';
  const DEFAULT_STATUS = 'raw';
  const VALID_PROFILES = new Set(['meeting', 'memo']);
  const VALID_CATEGORIES = new Set([
    DEFAULT_CATEGORY,
    '相談・確認',
    '指示・依頼',
    'アイデア',
    'その他'
  ]);
  const VALID_STATUSES = new Set([DEFAULT_STATUS, 'organized']);
  let storagePersistencePromise = null;

  if (!global.indexedDB) {
    console.warn('[HistoryStore] IndexedDB is not supported in this environment.');
    return;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        } else {
          store = event.target.transaction.objectStore(STORE_NAME);
        }
        if (!store.indexNames.contains('category')) {
          store.createIndex('category', 'category', { unique: false });
        }
        if (!store.indexNames.contains('status')) {
          store.createIndex('status', 'status', { unique: false });
        }
        if (event.oldVersion < 3) {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = cursorEvent => {
            const cursor = cursorEvent.target.result;
            if (!cursor) return;
            cursor.update(withV3Defaults(cursor.value));
            cursor.continue();
          };
        }
        if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
          const draftStore = db.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'sessionId' });
          draftStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          draftStore.createIndex('status', 'status', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  function withV3Defaults(record) {
    const source = record || {};
    return {
      ...source,
      schemaVersion: 3,
      profile: VALID_PROFILES.has(source.profile) ? source.profile : 'meeting',
      category: VALID_CATEGORIES.has(source.category) ? source.category : DEFAULT_CATEGORY,
      tags: Array.isArray(source.tags) ? source.tags : [],
      status: VALID_STATUSES.has(source.status) ? source.status : DEFAULT_STATUS,
      structured: Object.prototype.hasOwnProperty.call(source, 'structured')
        ? source.structured
        : null
    };
  }

  function requestPersistentStorage() {
    if (storagePersistencePromise) return storagePersistencePromise;
    if (!global.navigator?.storage?.persist) return Promise.resolve(null);
    storagePersistencePromise = global.navigator.storage
      .persist()
      .then(granted => {
        console.info(`[HistoryStore] Persistent storage ${granted ? 'granted' : 'not granted'}.`);
        return granted;
      })
      .catch(error => {
        console.warn('[HistoryStore] Persistent storage request failed.', error);
        return false;
      });
    return storagePersistencePromise;
  }

  async function getStorageEstimate() {
    if (!global.navigator?.storage?.estimate) return null;
    try {
      const { usage, quota } = await global.navigator.storage.estimate();
      if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return null;
      return { usage, quota, ratio: usage / quota };
    } catch (error) {
      console.warn('[HistoryStore] Storage estimate failed.', error);
      return null;
    }
  }

  async function warnIfStorageNearlyFull() {
    const estimate = await getStorageEstimate();
    if (!estimate || estimate.ratio <= STORAGE_WARNING_THRESHOLD) return;
    if (typeof global.showToast !== 'function') return;
    const percent = Math.round(estimate.ratio * 100);
    const key = 'toast.history.storageNearlyFull';
    const translated = typeof global.t === 'function' ? global.t(key, { percent }) : key;
    const message =
      translated === key
        ? `保存領域の使用率が${percent}%です。履歴のエクスポートを検討してください。`
        : translated;
    global.showToast(message, 'warning');
  }

  async function saveRecord(record) {
    if (!record || !record.id) {
      throw new Error('Invalid history record payload');
    }
    const db = await openDB();
    const now = new Date().toISOString();
    const payload = withV3Defaults({
      createdAt: record.createdAt || now,
      ...record,
      updatedAt: now
    });

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });

    await warnIfStorageNearlyFull();
  }

  function listRecords() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('createdAt');
        const results = [];
        const cursor = index.openCursor(null, 'prev'); // newest first
        cursor.onsuccess = event => {
          const cur = event.target.result;
          if (cur) {
            results.push(cur.value);
            cur.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    });
  }

  function getRecord(id) {
    if (!id) return Promise.resolve(null);
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function deleteRecord(id) {
    if (!id) return Promise.resolve();
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  function clearRecords() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function saveDraft(draft) {
    if (!draft || !draft.sessionId) {
      throw new Error('Invalid active meeting draft payload');
    }
    const db = await openDB();
    const now = new Date().toISOString();
    const payload = {
      ...draft,
      id: draft.id || draft.sessionId,
      status: draft.status || 'active',
      finalized: Boolean(draft.finalized),
      startedAt: draft.startedAt || now,
      updatedAt: now
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });

    await enforceDraftLimit(db);
  }

  async function enforceDraftLimit(db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const total = countRequest.result || 0;
        const excess = total - MAX_DRAFTS;
        if (excess <= 0) {
          resolve();
          return;
        }
        const index = store.index('updatedAt');
        const cursorRequest = index.openCursor(null, 'next');
        let toDelete = excess;
        cursorRequest.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor || toDelete <= 0) return;
          const deleteRequest = cursor.delete();
          deleteRequest.onsuccess = () => {
            toDelete--;
            cursor.continue();
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      };
      countRequest.onerror = () => reject(countRequest.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function listDrafts() {
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, 'readonly');
        const store = tx.objectStore(DRAFT_STORE_NAME);
        const index = store.index('updatedAt');
        const results = [];
        const cursor = index.openCursor(null, 'prev');
        cursor.onsuccess = event => {
          const cur = event.target.result;
          if (cur) {
            const draft = cur.value;
            if (!draft.finalized && draft.status !== 'discarded') {
              results.push(draft);
            }
            cur.continue();
          } else {
            resolve(results);
          }
        };
        cursor.onerror = () => reject(cursor.error);
      });
    });
  }

  function getDraft(sessionId) {
    if (!sessionId) return Promise.resolve(null);
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, 'readonly');
        const req = tx.objectStore(DRAFT_STORE_NAME).get(sessionId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    });
  }

  function deleteDraft(sessionId) {
    if (!sessionId) return Promise.resolve();
    return openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite');
        const req = tx.objectStore(DRAFT_STORE_NAME).delete(sessionId);
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      });
    });
  }

  global.HistoryStore = {
    save: saveRecord,
    list: listRecords,
    get: getRecord,
    delete: deleteRecord,
    clear: clearRecords,
    saveDraft,
    listDrafts,
    getDraft,
    deleteDraft,
    getStorageEstimate
  };

  requestPersistentStorage();
})(window);

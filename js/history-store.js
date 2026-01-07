// =====================================
// 会議履歴 IndexedDB ストア
// =====================================
(function(global) {
  const DB_NAME = 'aiMeetingHistory';
  const DB_VERSION = 1;
  const STORE_NAME = 'records';
  const MAX_RECORDS = 5;

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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function saveRecord(record) {
    if (!record || !record.id) {
      throw new Error('Invalid history record payload');
    }
    const db = await openDB();
    const now = new Date().toISOString();
    const payload = {
      createdAt: record.createdAt || now,
      ...record,
      updatedAt: now
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(payload);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });

    await enforceLimit(db);
  }

  async function enforceLimit(db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const total = countRequest.result || 0;
        const excess = total - MAX_RECORDS;
        if (excess <= 0) {
          resolve();
          return;
        }
        const index = store.index('createdAt');
        const cursorRequest = index.openCursor(null, 'next'); // oldest first
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

  global.HistoryStore = {
    save: saveRecord,
    list: listRecords,
    get: getRecord,
    delete: deleteRecord,
    clear: clearRecords
  };
})(window);

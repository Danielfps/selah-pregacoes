// IndexedDB: cache local das pregações, anexos (blobs), fila de sincronização e configurações.
const DB_NAME = 'selah';
const DB_VERSION = 1;
let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sermons')) {
        const s = db.createObjectStore('sermons', { keyPath: 'id' });
        s.createIndex('dateTime', 'dateTime');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('recChunks')) {
        const c = db.createObjectStore('recChunks', { keyPath: 'seq', autoIncrement: true });
        c.createIndex('recId', 'recId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('IndexedDB bloqueado por outra aba.');
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return reqP((await store(name)).get(key)); }
export async function getAll(name) { return reqP((await store(name)).getAll()); }
export async function put(name, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(value);
    tx.oncomplete = () => res(value);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
export async function del(name, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/**
 * Lê e altera um registro numa única transação (evita que o editor e a
 * sincronização sobrescrevam um ao outro). fn recebe o registro e pode
 * alterá-lo ou devolver um novo. Resolve com o registro salvo (ou null).
 */
export async function patch(name, key, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const st = tx.objectStore(name);
    let result = null;
    const r = st.get(key);
    r.onsuccess = () => {
      const cur = r.result;
      if (!cur) return;
      const next = fn(cur) || cur;
      result = next;
      st.put(next);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------- Pregações ----------
export const sermons = {
  all: () => getAll('sermons'),
  get: (id) => get('sermons', id),
  put: (s) => put('sermons', s),
  patch: (id, fn) => patch('sermons', id, fn),
  del: (id) => del('sermons', id),
};

// ---------- Anexos (blobs) ----------
export const blobs = {
  get: (id) => get('blobs', id),
  put: (id, blob) => put('blobs', { id, blob }),
  del: (id) => del('blobs', id),
  all: () => getAll('blobs'),
};

// ---------- Fila de sincronização ----------
// { id: sermonId, op: 'upsert' | 'delete', docId?, attachmentDriveIds?, at }
export const queue = {
  all: () => getAll('queue'),
  get: (id) => get('queue', id),
  add: (item) => put('queue', { at: Date.now(), ...item }),
  del: (id) => del('queue', id),
  /** Remove a entrada só se ela não foi re-enfileirada depois de `ts` (atômico). */
  async delIfOlder(id, ts) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('queue', 'readwrite');
      const st = tx.objectStore('queue');
      let removed = false;
      const r = st.get(id);
      r.onsuccess = () => { if (r.result && r.result.at < ts) { st.delete(id); removed = true; } };
      tx.oncomplete = () => res(removed);
      tx.onerror = () => rej(tx.error);
    });
  },
};

// ---------- Configurações ----------
export const settings = {
  async get(key, fallback) {
    const r = await get('settings', key);
    return r === undefined ? fallback : r.value;
  },
  set: (key, value) => put('settings', { key, value }),
  async all() {
    const rows = await getAll('settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};

// ---------- Pedaços de gravação de áudio (proteção contra perda) ----------
export const recChunks = {
  add: (recId, sermonId, mime, blob) => put('recChunks', { recId, sermonId, mime, blob, at: Date.now() }),
  async byRec(recId) {
    const db = await openDB();
    const idx = db.transaction('recChunks').objectStore('recChunks').index('recId');
    return reqP(idx.getAll(recId));
  },
  all: () => getAll('recChunks'),
  async delRec(recId) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('recChunks', 'readwrite');
      const idx = tx.objectStore('recChunks').index('recId');
      const r = idx.openCursor(IDBKeyRange.only(recId));
      r.onsuccess = () => { const c = r.result; if (c) { c.delete(); c.continue(); } };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

export async function clearAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const names = ['sermons', 'blobs', 'queue', 'recChunks'];
    const tx = db.transaction(names, 'readwrite');
    names.forEach((n) => tx.objectStore(n).clear());
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// Thin IndexedDB wrapper. No external deps — keeps the prototype lean.
// Callers are responsible for guarding against non-browser environments;
// the store layer above does that, this file does not.

const DB_NAME = "dots-memory";
const DB_VERSION = 1;

export const STORES = {
  memories: "memories",
  archives: "archives",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.memories)) {
        const s = db.createObjectStore(STORES.memories, { keyPath: "id" });
        s.createIndex("by_state", "state");
        s.createIndex("by_topic", "topic");
        s.createIndex("by_lastAccessed", "lastAccessedAt");
      }
      if (!db.objectStoreNames.contains(STORES.archives)) {
        const s = db.createObjectStore(STORES.archives, { keyPath: "id" });
        s.createIndex("by_granularity", "granularity");
        s.createIndex("by_window", "windowStart");
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("dots-memory: open blocked"));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return wrap(db.transaction(store, "readonly").objectStore(store).getAll());
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDB();
  return wrap(db.transaction(store, "readonly").objectStore(store).get(key));
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDB();
  await wrap(
    db
      .transaction(store, "readwrite")
      .objectStore(store)
      .put(value as object),
  );
}

// IDB transactions go inactive between microtasks, so bulk writes share a
// single transaction and resolve on `oncomplete` rather than per-request.
export async function bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  const objStore = tx.objectStore(store);
  for (const v of values) objStore.put(v as object);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function del(store: StoreName, key: string): Promise<void> {
  const db = await openDB();
  await wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
}

export async function clear(store: StoreName): Promise<void> {
  const db = await openDB();
  await wrap(db.transaction(store, "readwrite").objectStore(store).clear());
}

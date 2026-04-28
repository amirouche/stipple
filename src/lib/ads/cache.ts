// On-device ad cache. Ads are written to IndexedDB on app mount so a
// rotation server (in production) could swap inventory without the chat
// path needing a network call. v1 just mirrors the seed AD_DATA into the
// store — v2 would fetch GIF blobs and store them as Blob fields.

import { AD_DATA } from "./data";
import type { Ad } from "./types";

const DB_NAME = "dots-ads";
const DB_VERSION = 1;
const STORE = "ads";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("by_category", "category");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

let cached: Ad[] = [];
let hydrated = false;

export async function hydrateAdCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  if (typeof indexedDB === "undefined") {
    cached = [...AD_DATA];
    return;
  }

  try {
    const db = await openDB();
    // Seed/refresh the store. AD_DATA is the source of truth in v1; in v2
    // the rotation server would push and we'd diff against what's already
    // here.
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const ad of AD_DATA) store.put(ad);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const all = await new Promise<Ad[]>((res, rej) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result as Ad[]);
      req.onerror = () => rej(req.error);
    });
    cached = all;
  } catch (err) {
    console.error("[ads] hydrate failed, using in-memory data", err);
    cached = [...AD_DATA];
  }
}

export function getAds(): Ad[] {
  return cached;
}

export function getAdCount(): number {
  return cached.length;
}

// sessionStorage-based dismiss list — clears when the tab closes, which is
// the right scope: the same ad shouldn't keep popping up in this session,
// but tomorrow's session is fair game.
const DISMISS_KEY = "dots-ads-dismissed";

export function getDismissedAds(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((s): s is string => typeof s === "string"));
  } catch {
    return new Set();
  }
}

export function dismissAd(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  const set = getDismissedAds();
  set.add(id);
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch (err) {
    console.error("[ads] dismiss persist failed", err);
  }
}

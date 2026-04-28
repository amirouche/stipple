// On-device ad cache. Ads are written to IndexedDB on app mount so a
// rotation server (in production) could swap inventory without the chat
// path needing a network call. v1 just mirrors the seed AD_DATA into the
// store — v2 would fetch GIF blobs and store them as Blob fields.
//
// Stats (impressions, clicks) live in a separate IDB store so they survive
// reloads without being clobbered when AD_DATA seeds the ads store. They
// never leave the device — Settings can show them, the user can reset
// them, and that's it.

import { useSyncExternalStore } from "react";
import { AD_DATA } from "./data";
import type { Ad, AdStats } from "./types";

// IDB names live in the local browser only — adblockers don't read them —
// but renaming alongside the URL path keeps the codebase consistent and
// avoids confusion when debugging in DevTools.
const DB_NAME = "dots-promo";
const DB_VERSION = 2;
const ADS_STORE = "ads";
const STATS_STORE = "ad_stats";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ADS_STORE)) {
        const s = db.createObjectStore(ADS_STORE, { keyPath: "id" });
        s.createIndex("by_category", "category");
      }
      if (!db.objectStoreNames.contains(STATS_STORE)) {
        db.createObjectStore(STATS_STORE, { keyPath: "adId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

let cached: Ad[] = [];
let stats = new Map<string, AdStats>();
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export async function hydrateAdCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  if (typeof indexedDB === "undefined") {
    cached = [...AD_DATA];
    return;
  }

  try {
    const db = await openDB();

    // Seed/refresh the ads store. AD_DATA is the source of truth in v1; in
    // v2 the rotation server would push and we'd diff against what's
    // already here.
    const tx = db.transaction(ADS_STORE, "readwrite");
    const store = tx.objectStore(ADS_STORE);
    for (const ad of AD_DATA) store.put(ad);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    cached = await new Promise<Ad[]>((res, rej) => {
      const req = db.transaction(ADS_STORE, "readonly").objectStore(ADS_STORE).getAll();
      req.onsuccess = () => res(req.result as Ad[]);
      req.onerror = () => rej(req.error);
    });

    const persistedStats = await new Promise<AdStats[]>((res, rej) => {
      const req = db.transaction(STATS_STORE, "readonly").objectStore(STATS_STORE).getAll();
      req.onsuccess = () => res(req.result as AdStats[]);
      req.onerror = () => rej(req.error);
    });
    stats = new Map(persistedStats.map((s) => [s.adId, s]));
    emit();
  } catch (err) {
    console.error("[ads] hydrate failed, using in-memory data", err);
    cached = [...AD_DATA];
    emit();
  }
}

export function getAds(): Ad[] {
  return cached;
}

export function getAdCount(): number {
  return cached.length;
}

// ---------------------------------------------------------------------------
// Stats — impressions, clicks, reset.
// ---------------------------------------------------------------------------

function statsFor(adId: string): AdStats {
  return stats.get(adId) ?? { adId, impressions: 0, clicks: 0 };
}

async function persistStats(record: AdStats): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    const tx = db.transaction(STATS_STORE, "readwrite");
    tx.objectStore(STATS_STORE).put(record);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.error("[ads] persistStats failed", err);
  }
}

function writeStats(next: AdStats): void {
  // Allocate a fresh Map so useSyncExternalStore's Object.is check fires.
  // Mutating in place would skip the re-render and leave Settings stale.
  const updated = new Map(stats);
  updated.set(next.adId, next);
  stats = updated;
  emit();
  void persistStats(next);
}

export function recordImpression(adId: string): void {
  const cur = statsFor(adId);
  writeStats({
    ...cur,
    impressions: cur.impressions + 1,
    lastImpressionAt: Date.now(),
  });
}

export function recordClick(adId: string): void {
  const cur = statsFor(adId);
  writeStats({ ...cur, clicks: cur.clicks + 1 });
}

export function getAdStats(): AdStats[] {
  return Array.from(stats.values());
}

export function getAdStatFor(adId: string): AdStats {
  return statsFor(adId);
}

export async function resetAdStats(): Promise<void> {
  stats = new Map();
  emit();
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    const tx = db.transaction(STATS_STORE, "readwrite");
    tx.objectStore(STATS_STORE).clear();
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.error("[ads] resetAdStats failed", err);
  }
}

// React subscription so Settings can render live counts. The Map reference
// is replaced on every write (see writeStats), so getSnapshot returns a
// fresh value when stats change.
export function useAdStats(): Map<string, AdStats> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => stats,
    () => stats,
  );
}

// ---------------------------------------------------------------------------
// Dismiss list — sessionStorage scope. The same ad shouldn't keep popping
// up in this session, but tomorrow's session is fair game.
// ---------------------------------------------------------------------------

const DISMISS_KEY = "dots-promo-dismissed";

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

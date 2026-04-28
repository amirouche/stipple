// On-device pitch cache. Pitches are written to IndexedDB on app mount so
// a rotation server (in production) could swap inventory without the chat
// path needing a network call. v1 just mirrors the seed PITCH_DATA into
// the store — v2 would fetch GIF blobs and store them as Blob fields.
//
// Stats (views, taps) live in a separate IDB store so they survive reloads
// without being clobbered when PITCH_DATA seeds the pitches store. They
// never leave the device — Settings can show them, the user can reset
// them, and that's it.

import { useSyncExternalStore } from "react";
import { PITCH_DATA } from "./data";
import type { Pitch, PitchStats } from "./types";

// IDB names live in the local browser only — adblockers don't read them —
// but renaming alongside the URL path keeps the codebase consistent and
// avoids confusion when debugging in DevTools.
const DB_NAME = "dots-pitch";
const DB_VERSION = 2;
const PITCH_STORE = "pitches";
const STATS_STORE = "pitch_stats";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PITCH_STORE)) {
        const s = db.createObjectStore(PITCH_STORE, { keyPath: "id" });
        s.createIndex("by_category", "category");
      }
      if (!db.objectStoreNames.contains(STATS_STORE)) {
        db.createObjectStore(STATS_STORE, { keyPath: "pitchId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

let cached: Pitch[] = [];
let stats = new Map<string, PitchStats>();
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export async function hydratePitchCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  if (typeof indexedDB === "undefined") {
    cached = [...PITCH_DATA];
    return;
  }

  try {
    const db = await openDB();

    // Seed/refresh the pitches store. PITCH_DATA is the source of truth in
    // v1; in v2 the rotation server would push and we'd diff against
    // what's already here.
    const tx = db.transaction(PITCH_STORE, "readwrite");
    const store = tx.objectStore(PITCH_STORE);
    for (const p of PITCH_DATA) store.put(p);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    cached = await new Promise<Pitch[]>((res, rej) => {
      const req = db.transaction(PITCH_STORE, "readonly").objectStore(PITCH_STORE).getAll();
      req.onsuccess = () => res(req.result as Pitch[]);
      req.onerror = () => rej(req.error);
    });

    const persistedStats = await new Promise<PitchStats[]>((res, rej) => {
      const req = db.transaction(STATS_STORE, "readonly").objectStore(STATS_STORE).getAll();
      req.onsuccess = () => res(req.result as PitchStats[]);
      req.onerror = () => rej(req.error);
    });
    stats = new Map(persistedStats.map((s) => [s.pitchId, s]));
    emit();
  } catch (err) {
    console.error("[pitch] hydrate failed, using in-memory data", err);
    cached = [...PITCH_DATA];
    emit();
  }
}

export function getPitches(): Pitch[] {
  return cached;
}

export function getPitchCount(): number {
  return cached.length;
}

// ---------------------------------------------------------------------------
// Stats — views, taps, reset.
// ---------------------------------------------------------------------------

function statsFor(pitchId: string): PitchStats {
  return stats.get(pitchId) ?? { pitchId, views: 0, taps: 0 };
}

async function persistStats(record: PitchStats): Promise<void> {
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
    console.error("[pitch] persistStats failed", err);
  }
}

function writeStats(next: PitchStats): void {
  // Allocate a fresh Map so useSyncExternalStore's Object.is check fires.
  // Mutating in place would skip the re-render and leave Settings stale.
  const updated = new Map(stats);
  updated.set(next.pitchId, next);
  stats = updated;
  emit();
  void persistStats(next);
}

export function recordView(pitchId: string): void {
  const cur = statsFor(pitchId);
  writeStats({
    ...cur,
    views: cur.views + 1,
    lastViewAt: Date.now(),
  });
}

export function recordTap(pitchId: string): void {
  const cur = statsFor(pitchId);
  writeStats({ ...cur, taps: cur.taps + 1 });
}

export function getPitchStats(): PitchStats[] {
  return Array.from(stats.values());
}

export function getPitchStatFor(pitchId: string): PitchStats {
  return statsFor(pitchId);
}

export async function resetPitchStats(): Promise<void> {
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
    console.error("[pitch] resetPitchStats failed", err);
  }
}

// React subscription so Settings can render live counts. The Map reference
// is replaced on every write (see writeStats), so getSnapshot returns a
// fresh value when stats change.
export function usePitchStats(): Map<string, PitchStats> {
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
// Dismiss list — sessionStorage scope. The same pitch shouldn't keep
// popping up in this session, but tomorrow's session is fair game.
// ---------------------------------------------------------------------------

const DISMISS_KEY = "dots-pitch-dismissed";

export function getDismissedPitches(): Set<string> {
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

export function dismissPitch(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  const set = getDismissedPitches();
  set.add(id);
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch (err) {
    console.error("[pitch] dismiss persist failed", err);
  }
}

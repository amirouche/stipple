// Learned-response store. Phase A backs by localStorage (5MB cap is
// plenty for ~1000 entries at ~5KB each, well past Phase A demo needs).
// Phase B/C may migrate to IndexedDB; the API is async so callers won't
// have to change.
//
// Sync read path: keep an in-memory cache, populated on hydrateLearned().
// Writes go through localStorage and update the cache. Module-level state
// + listener Set, mirroring conversation-store / user-store patterns.

import type { LearnedResponse } from "./types";

const STORAGE_KEY = "dots:learned-responses";

let cache: LearnedResponse[] = [];
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Quota or serialization failures — log but don't throw. Phase A
    // demos should not crash because the cache filled up.
    console.warn("[learning] persist failed:", err);
  }
}

export function hydrateLearned(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LearnedResponse[];
    if (Array.isArray(parsed)) {
      cache = parsed;
      emit();
    }
  } catch (err) {
    console.warn("[learning] hydrate failed:", err);
  }
}

// Synchronous snapshot for hot paths (matchLearnedResponse runs on every
// user send and must not await). Async wrappers below are still kept for
// the IndexedDB migration story.
export function getLearnedSnapshot(): LearnedResponse[] {
  return cache;
}

export async function getAllLearned(): Promise<LearnedResponse[]> {
  return cache;
}

export async function saveLearned(entry: LearnedResponse): Promise<void> {
  cache = [...cache, entry];
  persist();
  emit();
}

export async function deleteLearned(id: string): Promise<void> {
  const next = cache.filter((e) => e.id !== id);
  if (next.length === cache.length) return;
  cache = next;
  persist();
  emit();
}

export async function incrementUsedCount(id: string): Promise<void> {
  let changed = false;
  cache = cache.map((e) => {
    if (e.id !== id) return e;
    changed = true;
    return { ...e, usedCount: e.usedCount + 1 };
  });
  if (changed) {
    persist();
    emit();
  }
}

export async function clearLearned(): Promise<void> {
  cache = [];
  persist();
  emit();
}

export function subscribeLearned(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

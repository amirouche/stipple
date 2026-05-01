// In-memory hot layer over IndexedDB. Same useSyncExternalStore pattern as
// conversation-store.ts so the rest of the codebase reads it the same way.
//
// Hydration is explicit: callers (the root route) must invoke
// `hydrateMemoryStore()` once on mount. We don't auto-trigger from module
// load because package.json sets `"sideEffects": false`, which means the
// bundler may strip side-effect imports.

import { useSyncExternalStore } from "react";
import * as persistence from "./persistence";
import type { ArchiveEntry, ConversationSummary, MemoryRecord } from "./types";

type MemoryStoreState = {
  memories: MemoryRecord[];
  archives: ArchiveEntry[];
  // V5.0 Phase M-1: thread-level summaries. 보통 thread당 0-1개. 전체 cap
  // 없음 (사용자가 thread 많이 만들면 자연 증가) — 향후 필요시 prune.
  summaries: ConversationSummary[];
  hydrated: boolean;
};

let state: MemoryStoreState = {
  memories: [],
  archives: [],
  summaries: [],
  hydrated: false,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

let hydrationPromise: Promise<void> | null = null;

export function hydrateMemoryStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  if (typeof indexedDB === "undefined") {
    state = { ...state, hydrated: true };
    emit();
    return Promise.resolve();
  }
  hydrationPromise = (async () => {
    try {
      const [memories, archives, summaries] = await Promise.all([
        persistence.getAll<MemoryRecord>(persistence.STORES.memories),
        persistence.getAll<ArchiveEntry>(persistence.STORES.archives),
        persistence.getAll<ConversationSummary>(persistence.STORES.summaries),
      ]);
      state = { memories, archives, summaries, hydrated: true };
      emit();
    } catch (err) {
      console.error("[memory] hydrate failed", err);
      state = { ...state, hydrated: true };
      emit();
    }
  })();
  return hydrationPromise;
}

export function rehydrateMemoryStore(): Promise<void> {
  hydrationPromise = null;
  return hydrateMemoryStore();
}

export function useMemoryStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

export function getMemorySnapshot(): MemoryStoreState {
  return state;
}

export function putMemory(rec: MemoryRecord): void {
  const next = state.memories.filter((m) => m.id !== rec.id);
  next.push(rec);
  state = { ...state, memories: next };
  emit();
  persistence.put(persistence.STORES.memories, rec).catch((err) => {
    console.error("[memory] put failed", err);
  });
}

export function deleteMemory(id: string): void {
  state = {
    ...state,
    memories: state.memories.filter((m) => m.id !== id),
  };
  emit();
  persistence.del(persistence.STORES.memories, id).catch((err) => {
    console.error("[memory] delete failed", err);
  });
}

export async function clearMemories(): Promise<void> {
  state = { ...state, memories: [] };
  emit();
  await persistence.clear(persistence.STORES.memories);
}

export function putArchive(entry: ArchiveEntry): void {
  const next = state.archives.filter((a) => a.id !== entry.id);
  next.push(entry);
  state = { ...state, archives: next };
  emit();
  persistence.put(persistence.STORES.archives, entry).catch((err) => {
    console.error("[memory] putArchive failed", err);
  });
}

export function deleteArchive(id: string): void {
  state = {
    ...state,
    archives: state.archives.filter((a) => a.id !== id),
  };
  emit();
  persistence.del(persistence.STORES.archives, id).catch((err) => {
    console.error("[memory] deleteArchive failed", err);
  });
}

export async function clearArchives(): Promise<void> {
  state = { ...state, archives: [] };
  emit();
  await persistence.clear(persistence.STORES.archives);
}

export async function clearAll(): Promise<void> {
  state = { ...state, memories: [], archives: [], summaries: [] };
  emit();
  await Promise.all([
    persistence.clear(persistence.STORES.memories),
    persistence.clear(persistence.STORES.archives),
    persistence.clear(persistence.STORES.summaries),
  ]);
}

// V5.0 Phase M-1: summary store ops. id = `summary-${threadId}` 형식이라
// 같은 thread에 putSummary 두 번이면 자동 supersede (재요약).
export function putSummary(rec: ConversationSummary): void {
  const next = state.summaries.filter((s) => s.id !== rec.id);
  next.push(rec);
  state = { ...state, summaries: next };
  emit();
  persistence.put(persistence.STORES.summaries, rec).catch((err) => {
    console.error("[memory] putSummary failed", err);
  });
}

export function getSummaryForThread(threadId: string): ConversationSummary | undefined {
  return state.summaries.find((s) => s.threadId === threadId);
}

export function deleteSummary(id: string): void {
  state = {
    ...state,
    summaries: state.summaries.filter((s) => s.id !== id),
  };
  emit();
  persistence.del(persistence.STORES.summaries, id).catch((err) => {
    console.error("[memory] deleteSummary failed", err);
  });
}

export async function clearSummaries(): Promise<void> {
  state = { ...state, summaries: [] };
  emit();
  await persistence.clear(persistence.STORES.summaries);
}

// Dev verification handle lives in `./debug` to avoid importing capture/promote
// here (would create a cycle: store → capture → store).

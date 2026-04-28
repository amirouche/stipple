// In-memory hot layer over IndexedDB. Same useSyncExternalStore pattern as
// conversation-store.ts so the rest of the codebase reads it the same way.
//
// Hydration is explicit: callers (the root route) must invoke
// `hydrateMemoryStore()` once on mount. We don't auto-trigger from module
// load because package.json sets `"sideEffects": false`, which means the
// bundler may strip side-effect imports.

import { useSyncExternalStore } from "react";
import * as persistence from "./persistence";
import type { MemoryRecord } from "./types";

type MemoryStoreState = {
  memories: MemoryRecord[];
  hydrated: boolean;
};

let state: MemoryStoreState = {
  memories: [],
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
      const memories = await persistence.getAll<MemoryRecord>(persistence.STORES.memories);
      state = { memories, hydrated: true };
      emit();
    } catch (err) {
      console.error("[memory] hydrate failed", err);
      state = { ...state, hydrated: true };
      emit();
    }
    attachDebugHandle();
  })();
  return hydrationPromise;
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

// ---- Dev verification handle ----------------------------------------------
// Exposes the store on `window.__dotsMemory` in dev so we can manually
// put/snapshot/refresh during stage-1 verification. Stripped in production.

declare global {
  interface Window {
    __dotsMemory?: {
      put: typeof putMemory;
      delete: typeof deleteMemory;
      clear: typeof clearMemories;
      snapshot: typeof getMemorySnapshot;
      rehydrate: () => Promise<void>;
    };
  }
}

function attachDebugHandle() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.DEV) return;
  window.__dotsMemory = {
    put: putMemory,
    delete: deleteMemory,
    clear: clearMemories,
    snapshot: getMemorySnapshot,
    rehydrate: () => {
      hydrationPromise = null;
      return hydrateMemoryStore();
    },
  };
}

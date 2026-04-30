// EmbeddingStatus 스토어. WebLLM 스토어와 같은 패턴 — module-level state
// + listener Set + useSyncExternalStore. UI는 이 store만 구독한다.
//
// engine.ts가 setStatus를 통해 상태를 갱신하고, embedding/index.ts의
// public API들이 이 store를 읽는다.

import { useSyncExternalStore } from "react";

import type { EmbeddingStatus } from "./types";

let status: EmbeddingStatus = { state: "idle" };

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}

export function getEmbeddingStatusSnapshot(): EmbeddingStatus {
  return status;
}

export function setEmbeddingStatus(updater: (prev: EmbeddingStatus) => EmbeddingStatus): void {
  status = updater(status);
  emit();
}

export function useEmbeddingStatus(): EmbeddingStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

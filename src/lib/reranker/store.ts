// RerankerStatus 스토어. embedding/store.ts와 동일 패턴.

import { useSyncExternalStore } from "react";

import type { RerankerStatus } from "./types";

let status: RerankerStatus = { state: "idle" };

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}

export function getRerankerStatusSnapshot(): RerankerStatus {
  return status;
}

export function setRerankerStatus(updater: (prev: RerankerStatus) => RerankerStatus): void {
  status = updater(status);
  emit();
}

export function useRerankerStatus(): RerankerStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

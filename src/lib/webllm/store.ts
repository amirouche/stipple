// WebLLMStatus store. Same shape as the other DOTS stores
// (conversation-store.ts, user-store.ts) — module-level mutable state +
// listener Set + useSyncExternalStore subscription.
//
// Single global engine: WebLLM holds ~2GB of GPU/RAM state per model;
// having more than one instance would just multiply that. The active
// engine reference lives next to the status here so consumers don't
// need a parallel singleton elsewhere.

import { useSyncExternalStore } from "react";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";

import type { WebLLMStatus } from "./types";

let status: WebLLMStatus = { state: "idle" };
let engine: WebWorkerMLCEngine | null = null;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function getStatusSnapshot(): WebLLMStatus {
  return status;
}

export function setStatus(updater: (prev: WebLLMStatus) => WebLLMStatus): void {
  status = updater(status);
  emit();
}

export function getEngineRef(): WebWorkerMLCEngine | null {
  return engine;
}

export function setEngineRef(next: WebWorkerMLCEngine | null): void {
  engine = next;
}

export function useWebLLMStatus(): WebLLMStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

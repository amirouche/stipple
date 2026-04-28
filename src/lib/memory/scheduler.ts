// Periodic memory sweep — decay now, archive in stage 4.
//
// Trigger policy: tick on app mount and on visibilitychange when the page
// becomes visible. No setInterval — the realistic case is "user opens the
// app or comes back to it"; a tab open for weeks without focus changes is
// fine to miss in v1. registerScheduler() is idempotent so it's safe to
// call from multiple effects or HMR re-runs.

import { decay } from "./decay";
import * as persistence from "./persistence";
import { getMemorySnapshot, putMemory } from "./store";

export const SCHEDULER_META_KEY = "scheduler.lastTickAt";

export type SchedulerReport = {
  decayed: number;
  total: number;
  at: number;
};

export function tickScheduler(now: number = Date.now()): SchedulerReport {
  const snap = getMemorySnapshot();
  let decayed = 0;
  for (const rec of snap.memories) {
    const next = decay(rec, now);
    if (next !== rec) {
      putMemory(next);
      decayed++;
    }
  }
  persistence
    .put(persistence.STORES.meta, {
      key: SCHEDULER_META_KEY,
      value: now,
      updatedAt: now,
    })
    .catch((err) => console.error("[scheduler] meta write failed", err));
  return { decayed, total: snap.memories.length, at: now };
}

let registered = false;

export function registerScheduler(): void {
  if (registered) return;
  if (typeof document === "undefined") return;
  registered = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tickScheduler();
    }
  });
}

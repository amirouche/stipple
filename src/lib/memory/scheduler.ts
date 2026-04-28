// Periodic memory sweep — decay → archive cascade.
//
// Trigger policy: tick on app mount and on visibilitychange when the page
// becomes visible. No setInterval — the realistic case is "user opens the
// app or comes back to it"; a tab open for weeks without focus changes is
// fine to miss in v1. registerScheduler() is idempotent so it's safe to
// call from multiple effects or HMR re-runs.
//
// Phases must run in order: decay first (so newly-dormant records can be
// considered for archive in the same tick if they're already 30d+ old —
// edge case but possible), then archive (dormant→archived + rollups).

import { archiveTick } from "./archive";
import { decay } from "./decay";
import * as persistence from "./persistence";
import { deleteArchive, getMemorySnapshot, putArchive, putMemory } from "./store";

export const SCHEDULER_META_KEY = "scheduler.lastTickAt";

export type SchedulerReport = {
  decayed: number;
  archived: number;
  rolled: number;
  total: number;
  at: number;
};

export function tickScheduler(now: number = Date.now()): SchedulerReport {
  // Phase 1: decay (temporary→dormant, active→dormant).
  let decayed = 0;
  for (const rec of getMemorySnapshot().memories) {
    const next = decay(rec, now);
    if (next !== rec) {
      putMemory(next);
      decayed++;
    }
  }

  // Phase 2: archive (dormant→archived + cascade rollups).
  // Re-snapshot since decay phase mutated state.
  const snap = getMemorySnapshot();
  const result = archiveTick(snap.memories, snap.archives, now);
  for (const rec of result.updatedRecords) putMemory(rec);
  for (const arc of result.upsertedArchives) putArchive(arc);
  for (const id of result.deletedArchiveIds) deleteArchive(id);

  persistence
    .put(persistence.STORES.meta, {
      key: SCHEDULER_META_KEY,
      value: now,
      updatedAt: now,
    })
    .catch((err) => console.error("[scheduler] meta write failed", err));

  return {
    decayed,
    archived: result.archivedCount,
    rolled: result.rolledCount,
    total: snap.memories.length,
    at: now,
  };
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

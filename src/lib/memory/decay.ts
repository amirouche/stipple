// Stages 3+4 — both active and temporary records decay to dormant after a
// period of no access. Temporary decays faster (7d) since unconfirmed signals
// shouldn't sit around indefinitely; the dormant→archive sweep then handles
// them in stage 4. Pure function so the scheduler can drive it without
// coupling. `now` is injectable so tests can simulate time.

import type { MemoryRecord } from "./types";

const DAY_MS = 86_400_000;

export const DECAY_THRESHOLDS = {
  activeToDormantDays: 14,
  temporaryToDormantDays: 7,
} as const;

export function shouldDecayToDormant(rec: MemoryRecord, now: number = Date.now()): boolean {
  const ageMs = now - rec.lastAccessedAt;
  if (rec.state === "active") {
    return ageMs >= DECAY_THRESHOLDS.activeToDormantDays * DAY_MS;
  }
  if (rec.state === "temporary") {
    return ageMs >= DECAY_THRESHOLDS.temporaryToDormantDays * DAY_MS;
  }
  return false;
}

export function decay(rec: MemoryRecord, now: number = Date.now()): MemoryRecord {
  if (!shouldDecayToDormant(rec, now)) return rec;
  return { ...rec, state: "dormant" };
}

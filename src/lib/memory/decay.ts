// Stage 3 — active → dormant after a period of no access.
//
// Pure function so the scheduler can drive it without coupling. `now` is
// injectable so tests can simulate time without messing with Date.

import type { MemoryRecord } from "./types";

const DAY_MS = 86_400_000;

export const DECAY_THRESHOLDS = {
  activeToDormantDays: 14,
} as const;

export function shouldDecayToDormant(rec: MemoryRecord, now: number = Date.now()): boolean {
  if (rec.state !== "active") return false;
  const ageMs = now - rec.lastAccessedAt;
  return ageMs >= DECAY_THRESHOLDS.activeToDormantDays * DAY_MS;
}

export function decay(rec: MemoryRecord, now: number = Date.now()): MemoryRecord {
  if (!shouldDecayToDormant(rec, now)) return rec;
  return { ...rec, state: "dormant" };
}

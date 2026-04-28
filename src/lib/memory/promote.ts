// Stage 2 — temporary → active promotion.
//
// Only `temporary` records are eligible. Repetition (accessCount) and
// emotion (emotionScore) are independent triggers — either alone will
// promote. Thresholds live here so they're easy to tune from one place
// when we calibrate against real usage.

import type { MemoryRecord } from "./types";

export const PROMOTION_THRESHOLDS = {
  accessCount: 3,
  emotionScore: 0.5,
} as const;

export function shouldPromote(rec: MemoryRecord): boolean {
  if (rec.state !== "temporary") return false;
  return (
    rec.accessCount >= PROMOTION_THRESHOLDS.accessCount ||
    rec.emotionScore >= PROMOTION_THRESHOLDS.emotionScore
  );
}

export function promote(rec: MemoryRecord): MemoryRecord {
  if (!shouldPromote(rec)) return rec;
  return { ...rec, state: "active" };
}

// Calendar bucket math, UTC. Used by archive rollups so day/week/month/etc.
// boundaries are deterministic and don't drift with the user's timezone or DST.
//
// Week is ISO-week-ish: Monday start, Sunday end. Sunday=0 is normalized to 7
// so the (dow - 1) offset always lands on Monday.

import type { ArchiveGranularity } from "./types";

const DAY_MS = 86_400_000;

export type Window = { start: number; end: number };

export function dayBucket(ts: number): Window {
  const d = new Date(ts);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { start, end: start + DAY_MS };
}

export function weekBucket(ts: number): Window {
  const d = new Date(ts);
  const dow = d.getUTCDay() || 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (dow - 1));
  return { start: monday, end: monday + 7 * DAY_MS };
}

export function monthBucket(ts: number): Window {
  const d = new Date(ts);
  return {
    start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  };
}

export function quarterBucket(ts: number): Window {
  const d = new Date(ts);
  const qStart = Math.floor(d.getUTCMonth() / 3) * 3;
  return {
    start: Date.UTC(d.getUTCFullYear(), qStart, 1),
    end: Date.UTC(d.getUTCFullYear(), qStart + 3, 1),
  };
}

export function yearBucket(ts: number): Window {
  const d = new Date(ts);
  return {
    start: Date.UTC(d.getUTCFullYear(), 0, 1),
    end: Date.UTC(d.getUTCFullYear() + 1, 0, 1),
  };
}

export function bucketFor(g: ArchiveGranularity, ts: number): Window {
  switch (g) {
    case "day":
      return dayBucket(ts);
    case "week":
      return weekBucket(ts);
    case "month":
      return monthBucket(ts);
    case "quarter":
      return quarterBucket(ts);
    case "year":
      return yearBucket(ts);
  }
}

export function parentGranularity(g: ArchiveGranularity): ArchiveGranularity | null {
  switch (g) {
    case "day":
      return "week";
    case "week":
      return "month";
    case "month":
      return "quarter";
    case "quarter":
      return "year";
    case "year":
      return null;
  }
}

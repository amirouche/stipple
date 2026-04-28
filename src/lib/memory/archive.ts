// Stage 4 — dormant → archived, then cascade roll-ups (day → week → month →
// quarter → year). Pure function: takes records + archives + now, returns
// the deltas the scheduler should apply via store mutators.
//
// Compaction is intentionally simple for v1: topic counts sum, source ids
// union, calendar window metadata. No AI calls. v2 can add summarization.

import type { ArchiveEntry, ArchiveGranularity, MemoryRecord } from "./types";
import { type Window, bucketFor, parentGranularity } from "./windows";

const DAY_MS = 86_400_000;

export const ARCHIVE_THRESHOLDS = {
  dormantToArchiveDays: 30,
} as const;

export function shouldArchiveDormant(rec: MemoryRecord, now: number = Date.now()): boolean {
  if (rec.state !== "dormant") return false;
  return now - rec.lastAccessedAt >= ARCHIVE_THRESHOLDS.dormantToArchiveDays * DAY_MS;
}

export function archiveId(granularity: ArchiveGranularity, windowStart: number): string {
  return `archive:${granularity}:${windowStart}`;
}

export type ArchiveTickResult = {
  // Records whose state flipped dormant → archived. Caller writes via putMemory.
  updatedRecords: MemoryRecord[];
  // Archive entries to persist (new or merged).
  upsertedArchives: ArchiveEntry[];
  // Pre-existing archive ids that were consumed by a rollup. Caller deletes.
  deletedArchiveIds: string[];
  archivedCount: number;
  rolledCount: number;
};

type Contribution = {
  topics: { topic: string; count: number }[];
  sourceMemoryIds: string[];
};

function mergeIntoArchive(
  existing: ArchiveEntry | undefined,
  granularity: ArchiveGranularity,
  window: Window,
  contributions: Contribution[],
  now: number,
): ArchiveEntry {
  const topicCounts = new Map<string, number>();
  const ids = new Set<string>();

  if (existing) {
    for (const t of existing.topics) topicCounts.set(t.topic, t.count);
    for (const id of existing.sourceMemoryIds) ids.add(id);
  }
  for (const c of contributions) {
    for (const t of c.topics) {
      topicCounts.set(t.topic, (topicCounts.get(t.topic) ?? 0) + t.count);
    }
    for (const id of c.sourceMemoryIds) ids.add(id);
  }

  return {
    id: archiveId(granularity, window.start),
    granularity,
    windowStart: window.start,
    windowEnd: window.end,
    topics: Array.from(topicCounts.entries()).map(([topic, count]) => ({
      topic,
      count,
    })),
    sourceMemoryIds: Array.from(ids),
    createdAt: existing?.createdAt ?? now,
  };
}

export function archiveTick(
  records: MemoryRecord[],
  archives: ArchiveEntry[],
  now: number = Date.now(),
): ArchiveTickResult {
  const updatedRecords: MemoryRecord[] = [];
  const dailyContribsByWindow = new Map<number, MemoryRecord[]>();

  // ---- Phase 1: dormant → archived. Each becomes a daily contribution. ----
  for (const rec of records) {
    if (!shouldArchiveDormant(rec, now)) continue;
    const day = bucketFor("day", rec.lastAccessedAt);
    const list = dailyContribsByWindow.get(day.start) ?? [];
    list.push(rec);
    dailyContribsByWindow.set(day.start, list);
    updatedRecords.push({ ...rec, state: "archived" });
  }
  const archivedCount = updatedRecords.length;

  // Working maps. `allArchives` is the live view that includes both pre-existing
  // and just-upserted entries — rollups read from it. `upsertedById` is what
  // we'll hand back to the caller for persistence. `deletedArchiveIds` is what
  // existed before this tick and got consumed.
  const archivesById = new Map(archives.map((a) => [a.id, a]));
  const allArchives = new Map(archivesById);
  const upsertedById = new Map<string, ArchiveEntry>();
  const deletedArchiveIds: string[] = [];

  for (const [windowStart, recs] of dailyContribsByWindow) {
    const id = archiveId("day", windowStart);
    const merged = mergeIntoArchive(
      allArchives.get(id),
      "day",
      bucketFor("day", windowStart),
      recs.map((r) => ({
        topics: [{ topic: r.topic, count: r.accessCount }],
        sourceMemoryIds: [r.id],
      })),
      now,
    );
    allArchives.set(id, merged);
    upsertedById.set(id, merged);
  }

  // ---- Phase 2: cascade rollups. ----
  // Each iteration handles one granularity. Children whose parent calendar
  // bucket has ended get grouped under that parent and merged. Iterating in
  // order means a daily entry can flow all the way up to yearly in one tick.
  let rolledCount = 0;
  const granularitiesToRoll: ArchiveGranularity[] = ["day", "week", "month", "quarter"];

  for (const g of granularitiesToRoll) {
    const parentG = parentGranularity(g);
    if (!parentG) continue;

    const eligible = Array.from(allArchives.values()).filter((a) => {
      if (a.granularity !== g) return false;
      const parent = bucketFor(parentG, a.windowStart);
      return now >= parent.end;
    });
    if (eligible.length === 0) continue;

    const groups = new Map<number, ArchiveEntry[]>();
    for (const child of eligible) {
      const parentStart = bucketFor(parentG, child.windowStart).start;
      const list = groups.get(parentStart) ?? [];
      list.push(child);
      groups.set(parentStart, list);
    }

    for (const [parentStart, children] of groups) {
      const parentId = archiveId(parentG, parentStart);
      const merged = mergeIntoArchive(
        allArchives.get(parentId),
        parentG,
        bucketFor(parentG, parentStart),
        children.map((c) => ({
          topics: c.topics,
          sourceMemoryIds: c.sourceMemoryIds,
        })),
        now,
      );
      allArchives.set(parentId, merged);
      upsertedById.set(parentId, merged);

      for (const child of children) {
        allArchives.delete(child.id);
        if (upsertedById.has(child.id)) {
          // Child was created earlier in this tick and never persisted —
          // discard rather than queueing a deletion for a row that never existed.
          upsertedById.delete(child.id);
        } else {
          deletedArchiveIds.push(child.id);
        }
        rolledCount++;
      }
    }
  }

  return {
    updatedRecords,
    upsertedArchives: Array.from(upsertedById.values()),
    deletedArchiveIds,
    archivedCount,
    rolledCount,
  };
}

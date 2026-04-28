// Stage 5 — local-first lookup over the memory + archive layers.
//
// Routing decisions consult this before considering a "deep" (external) call:
// if local has anything relevant, we stay local. The score is intentionally
// simple — state weight for memories, granularity weight for archives. We do
// NOT factor in accessCount or emotionScore here because those already drive
// promotion in stage 2; folding them in again would double-count signals.
//
// Side effect: dormant matches get woken to active (state + lastAccessedAt).
// Disable via `wakeDormant: false` for read-only probes.

import { getMemorySnapshot, putMemory } from "./store";
import { extractTopics } from "./topics";
import type { ArchiveEntry, ArchiveGranularity, MemoryRecord, MemoryState } from "./types";

export const STATE_WEIGHTS: Record<MemoryState, number> = {
  active: 1.0,
  dormant: 0.7,
  temporary: 0.5,
  // archived records are matched via the archives collection, not directly.
  archived: 0,
};

export const GRANULARITY_WEIGHTS: Record<ArchiveGranularity, number> = {
  day: 0.5,
  week: 0.4,
  month: 0.3,
  quarter: 0.2,
  year: 0.1,
};

export type MemoryMatch = {
  record: MemoryRecord;
  matchedTopics: string[];
  weight: number;
  score: number;
};

export type ArchiveMatch = {
  entry: ArchiveEntry;
  matchedTopics: { topic: string; count: number }[];
  weight: number;
  score: number;
};

export type LookupResult = {
  query: string;
  topics: string[];
  memoryMatches: MemoryMatch[];
  archiveMatches: ArchiveMatch[];
  totalScore: number;
};

export type LookupOpts = {
  wakeDormant?: boolean;
};

export function lookupMemory(query: string, opts: LookupOpts = {}): LookupResult {
  const wakeDormant = opts.wakeDormant ?? true;
  const topics = extractTopics(query);

  if (topics.length === 0) {
    return {
      query,
      topics: [],
      memoryMatches: [],
      archiveMatches: [],
      totalScore: 0,
    };
  }

  const topicSet = new Set(topics);
  const snap = getMemorySnapshot();
  const now = Date.now();

  const memoryMatches: MemoryMatch[] = [];
  for (const rec of snap.memories) {
    if (!topicSet.has(rec.topic)) continue;
    const weight = STATE_WEIGHTS[rec.state];
    if (weight === 0) continue;
    memoryMatches.push({
      record: rec,
      matchedTopics: [rec.topic],
      weight,
      score: weight,
    });
  }

  const archiveMatches: ArchiveMatch[] = [];
  for (const entry of snap.archives) {
    const matched = entry.topics.filter((t) => topicSet.has(t.topic));
    if (matched.length === 0) continue;
    const weight = GRANULARITY_WEIGHTS[entry.granularity];
    archiveMatches.push({
      entry,
      matchedTopics: matched,
      weight,
      score: weight,
    });
  }

  // Score desc; ties → most recent first.
  memoryMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.record.lastAccessedAt - a.record.lastAccessedAt;
  });
  archiveMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.windowStart - a.entry.windowStart;
  });

  if (wakeDormant) {
    for (const m of memoryMatches) {
      if (m.record.state !== "dormant") continue;
      putMemory({
        ...m.record,
        state: "active",
        lastAccessedAt: now,
      });
    }
  }

  const totalScore =
    memoryMatches.reduce((s, m) => s + m.score, 0) +
    archiveMatches.reduce((s, m) => s + m.score, 0);

  return {
    query,
    topics,
    memoryMatches,
    archiveMatches,
    totalScore,
  };
}

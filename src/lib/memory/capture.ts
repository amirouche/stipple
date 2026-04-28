// Stage 1 of the rule-book pipeline: incoming text → temporary memory.
// Promotion runs inline so a single strong signal (high emotion) jumps
// straight to active without waiting for a separate scheduler tick.

import { computeEmotionScore, mergeEmotionSources, scoreEmotion } from "./emotion";
import { promote } from "./promote";
import { getMemorySnapshot, putMemory } from "./store";
import { extractTopics } from "./topics";
import type { MemoryRecord } from "./types";

export type CaptureCtx = {
  sourceThreadId?: string;
  // For UI affordances like "기억해" buttons that should bypass text scoring.
  // Range 0..1, treated as the explicit floor for this capture.
  explicitOverride?: number;
};

export function captureFromMessage(text: string, ctx: CaptureCtx = {}): MemoryRecord[] {
  const topics = extractTopics(text);
  if (topics.length === 0) return [];

  const incoming = scoreEmotion(text, {
    explicitOverride: ctx.explicitOverride,
  });
  const now = Date.now();
  const snap = getMemorySnapshot();

  const captured: MemoryRecord[] = [];

  for (const topic of topics) {
    const existing = snap.memories.find((m) => m.topic === topic);
    let rec: MemoryRecord;

    if (existing) {
      const merged = mergeEmotionSources(existing.emotionSources, incoming);
      rec = {
        ...existing,
        accessCount: existing.accessCount + 1,
        lastAccessedAt: now,
        emotionSources: merged,
        emotionScore: computeEmotionScore(merged),
        // Capture wakes dormant/archived records back into the active pool.
        // Stages 3/4 will be the ones putting records into those states;
        // we handle the wake-up here so the pipeline is symmetrical.
        state:
          existing.state === "dormant" || existing.state === "archived" ? "active" : existing.state,
        sourceThreadId: existing.sourceThreadId ?? ctx.sourceThreadId,
      };
    } else {
      rec = {
        id: crypto.randomUUID(),
        topic,
        state: "temporary",
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        emotionSources: incoming,
        emotionScore: computeEmotionScore(incoming),
        sourceThreadId: ctx.sourceThreadId,
        content: { kind: "topic", text: topic },
      };
    }

    const evaluated = promote(rec);
    putMemory(evaluated);
    captured.push(evaluated);
  }

  return captured;
}

// Emotion scoring — heuristic + explicit, with explicit weighted higher.
//
// Decision recap:
//   emotionScore = heuristic + explicit * EXPLICIT_WEIGHT
//   heuristic is capped so noisy text doesn't dominate; explicit caps at 1.
//   When the same topic is captured again, sources merge element-wise via
//   max — the strongest signal wins, so a single "기억해줘" doesn't get
//   diluted by later neutral mentions.

import type { EmotionSources } from "./types";

const EMPHASIS_RE = /정말|진짜|너무/;
const POSITIVE_RE = /좋아|좋다|최고/;
const NEGATIVE_RE = /싫어|싫다|별로/;
const EXPLICIT_RE = /기억해|저장해|기억해줘|저장해줘|👍|❤️|❤/;

export const EMOTION_LIMITS = {
  heuristicCap: 0.6,
  explicitCap: 1.0,
  explicitWeight: 1.5,
} as const;

export function scoreEmotion(text: string, opts?: { explicitOverride?: number }): EmotionSources {
  let h = 0;

  const exclamations = (text.match(/!/g) ?? []).length;
  h += Math.min(0.3, exclamations * 0.1);

  if (EMPHASIS_RE.test(text)) h += 0.2;
  if (POSITIVE_RE.test(text)) h += 0.15;
  if (NEGATIVE_RE.test(text)) h += 0.15;

  let e = 0;
  if (EXPLICIT_RE.test(text)) e = 0.7;
  if (opts?.explicitOverride !== undefined) {
    e = Math.max(e, opts.explicitOverride);
  }

  return {
    heuristic: Math.min(EMOTION_LIMITS.heuristicCap, h),
    explicit: Math.min(EMOTION_LIMITS.explicitCap, e),
  };
}

export function computeEmotionScore(sources: EmotionSources): number {
  return sources.heuristic + sources.explicit * EMOTION_LIMITS.explicitWeight;
}

export function mergeEmotionSources(a: EmotionSources, b: EmotionSources): EmotionSources {
  return {
    heuristic: Math.max(a.heuristic, b.heuristic),
    explicit: Math.max(a.explicit, b.explicit),
  };
}

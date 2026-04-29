// Phase A matcher: exact equality after lower + trim. Cheap, deterministic,
// good enough to demo the "양자역학 두 번째엔 LLM 안 부름" narrative.
// Semantic similarity (embedding-based, edit-distance, etc.) comes in
// Phase B once we have a meaningful corpus to match against.
//
// Returns the most-recent matching entry — newer answers usually carry
// the better wording (we may have refined the system prompt between
// captures).

import { getLearnedSnapshot } from "./store";
import type { LearnedResponse } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchLearnedResponse(input: string): LearnedResponse | null {
  const target = normalize(input);
  if (!target) return null;
  const all = getLearnedSnapshot();
  // Iterate from newest backward — return first hit, which is the most
  // recent answer for this exact input.
  for (let i = all.length - 1; i >= 0; i--) {
    if (normalize(all[i].userInput) === target) return all[i];
  }
  return null;
}

// Pitch matching — strictly local. Compares the user's extracted topics and
// the raw query against each pitch's contextHints. No data leaves the device.

import { getPitches, getDismissedPitches } from "./cache";
import type { Pitch, PitchCategory } from "./types";

export type MatchInput = {
  query: string;
  topics: string[];
  enabledCategories: PitchCategory[];
};

export function matchPitch(input: MatchInput): Pitch | null {
  if (input.enabledCategories.length === 0) return null;

  const allowed = new Set<PitchCategory>(input.enabledCategories);
  const dismissed = getDismissedPitches();
  const q = input.query.toLowerCase();
  const topics = input.topics.map((t) => t.toLowerCase());

  const candidates = getPitches().filter((p) => {
    if (dismissed.has(p.id)) return false;
    if (!allowed.has(p.category)) return false;
    return p.contextHints.some((rawHint) => {
      const hint = rawHint.toLowerCase();
      if (q.includes(hint)) return true;
      return topics.some((t) => t.includes(hint) || hint.includes(t));
    });
  });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Ad matching — strictly local. Compares the user's extracted topics and
// the raw query against each ad's contextHints. No data leaves the device.

import { getAds, getDismissedAds } from "./cache";
import type { Ad, AdCategory } from "./types";

export type MatchInput = {
  query: string;
  topics: string[];
  enabledCategories: AdCategory[];
};

export function matchAd(input: MatchInput): Ad | null {
  if (input.enabledCategories.length === 0) return null;

  const allowed = new Set<AdCategory>(input.enabledCategories);
  const dismissed = getDismissedAds();
  const q = input.query.toLowerCase();
  const topics = input.topics.map((t) => t.toLowerCase());

  const candidates = getAds().filter((ad) => {
    if (dismissed.has(ad.id)) return false;
    if (!allowed.has(ad.category)) return false;
    return ad.contextHints.some((rawHint) => {
      const hint = rawHint.toLowerCase();
      if (q.includes(hint)) return true;
      return topics.some((t) => t.includes(hint) || hint.includes(t));
    });
  });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Topic extraction — v1 reuses pack triggers from dots-data.ts.
//
// A "topic" in v1 is just a substring trigger that appeared in the message,
// normalized to lowercase. No NLP, no synonym collapsing — "김치찌개" and
// "찌개" are tracked as separate topics because that's what the trigger
// list says they are. v2 (fact-units) will refine this.

import { PACKS } from "@/lib/dots-data";

let triggerCache: string[] | null = null;

function allTriggers(): string[] {
  if (triggerCache) return triggerCache;
  triggerCache = Array.from(new Set(PACKS.flatMap((p) => p.triggers.map((t) => t.toLowerCase()))));
  return triggerCache;
}

export function extractTopics(text: string): string[] {
  const q = text.toLowerCase();
  const hits = allTriggers().filter((t) => q.includes(t));
  return Array.from(new Set(hits));
}

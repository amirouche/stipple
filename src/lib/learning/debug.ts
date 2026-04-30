// Dev-only window hook. Lets us poke the cache from the browser console
// during demo prep — count, list, clear, rate without rebuilding. Loaded
// only behind import.meta.env.DEV in __root.tsx, so it never ships to
// production users.

import { clearLearned, getLearnedSnapshot, rateLearned } from "./store";

declare global {
  interface Window {
    dotsLearning?: {
      count: () => number;
      list: () => LearnedSnapshotRow[];
      clear: () => Promise<void>;
      rate: (id: string, rating: "good" | "bad") => Promise<void>;
    };
  }
}

type LearnedSnapshotRow = {
  id: string;
  userInput: string;
  response: string;
  provider: "webllm" | "gemini";
  pack?: string;
  usedCount: number;
  rating?: "good" | "bad";
  priority: number;
  createdAt: string;
};

export function setupLearningDebug(): void {
  if (typeof window === "undefined") return;
  window.dotsLearning = {
    count: () => getLearnedSnapshot().length,
    list: () =>
      getLearnedSnapshot().map((e) => ({
        id: e.id,
        userInput: e.userInput,
        response: e.response.slice(0, 80) + (e.response.length > 80 ? "…" : ""),
        provider: e.provider,
        pack: e.packName,
        usedCount: e.usedCount,
        rating: e.rating,
        priority: e.priority,
        createdAt: new Date(e.createdAt).toISOString(),
      })),
    clear: () => clearLearned(),
    rate: (id, rating) => rateLearned(id, rating),
  };
}

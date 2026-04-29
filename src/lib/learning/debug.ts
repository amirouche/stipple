// Dev-only window hook. Lets us poke the cache from the browser console
// during demo prep — count, list, clear without rebuilding. Loaded
// only behind import.meta.env.DEV in __root.tsx, so it never ships to
// production users.

import { clearLearned, getLearnedSnapshot } from "./store";

declare global {
  interface Window {
    dotsLearning?: {
      count: () => number;
      list: () => LearnedSnapshotRow[];
      clear: () => Promise<void>;
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
        createdAt: new Date(e.createdAt).toISOString(),
      })),
    clear: () => clearLearned(),
  };
}

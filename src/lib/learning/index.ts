// Public learning facade. The rest of the app imports from
// "@/lib/learning" only — store/match/debug internals stay private.

export type { LearnedResponse } from "./types";
export {
  hydrateLearned,
  saveLearned,
  deleteLearned,
  getAllLearned,
  getLearnedSnapshot,
  incrementUsedCount,
  rateLearned,
  clearLearned,
  subscribeLearned,
} from "./store";
export { matchLearnedResponse, matchLearnedTopicGroup } from "./match";
export { buildTopicSummary } from "./summary";
export { extractTopic } from "./topic";
export { setupLearningDebug } from "./debug";
export { useLearnedRating } from "./hooks";

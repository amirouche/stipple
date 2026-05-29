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
// V6A 명시적 학습 (Active Learning).
export type { CommandResult } from "./commands";
export { parseCommand } from "./commands";
export type { AliasEntry, AliasDirection } from "./dictionary";
export {
  hydrateDictionary,
  addAlias,
  removeAlias,
  listAliases,
  resolveAlias,
  subscribeDictionary,
  clearDictionary,
} from "./dictionary";
// Phase M0 선호 표현 인지 + 저장.
export type { PreferenceResult } from "./preference";
export { parsePreference } from "./preference";
export type { PreferenceEntry } from "./preferences-store";
export {
  hydratePreferencesStore,
  addPreference,
  removePreference,
  listPreferences,
  listByType,
  subscribePreferencesStore,
  clearPreferences,
} from "./preferences-store";

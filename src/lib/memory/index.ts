export type {
  MemoryState,
  MemoryContent,
  EmotionSources,
  MemoryRecord,
  ArchiveGranularity,
  ArchiveEntry,
  MetaRecord,
} from "./types";

export {
  useMemoryStore,
  getMemorySnapshot,
  putMemory,
  deleteMemory,
  clearMemories,
  putArchive,
  deleteArchive,
  clearArchives,
  clearAll,
  hydrateMemoryStore,
  rehydrateMemoryStore,
} from "./store";

export { extractTopics } from "./topics";
export { scoreEmotion, computeEmotionScore, mergeEmotionSources, EMOTION_LIMITS } from "./emotion";
export { promote, shouldPromote, PROMOTION_THRESHOLDS } from "./promote";
export { captureFromMessage } from "./capture";
export type { CaptureCtx } from "./capture";
export { decay, shouldDecayToDormant, DECAY_THRESHOLDS } from "./decay";
export { archiveTick, shouldArchiveDormant, archiveId, ARCHIVE_THRESHOLDS } from "./archive";
export type { ArchiveTickResult } from "./archive";
export {
  bucketFor,
  parentGranularity,
  dayBucket,
  weekBucket,
  monthBucket,
  quarterBucket,
  yearBucket,
} from "./windows";
export type { Window } from "./windows";
export { tickScheduler, registerScheduler, SCHEDULER_META_KEY } from "./scheduler";
export type { SchedulerReport } from "./scheduler";
export { lookupMemory, STATE_WEIGHTS, GRANULARITY_WEIGHTS } from "./lookup";
export type { LookupResult, LookupOpts, MemoryMatch, ArchiveMatch } from "./lookup";

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
  hydrateMemoryStore,
  rehydrateMemoryStore,
} from "./store";

export { extractTopics } from "./topics";
export { scoreEmotion, computeEmotionScore, mergeEmotionSources, EMOTION_LIMITS } from "./emotion";
export { promote, shouldPromote, PROMOTION_THRESHOLDS } from "./promote";
export { captureFromMessage } from "./capture";
export type { CaptureCtx } from "./capture";
export { decay, shouldDecayToDormant, DECAY_THRESHOLDS } from "./decay";
export { tickScheduler, registerScheduler, SCHEDULER_META_KEY } from "./scheduler";
export type { SchedulerReport } from "./scheduler";

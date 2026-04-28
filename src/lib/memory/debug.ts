// Dev-only console handle. Kept out of `store.ts` to avoid a cycle —
// debug needs to import capture/scoreEmotion which import the store.
// `setupDebugHandle()` is called from the root route in dev mode only.

import { captureFromMessage } from "./capture";
import { EMOTION_LIMITS, computeEmotionScore, mergeEmotionSources, scoreEmotion } from "./emotion";
import { PROMOTION_THRESHOLDS, shouldPromote } from "./promote";
import {
  clearMemories,
  deleteMemory,
  getMemorySnapshot,
  hydrateMemoryStore,
  putMemory,
  rehydrateMemoryStore,
} from "./store";
import { extractTopics } from "./topics";

declare global {
  interface Window {
    __dotsMemory?: {
      // stage 1
      put: typeof putMemory;
      delete: typeof deleteMemory;
      clear: typeof clearMemories;
      snapshot: typeof getMemorySnapshot;
      rehydrate: typeof rehydrateMemoryStore;
      // stage 2
      capture: typeof captureFromMessage;
      extractTopics: typeof extractTopics;
      scoreEmotion: typeof scoreEmotion;
      computeEmotionScore: typeof computeEmotionScore;
      mergeEmotionSources: typeof mergeEmotionSources;
      shouldPromote: typeof shouldPromote;
      thresholds: typeof PROMOTION_THRESHOLDS;
      emotionLimits: typeof EMOTION_LIMITS;
    };
  }
}

export async function setupDebugHandle(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!import.meta.env.DEV) return;
  await hydrateMemoryStore();
  window.__dotsMemory = {
    put: putMemory,
    delete: deleteMemory,
    clear: clearMemories,
    snapshot: getMemorySnapshot,
    rehydrate: rehydrateMemoryStore,
    capture: captureFromMessage,
    extractTopics,
    scoreEmotion,
    computeEmotionScore,
    mergeEmotionSources,
    shouldPromote,
    thresholds: PROMOTION_THRESHOLDS,
    emotionLimits: EMOTION_LIMITS,
  };
}

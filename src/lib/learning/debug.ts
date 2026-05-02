// Dev-only window hook. Lets us poke the cache from the browser console
// during demo prep — count, list, clear, rate without rebuilding. Loaded
// only behind import.meta.env.DEV in __root.tsx, so it never ships to
// production users.

import { clearLearned, getLearnedSnapshot, rateLearned } from "./store";
import { extractTopic } from "./topic";
import type { LearnedResponse } from "./types";

declare global {
  interface Window {
    dotsLearning?: {
      count: () => number;
      list: () => LearnedSnapshotRow[];
      clear: () => Promise<void>;
      rate: (id: string, rating: "good" | "bad") => Promise<void>;
      // V4.1 정정: in-session 재마이그레이션. 브라우저 reload 없이 새 topic
      // 로직으로 모든 entry 의 topic 필드 재계산. 결과는 변경된 entry 수.
      recomputeTopics: () => Promise<number>;
      // V4.1: topic 별 entry 그룹화. {[topic]: [{userInput, responseLength}]}
      // 같은 topic 박힌 entry 가 몇 개씩 쌓였는지 한눈에 — Tei 진단 시각화 용.
      topicGroups: () => Record<string, Array<{ userInput: string; responseLength: number }>>;
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
  // V4: 시맨틱 매칭 가능 여부 + 차원. 디버깅 시 어떤 모델로 임베딩됐는지
  // 한눈에 (768d = EmbeddingGemma, 384d = MiniLM, undefined = 임베딩 X).
  vectorDim?: number;
  // V4.1: topic 그룹화 키. dotsLearning.list() 로 같은 topic 박힌 entry
  // 가 몇 개 쌓였는지 한눈에.
  topic?: string;
  // V5: BM25 토큰 수. 0 이면 토큰화 실패 / 미마이그레이션 — 매칭 시 fallback
  // 으로 즉석 토큰화. 정상 entry 는 보통 5-30.
  tokenCount?: number;
  responseLength: number;
  createdAt: string;
};

// 직접 cache 를 mutate 하지 않도록 store 의 persist 를 거치는 helper. 단,
// hydrate 단계의 batch 재계산을 in-session 으로 흉내 내려면 cache 전체에
// 한 번에 박아야 하므로 store 내부 API 를 빌려옴.
async function recomputeTopicsInSession(): Promise<number> {
  const snap = getLearnedSnapshot();
  let changed = 0;
  for (const e of snap) {
    const newTopic = extractTopic(e.userInput);
    if (newTopic !== e.topic) {
      // store API 가 entry 단위 update 를 노출 X — clear + 재기록 형태가
      // 안전. 단 영속 cost 가 크므로 batch 로 직접 cache mutation 후 한 번
      // persist. 이 경로는 dev-only 라 store 캡슐화 위반 허용.
      (e as LearnedResponse).topic = newTopic;
      changed++;
    }
  }
  if (changed > 0) {
    // store.persist() 는 internal — 동일 효과를 위해 임의의 entry rating 을
    // 같은 값으로 다시 박는 트릭은 위험. 대신 직접 localStorage 갱신.
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("dots:learned-responses", JSON.stringify(snap));
      } catch (err) {
        console.warn("[learning] recomputeTopics persist failed:", err);
      }
    }
  }
  return changed;
}

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
        vectorDim: e.vector?.length,
        topic: e.topic,
        tokenCount: e.tokens?.length,
        responseLength: e.response.length,
        createdAt: new Date(e.createdAt).toISOString(),
      })),
    clear: () => clearLearned(),
    rate: (id, rating) => rateLearned(id, rating),
    recomputeTopics: () => recomputeTopicsInSession(),
    topicGroups: () => {
      const groups: Record<string, Array<{ userInput: string; responseLength: number }>> = {};
      for (const e of getLearnedSnapshot()) {
        const key = e.topic ?? "(no topic)";
        if (!groups[key]) groups[key] = [];
        groups[key].push({ userInput: e.userInput, responseLength: e.response.length });
      }
      return groups;
    },
  };
}

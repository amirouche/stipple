// Learned-response store. Phase A backs by localStorage (5MB cap is
// plenty for ~1000 entries at ~5KB each, well past Phase A demo needs).
// Phase B/C may migrate to IndexedDB; the API is async so callers won't
// have to change.
//
// Sync read path: keep an in-memory cache, populated on hydrateLearned().
// Writes go through localStorage and update the cache. Module-level state
// + listener Set, mirroring conversation-store / user-store patterns.

import { embed, getEmbeddingStatus } from "@/lib/embedding";

import { extractTopic } from "./topic";
import type { LearnedResponse } from "./types";

const STORAGE_KEY = "dots:learned-responses";
// V4.1 정정 (2026-05-02 오후): topic 추출 로직이 first-noun + stopword 로
// 바뀌었음. 기존 entry 의 topic 필드 (잘못 박힌 "대하알고싶" 등) 를 다시
// 계산해야 같은 주제 그룹화가 작동. 이 키와 CURRENT_TOPIC_VERSION 비교 →
// 다르면 next hydrate 에서 모든 entry 의 topic 필드 재계산 + 한 번 persist.
// 새 entry 는 saveLearned 가 신로직으로 박으므로 영향 X.
const TOPIC_VERSION_KEY = "dots:learned-topic-version";
const CURRENT_TOPIC_VERSION = "2";

let cache: LearnedResponse[] = [];
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Quota or serialization failures — log but don't throw. Phase A
    // demos should not crash because the cache filled up.
    console.warn("[learning] persist failed:", err);
  }
}

export function hydrateLearned(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<Partial<LearnedResponse>>;
    if (Array.isArray(parsed)) {
      // Phase B 마이그레이션: 기존 엔트리에 priority가 없으면 rating을 보고
      // 역추정 (good=+1 / bad=-1 / 없음=0). 새 필드 lastRatedAt은 비워둔다.
      //
      // V4.1 topic 마이그레이션:
      //   - 처음 박힌 entry (topic 미존재) → 추출해서 채움.
      //   - topic 추출 로직 버전이 바뀜 (TOPIC_VERSION_KEY 미일치) → 모든
      //     entry 의 topic 재계산. 잘못 박힌 ("대하알고싶") 그룹화 키 폐기.
      const storedTopicVersion = localStorage.getItem(TOPIC_VERSION_KEY);
      const recomputeAllTopics = storedTopicVersion !== CURRENT_TOPIC_VERSION;
      let migrated = false;
      cache = parsed.map((e) => {
        const next: LearnedResponse = {
          ...(e as LearnedResponse),
          priority:
            typeof e.priority === "number"
              ? e.priority
              : e.rating === "good"
                ? 1
                : e.rating === "bad"
                  ? -1
                  : 0,
        };
        if ((recomputeAllTopics || !next.topic) && next.userInput) {
          const topic = extractTopic(next.userInput);
          // 재계산이 undefined 를 반환하면 (extractTopic 실패) 기존 topic 도
          // 폐기. 잘못 박힌 키 보다는 매칭이 V4 시맨틱 경로로 폴백되는 게
          // 정직.
          if (recomputeAllTopics) {
            if (topic) next.topic = topic;
            else delete next.topic;
            migrated = true;
          } else if (topic) {
            next.topic = topic;
            migrated = true;
          }
        }
        return next;
      });
      if (migrated) persist();
      if (recomputeAllTopics) {
        try {
          localStorage.setItem(TOPIC_VERSION_KEY, CURRENT_TOPIC_VERSION);
        } catch (err) {
          console.warn("[learning] topic version persist failed:", err);
        }
      }
      emit();
    }
  } catch (err) {
    console.warn("[learning] hydrate failed:", err);
  }
}

// Synchronous snapshot for hot paths (matchLearnedResponse runs on every
// user send and must not await). Async wrappers below are still kept for
// the IndexedDB migration story.
export function getLearnedSnapshot(): LearnedResponse[] {
  return cache;
}

export async function getAllLearned(): Promise<LearnedResponse[]> {
  return cache;
}

export async function saveLearned(entry: LearnedResponse): Promise<void> {
  // V4.1: topic 자동 추출. 호출 측이 미리 박은 경우 (배치 마이그레이션
  // 등) 는 그대로. extractTopic 실패 (대부분 follow-up) → undefined,
  // 매칭은 V4 시맨틱 경로로 폴백.
  if (!entry.topic) {
    const topic = extractTopic(entry.userInput);
    if (topic) entry = { ...entry, topic };
  }
  // V4: 임베딩 모델 ready 상태면 userInput을 자동 임베딩. 호출 측이
  // 미리 vector를 채워 보낸 경우(배치 마이그레이션 등)는 그대로 사용.
  // 임베딩 실패는 silent — 정확 일치 매칭은 그대로 가능.
  if (!entry.vector && getEmbeddingStatus().state === "ready") {
    try {
      const v = await embed(entry.userInput);
      entry = { ...entry, vector: Array.from(v) };
    } catch (err) {
      console.warn("[learning] 자동 임베딩 실패, vector 없이 저장:", err);
    }
  }
  cache = [...cache, entry];
  persist();
  emit();
}

export async function deleteLearned(id: string): Promise<void> {
  const next = cache.filter((e) => e.id !== id);
  if (next.length === cache.length) return;
  cache = next;
  persist();
  emit();
}

export async function incrementUsedCount(id: string): Promise<void> {
  let changed = false;
  cache = cache.map((e) => {
    if (e.id !== id) return e;
    changed = true;
    return { ...e, usedCount: e.usedCount + 1 };
  });
  if (changed) {
    persist();
    emit();
  }
}

// Phase B 큐레이션. 사용자가 "좋아"·"다른 거"를 누르면 호출된다.
// rating은 source of truth, priority는 정렬용 derived 값:
//   "good" → priority +1
//   "bad"  → priority -1
// 이미 같은 rating이 박힌 엔트리에 또 누르면 lastRatedAt만 새로 찍힘 —
// 누적 가산은 시연 단계에선 굳이 필요 없고, 인지적 모델이 단순해진다.
export async function rateLearned(id: string, rating: "good" | "bad"): Promise<void> {
  let changed = false;
  cache = cache.map((e) => {
    if (e.id !== id) return e;
    changed = true;
    return {
      ...e,
      rating,
      priority: rating === "good" ? 1 : -1,
      lastRatedAt: Date.now(),
    };
  });
  if (changed) {
    persist();
    emit();
  }
}

export async function clearLearned(): Promise<void> {
  cache = [];
  persist();
  emit();
}

export function subscribeLearned(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

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
      // V4.1 마이그레이션: topic이 비어 있으면 userInput에서 추출해 채움.
      // 기존 entry도 topic 그룹화 대상이 되도록.
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
        if (!next.topic && next.userInput) {
          const topic = extractTopic(next.userInput);
          if (topic) {
            next.topic = topic;
            migrated = true;
          }
        }
        return next;
      });
      // topic 마이그레이션이 일어났으면 한 번 재저장 — 다음 hydrate 시
      // 같은 비용 반복 X.
      if (migrated) persist();
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

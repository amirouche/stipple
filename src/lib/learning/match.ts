// 학습 매칭 — V3 정확 일치 + V4 시맨틱 매칭 통합.
//
// V3 (commit cd3ee01): exact equality after lower + trim.
// V4 (이번 commit): 임베딩 모델 ready면 코사인 유사도로 시맨틱 매칭.
//   - "양자역학" / "양자역학에 대해" / "양자역학이 뭐야" 같은 변형
//     입력이 같은 응답으로 묶인다.
//   - 임계값 0.85 (LEARNED_SIMILARITY_THRESHOLD) — 보수적으로 잡아
//     관계 약한 응답이 잘못 hit하지 않게.
//
// 통합 전략:
//   1. 정확 일치 후보 (similarity = 1.0 부여) — 모델 미사용 시도 작동.
//   2. 시맨틱 후보 (vector가 있는 엔트리만) — similarity ≥ 0.85.
//   3. id로 dedupe, priority < 0 (사용자 "다른 거") 제외.
//   4. 정렬: priority desc → similarity desc → createdAt desc.
//
// = 모델 미사용 → V3 그대로 (정확 일치만)
// = 모델 사용 → V4 (변형 입력 처리 + V3 정확 일치 superset)
// = 사용자 큐레이션 (Phase B)이 항상 우선

import {
  cosineSimilarity,
  embed,
  getEmbeddingStatus,
  LEARNED_SIMILARITY_THRESHOLD,
  toFloat32,
} from "@/lib/embedding";

import { getLearnedSnapshot } from "./store";
import type { LearnedResponse } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

type Candidate = { entry: LearnedResponse; similarity: number };

export async function matchLearnedResponse(input: string): Promise<LearnedResponse | null> {
  const target = normalize(input);
  if (!target) return null;
  const all = getLearnedSnapshot();
  if (all.length === 0) return null;

  // 1) 정확 일치 후보 — V3 fallback. 모델 미사용 환경에서도 그대로 작동.
  const candidates = new Map<string, Candidate>();
  for (const e of all) {
    if (normalize(e.userInput) === target) {
      candidates.set(e.id, { entry: e, similarity: 1.0 });
    }
  }

  // 2) 시맨틱 후보 — 모델 ready + 엔트리에 vector가 있을 때만.
  if (getEmbeddingStatus().state === "ready") {
    try {
      const queryVec = await embed(input);
      for (const e of all) {
        if (!e.vector) continue;
        const stored = toFloat32(e.vector);
        // 차원이 다르면 0 — 사용자가 모델을 바꾼 경우(768d ↔ 384d 사이).
        // cosineSimilarity가 length 체크로 0을 반환하므로 자동 skip.
        const sim = cosineSimilarity(queryVec, stored);
        if (sim < LEARNED_SIMILARITY_THRESHOLD) continue;
        // 같은 id의 정확 일치 후보가 이미 있으면 더 큰 similarity로 갱신.
        const existing = candidates.get(e.id);
        if (!existing || sim > existing.similarity) {
          candidates.set(e.id, { entry: e, similarity: sim });
        }
      }
    } catch (err) {
      // 임베딩 실패 → 정확 일치 후보만 사용. 시연 끊김 방지.
      console.warn("[learning] 시맨틱 매칭 실패, 정확 일치만 사용:", err);
    }
  }

  // 3) priority < 0 (사용자가 "다른 거" 클릭) 제외.
  const filtered = [...candidates.values()].filter((c) => c.entry.priority >= 0);
  if (filtered.length === 0) return null;

  // 4) 정렬: priority desc → similarity desc → createdAt desc.
  //    good 평가 받은 응답이 항상 우선, 동급이면 더 가까운 의미, 더 최근.
  filtered.sort(
    (a, b) =>
      b.entry.priority - a.entry.priority ||
      b.similarity - a.similarity ||
      b.entry.createdAt - a.entry.createdAt,
  );

  return filtered[0].entry;
}

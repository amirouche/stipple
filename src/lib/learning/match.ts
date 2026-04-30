// 학습 매칭 — V3 정확 일치 + V4 시맨틱 매칭 + V4.5 cross-encoder 재정렬.
//
// V3 (commit cd3ee01): exact equality after lower + trim.
// V4 (commit 7d07c83): 임베딩 모델 ready면 코사인 유사도로 시맨틱 매칭.
//   "양자역학" / "양자역학에 대해" / "양자역학이 뭐야" 같은 변형 입력이
//   같은 응답으로 묶임.
// V4.5 (이번 commit): reranker ready + 후보 ≥ 2면 cross-encoder로 재정렬.
//   bi-encoder가 못 잡는 추상적/대화적 변형("이거 진짜 있는 학문이야?")
//   이 attention 기반 점수로 hit하게 됨. MS MARCO benchmark 기준 NDCG
//   15~25% ↑.
//
// 통합 전략 (V4.5):
//   1. 정확 일치 후보 + 시맨틱 후보 (sim > 0인 모든 vector 엔트리) 모음.
//   2. similarity desc 정렬 후 top-N(=10) 추출.
//   3. reranker ready + N ≥ 2면 rerank → similarity 자리에 rerank score
//      [0, 1] 박음. ready X면 V4 similarity 그대로.
//   4. priority < 0 (사용자 "다른 거") 제외.
//   5. score ≥ 0.85 (LEARNED_RERANK_THRESHOLD) 미달이면 null.
//   6. 정렬: priority desc → score desc → createdAt desc.

import { cosineSimilarity, embed, getEmbeddingStatus, toFloat32 } from "@/lib/embedding";
import { getRerankerStatus, LEARNED_RERANK_THRESHOLD, rerank, RERANK_TOP_N } from "@/lib/reranker";

import { getLearnedSnapshot } from "./store";
import type { LearnedResponse } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

type Candidate = { entry: LearnedResponse; score: number };

export async function matchLearnedResponse(input: string): Promise<LearnedResponse | null> {
  const target = normalize(input);
  if (!target) return null;
  const all = getLearnedSnapshot();
  if (all.length === 0) return null;

  // 1) 후보 모으기: 정확 일치(score=1.0) + 시맨틱(vector + sim>0).
  //    V4의 0.85 게이트는 여기서 적용 안 함 — top-N 추출 + rerank가
  //    더 정확하게 걸러낸다.
  const candidates = new Map<string, Candidate>();
  for (const e of all) {
    if (normalize(e.userInput) === target) {
      candidates.set(e.id, { entry: e, score: 1.0 });
    }
  }
  if (getEmbeddingStatus().state === "ready") {
    try {
      const queryVec = await embed(input);
      for (const e of all) {
        if (!e.vector) continue;
        const stored = toFloat32(e.vector);
        const sim = cosineSimilarity(queryVec, stored);
        if (sim <= 0) continue;
        const existing = candidates.get(e.id);
        if (!existing || sim > existing.score) {
          candidates.set(e.id, { entry: e, score: sim });
        }
      }
    } catch (err) {
      console.warn("[learning] 시맨틱 매칭 실패, 정확 일치만 사용:", err);
    }
  }
  if (candidates.size === 0) return null;

  // 2) similarity desc 정렬 후 top-N. 너무 많은 후보를 reranker에 넘기면
  //    cross-encoder 호출당 50~100ms × N 비용이 커진다.
  let pool = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, RERANK_TOP_N);

  // 3) Reranker가 ready + 후보 ≥ 2면 cross-encoder로 재정렬.
  //    score를 rerank 결과로 교체. ready X면 sim score 그대로 사용 (V4).
  if (getRerankerStatus().state === "ready" && pool.length >= 2) {
    try {
      const texts = pool.map((c) => c.entry.userInput);
      const rerankScores = await rerank(input, texts);
      pool = pool.map((c, i) => ({ ...c, score: rerankScores[i] ?? c.score }));
    } catch (err) {
      console.warn("[learning] reranker 실패, 임베딩 점수 그대로 사용:", err);
    }
  }

  // 4) priority < 0 제외 + threshold 미달 제외.
  //    threshold는 LEARNED_RERANK_THRESHOLD (0.85). reranker 미사용 시
  //    임베딩 sim이 0.85 미만이면 자동 컷.
  const filtered = pool.filter((c) => c.entry.priority >= 0 && c.score >= LEARNED_RERANK_THRESHOLD);
  if (filtered.length === 0) return null;

  // 5) 정렬: priority desc → score desc → createdAt desc.
  filtered.sort(
    (a, b) =>
      b.entry.priority - a.entry.priority ||
      b.score - a.score ||
      b.entry.createdAt - a.entry.createdAt,
  );

  return filtered[0].entry;
}

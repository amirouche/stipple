// 학습 매칭 — V3 정확 일치 + V4 시맨틱 매칭 + V4.1 topic consolidation.
//
// V3 (commit cd3ee01): exact equality after lower + trim.
// V4 (commit 7d07c83): 임베딩 모델 ready면 코사인 유사도로 시맨틱 매칭.
//   "양자역학" / "양자역학에 대해" / "양자역학이 뭐야" 같은 변형 입력이
//   같은 응답으로 묶임.
// V4.5 (단계): reranker ready + 후보 ≥ 2면 cross-encoder로 재정렬. 안정성
//   정정으로 일시 비활성. 모델 호환 복구 후 재활성.
// V4.1 (이번 단계): topic consolidation. 같은 주제로 쌓인 entry 가 여러
//   개 박혀있어도 query별 가장 가까운 1개만 꺼내던 V4의 응답 분산을 해소.
//   query topic 추출 → 같은 topic 그룹 우선. 단일 모드는 그 그룹의 가장
//   풍부한 (response 가장 긴) entry. 종합 모드 (matchLearnedTopicGroup) 는
//   그룹 전체를 반환 — 호출 측이 합쳐서 메모 전시.
//
// 통합 전략 (V4.1):
//   1. query topic 추출 (extractNouns longest noun).
//   2. topic 박힘 + 같은 topic priority≥0 entry 가 있으면:
//      그 그룹 안에서 priority desc → response.length desc → createdAt desc.
//      similarity threshold gate skip (topic 일치 자체가 의미 게이트).
//   3. topic miss 또는 같은 topic entry 없음 → V4 시맨틱 경로:
//      정확 일치 + sim>0 후보 모음 → top-N → threshold 0.85 → priority desc
//      → score desc → createdAt desc.

import { cosineSimilarity, embed, getEmbeddingStatus, toFloat32 } from "@/lib/embedding";
import { LEARNED_RERANK_THRESHOLD, RERANK_TOP_N } from "@/lib/reranker";

// 안정성 정정 (2026-04-30): GTE reranker Transformers.js 호환 작업 중. V4.5
// 단계는 통째로 skip — V4 임베딩 점수가 그대로 LEARNED_RERANK_THRESHOLD
// 게이트를 통과해야 hit. 모델 호환 복구되면 false → getRerankerStatus()
// === "ready" 같은 원래 가드로 복구.
const RERANKER_ENABLED = false;

import { getLearnedSnapshot } from "./store";
import { extractTopic } from "./topic";
import type { LearnedResponse } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

type Candidate = { entry: LearnedResponse; score: number };

// V4.1 같은 topic 그룹 비교자. priority 동일 시 response 가장 긴 게 가장
// 풍부한 메모. createdAt desc 는 동률 deterministic 정렬용.
function richestFirst(a: LearnedResponse, b: LearnedResponse): number {
  return (
    b.priority - a.priority || b.response.length - a.response.length || b.createdAt - a.createdAt
  );
}

// V4.1 종합 모드용. 같은 topic priority≥0 entry 를 createdAt asc 로 반환 —
// 호출 측이 메모로 전시할 때 시간순으로 박음 ("처음 → 최근").
export function matchLearnedTopicGroup(input: string): LearnedResponse[] {
  const topic = extractTopic(input);
  if (!topic) return [];
  return getLearnedSnapshot()
    .filter((e) => e.topic === topic && e.priority >= 0)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function matchLearnedResponse(input: string): Promise<LearnedResponse | null> {
  const target = normalize(input);
  if (!target) return null;
  const all = getLearnedSnapshot();
  if (all.length === 0) return null;

  // V4.1 단일 모드: query topic 박힘 + 같은 topic entry 있으면 그 그룹의
  // 가장 풍부한 1개. similarity 게이트 skip — topic 일치가 의미 게이트.
  const queryTopic = extractTopic(input);
  if (queryTopic) {
    const topicGroup = all.filter((e) => e.topic === queryTopic && e.priority >= 0);
    if (topicGroup.length > 0) {
      const sorted = [...topicGroup].sort(richestFirst);
      if (import.meta.env.DEV) {
        console.log("[topic-match]", {
          topic: queryTopic,
          groupSize: topicGroup.length,
          pickedLen: sorted[0].response.length,
        });
      }
      return sorted[0];
    }
  }

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
  const pool = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, RERANK_TOP_N);

  // 3) Reranker는 안정성 정정으로 일시 비활성. V4 임베딩 점수 그대로 사용.
  if (RERANKER_ENABLED) {
    // (모델 호환 복구 후 활성화. 원래 분기는 git 히스토리에 보존.)
  }

  // 4) priority < 0 제외 + threshold 미달 제외.
  //    threshold는 LEARNED_RERANK_THRESHOLD (0.85). reranker 미사용 시
  //    임베딩 sim이 0.85 미만이면 자동 컷.
  const filtered = pool.filter((c) => c.entry.priority >= 0 && c.score >= LEARNED_RERANK_THRESHOLD);
  if (import.meta.env.DEV) {
    const top = pool[0];
    console.log("[embedding-match]", {
      similarity: top ? Number(top.score.toFixed(3)) : 0,
      hit: filtered.length > 0,
      poolSize: pool.length,
    });
  }
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

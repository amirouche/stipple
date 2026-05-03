// 학습 매칭 — V5 Hybrid Search (BM25 + Embedding + RRF).
//
// V3 (cd3ee01): exact equality after lower + trim.
// V4 (7d07c83): 임베딩 모델 ready → 코사인 유사도 0.85 게이트.
// V4.1 (5aacd1a): topic consolidation. 같은 주제 entry 그룹화 (Pack 매처와
//   다르게 메모리 layer 는 기록 역할).
// V4.5 (단계): GTE reranker 일시 비활성. 모델 호환 복구 후 재활성.
// V5 (이번 단계): Hybrid sparse + dense + RRF. 브라우저 검증에서 발견한
//   누수:
//     영어 입력 "I want to learn quantum mechanics" → 한국어 음식 entry
//     매칭 (cross-lingual embedding 너그러움 + cold-start false positive).
//   원인: dense 매칭 단독 시 token overlap 0 인 입력도 0.7-0.8 수준 유사도
//   가 나오기 쉬움. BM25 (sparse) 를 결합해 "토큰 overlap 자체가 0 이면
//   점수 0" 게이트 박음.
//
// V5 흐름:
//   1. 모든 entry 에 대해 BM25 점수 + cosine similarity 둘 다 계산.
//   2. 강한 증거 게이트:
//      (BM25 ≥ BM25_MIN AND embed ≥ EMBED_BACKING) OR (embed ≥ STRICT)
//      - 토큰 overlap + 어느 정도 의미 매칭 OR
//      - 토큰은 0 이지만 매우 높은 의미 매칭 (paraphrase)
//   3. 통과 entry 들에 대해 RRF (Reciprocal Rank Fusion) 점수 계산:
//        score(d) = 1/(k + rank_bm25(d)) + 1/(k + rank_embed(d))   (k=60)
//   4. priority < 0 제외.
//   5. topic 일치 entry 가 통과 set 에 있으면 그 안에서 가장 풍부한 (response
//      길이 최대) 1개. 없으면 RRF 점수 가장 높은 1개.
//
// 임계값 (V5.1 한국어 intent 보강 — 2026-05-03):
//   BM25_MIN = 1.5       — 최소 IDF-weighted term 일치 강도. 1.0 → 1.5 로 상향
//                          (한국어 stopword 통과 후에도 약한 overlap 차단).
//   EMBED_BACKING = 0.5  — 같은 의미 영역에 박혀있다는 약한 신호
//   STRICT = 0.90        — 토큰 0 일 때 단독 통과 가능한 매우 높은 의미 매칭.
//                          0.85 → 0.90 으로 상향 (cross-lingual 너그러움
//                          0.78-0.85 박힘 — 0.90 이면 진짜 paraphrase 만 통과).
//
// 매칭 미스 → null → routes/index.tsx 가 cloud (Stage 3) 로 흘림. 정직.

import { cosineSimilarity, embed, getEmbeddingStatus, toFloat32 } from "@/lib/embedding";

import { bm25Score, computeCorpusStats, tokenize } from "./bm25";
import { getLearnedSnapshot } from "./store";
import { extractTopic } from "./topic";
import type { LearnedResponse } from "./types";

const BM25_MIN = 1.5;
const EMBED_BACKING = 0.5;
const STRICT_EMBED = 0.9;
const RRF_K = 60;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

type Scored = {
  entry: LearnedResponse;
  bm25: number;
  embed: number;
};

function richestFirst(a: LearnedResponse, b: LearnedResponse): number {
  return (
    b.priority - a.priority || b.response.length - a.response.length || b.createdAt - a.createdAt
  );
}

// V4.1 종합 모드용. 같은 topic priority≥0 entry 를 createdAt asc 로 반환 —
// 호출 측이 메모로 전시할 때 시간순으로 박음 ("처음 → 최근"). V5 에서도
// 종합 모드는 사용자가 명시적으로 "정리해줘" 박은 의도라 threshold 게이트
// 미적용 — 보유 자산을 그대로 보여주는 게 정직.
export function matchLearnedTopicGroup(input: string): LearnedResponse[] {
  const topic = extractTopic(input);
  if (!topic) return [];
  return getLearnedSnapshot()
    .filter((e) => e.topic === topic && e.priority >= 0)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// V5 핵심: 모든 entry 의 BM25 + embedding 점수 + RRF 통합.
async function scoreAll(input: string, all: LearnedResponse[]): Promise<Scored[]> {
  // BM25
  const queryTokens = tokenize(input);
  const corpus = all.map((e) => e.tokens ?? tokenize(e.userInput));
  const stats = computeCorpusStats(corpus);
  const bm25Scores = corpus.map((doc) => bm25Score(queryTokens, doc, stats));

  // Embedding — 모델 ready 시 only.
  const embedScores = new Array<number>(all.length).fill(0);
  if (getEmbeddingStatus().state === "ready") {
    try {
      const queryVec = await embed(input);
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (!e.vector) continue;
        const sim = cosineSimilarity(queryVec, toFloat32(e.vector));
        embedScores[i] = Math.max(0, sim);
      }
    } catch (err) {
      console.warn("[learning] 시맨틱 매칭 실패, BM25 only:", err);
    }
  }

  // 정확 일치 (V3 fallback) — score 1.0 으로 embed 자리에 박음. BM25 도
  // 자연스럽게 높을 것이지만 안전망.
  const target = normalize(input);
  for (let i = 0; i < all.length; i++) {
    if (normalize(all[i].userInput) === target) {
      embedScores[i] = Math.max(embedScores[i], 1.0);
    }
  }

  return all.map((entry, i) => ({ entry, bm25: bm25Scores[i], embed: embedScores[i] }));
}

function passesEvidenceGate(s: Scored): boolean {
  if (s.entry.priority < 0) return false;
  if (s.bm25 >= BM25_MIN && s.embed >= EMBED_BACKING) return true;
  if (s.embed >= STRICT_EMBED) return true;
  return false;
}

// RRF: 두 ranking 을 결합. rank 가 1부터 (가장 좋음). 후보가 없는 method 의
// rank 는 무한대 처리 (1 / (k + ∞) ≈ 0).
function rrfScore(scoredList: Scored[]): Map<string, number> {
  const byBm25 = [...scoredList].sort((a, b) => b.bm25 - a.bm25);
  const byEmbed = [...scoredList].sort((a, b) => b.embed - a.embed);
  const rrf = new Map<string, number>();
  byBm25.forEach((s, i) => {
    if (s.bm25 <= 0) return;
    const r = i + 1;
    rrf.set(s.entry.id, (rrf.get(s.entry.id) ?? 0) + 1 / (RRF_K + r));
  });
  byEmbed.forEach((s, i) => {
    if (s.embed <= 0) return;
    const r = i + 1;
    rrf.set(s.entry.id, (rrf.get(s.entry.id) ?? 0) + 1 / (RRF_K + r));
  });
  return rrf;
}

export async function matchLearnedResponse(input: string): Promise<LearnedResponse | null> {
  const target = normalize(input);
  if (!target) return null;
  const all = getLearnedSnapshot();
  if (all.length === 0) return null;

  const scored = await scoreAll(input, all);
  const passing = scored.filter(passesEvidenceGate);

  if (import.meta.env.DEV) {
    const top = [...scored].sort((a, b) => b.bm25 + b.embed - (a.bm25 + a.embed))[0];
    console.log("[hybrid-match]", {
      query: input,
      passing: passing.length,
      total: all.length,
      topBm25: top ? Number(top.bm25.toFixed(3)) : 0,
      topEmbed: top ? Number(top.embed.toFixed(3)) : 0,
    });
  }

  if (passing.length === 0) return null;

  // RRF 점수 — passing set 안에서.
  const rrf = rrfScore(passing);

  // V4.1 topic 우선. query topic 박힘 + 같은 topic 통과 entry 있으면 그 안
  // 에서 가장 풍부한 (response 길이 최대) 1개. 없으면 RRF 1위.
  const queryTopic = extractTopic(input);
  if (queryTopic) {
    const sameTopic = passing.filter((s) => s.entry.topic === queryTopic);
    if (sameTopic.length > 0) {
      const sorted = sameTopic.map((s) => s.entry).sort(richestFirst);
      if (import.meta.env.DEV) {
        console.log("[hybrid-match] topic-pref", {
          topic: queryTopic,
          groupSize: sameTopic.length,
          pickedLen: sorted[0].response.length,
        });
      }
      return sorted[0];
    }
  }

  // RRF 1위.
  const sortedByRrf = [...passing].sort(
    (a, b) => (rrf.get(b.entry.id) ?? 0) - (rrf.get(a.entry.id) ?? 0),
  );
  return sortedByRrf[0].entry;
}

// V5 verify-gate 헤드리스용. 점수 분포를 외부에서 살피기 위한 export.
// 프로덕션 코드 (routes/index.tsx, demo/runner.ts) 는 사용 X — DEV/검증
// 스크립트 전용.
export async function debugScoreAll(input: string): Promise<Scored[]> {
  const all = getLearnedSnapshot();
  return scoreAll(input, all);
}

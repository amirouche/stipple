// Learned response — one row of "what the LLM said when the user asked X".
// Persisted across sessions so the next exact-match query can short-circuit
// the LLM call. V2 헌법 2번 (자동 학습) + 3번 (점진적 온디바이스 진화)의
// 데이터 단위.

import type { ProviderId } from "@/lib/ai/providers/types";

export type LearnedResponse = {
  id: string; // crypto.randomUUID()
  // What the user typed, verbatim. Phase A matching is exact (after lower
  // + trim); semantic similarity comes in Phase B/C.
  userInput: string;
  // The LLM's full text response, post-streaming.
  response: string;
  // Which provider produced it. Useful for "this was the cloud LLM, that was
  // WebLLM" debugging and for the future evolution narrative ("over
  // time, fewer cloud calls because cache hits").
  provider: "webllm" | ProviderId;
  // Pack inferred at generation time (composePack at that turn). Stored
  // as id+name so we can render the badge later without a Pack lookup
  // even if the pack got uninstalled.
  packId?: string;
  packName?: string;
  voice?: string;
  tone?: string;
  // First ~500 chars of the system prompt actually sent. Truncated to
  // keep storage small. Useful for debugging "why did it answer like
  // that" without re-running the full pipeline.
  systemPrompt?: string;
  createdAt: number; // Date.now()
  // Phase B 큐레이션: 사용자가 "좋아"·"다른 거" 클릭하면 rating + priority
  // 가 함께 갱신된다. priority는 매칭 정렬 키 — bad(-1)는 매칭에서 제외,
  // good(+1)은 같은 입력에 여러 응답이 있을 때 우선 선택.
  rating?: "good" | "bad";
  priority: number; // default 0, good = +1, bad = -1
  lastRatedAt?: number;
  // How many times this entry has been served on a match. Surfaces in
  // debug listing; Phase B에서 priority와 함께 ranking 보조 키.
  usedCount: number;
  // V4 시맨틱 매칭. 임베딩 모델 ready 상태에서 saveLearned가 자동 채운다.
  // localStorage 직렬화 호환을 위해 Float32Array가 아니라 number[]로
  // 보관 — 매칭 hot path에서 toFloat32로 한 번만 변환.
  // 모델 미사용 / 임베딩 실패 → undefined. matchLearnedResponse는 그
  // 엔트리를 정확 일치 경로로만 평가한다 (V3 fallback).
  vector?: number[];
  // V4.1 Topic consolidation. saveLearned 시점에 extractTopic(userInput)
  // 으로 채워진다. 같은 주제의 여러 entry를 묶어 단일 모드 (가장 풍부한
  // 1개) / 종합 모드 (메모 전시) 두 갈래로 흘리기 위한 그룹 키.
  // 추출 실패 (대부분 follow-up: "더 자세히") → undefined. 그런 entry는
  // V4 시맨틱 경로로 폴백.
  topic?: string;
  // V5 Hybrid sparse-retrieval. saveLearned 시점에 tokenize(userInput) 으로
  // 미리 박힘. BM25 매칭이 매 query 마다 모든 entry 를 재토큰화하지 않게
  // pre-compute. localStorage 에 그대로 직렬화 (string[] — 평균 ~30 bigram
  // / entry 라 storage 부담 미미). 마이그레이션 시 자동 채움.
  tokens?: string[];
};

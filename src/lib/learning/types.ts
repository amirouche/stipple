// Learned response — one row of "what the LLM said when the user asked X".
// Persisted across sessions so the next exact-match query can short-circuit
// the LLM call. V2 헌법 2번 (자동 학습) + 3번 (점진적 온디바이스 진화)의
// 데이터 단위.

export type LearnedResponse = {
  id: string; // crypto.randomUUID()
  // What the user typed, verbatim. Phase A matching is exact (after lower
  // + trim); semantic similarity comes in Phase B/C.
  userInput: string;
  // The LLM's full text response, post-streaming.
  response: string;
  // Which provider produced it. Useful for "this was Gemini, that was
  // WebLLM" debugging and for the future evolution narrative ("over
  // time, fewer Gemini calls because cache hits").
  provider: "webllm" | "gemini";
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
};

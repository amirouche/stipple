// V5.0 lite Phase I-2 / I-4 — 도메인 타입.
//
// Pack의 domain / excluded_domains 와 사용자 입력 매칭 결과를 묶음. domain
// dictionary는 단어 → 도메인 mapping. 매칭은 입력 토큰을 사전에서 찾아 도메인
// 카운트.
//
// I-4b (브라우저 세션) 에서 임베딩 추가 시 DomainDict + DomainScore 그대로
// 유지. score 계산만 word-level → semantic similarity로 확장.

// 도메인 사전 — 도메인 키워드 → 단어/표현 리스트.
//   { "레시피": ["레시피", "조리법", "만들기", ...], "맛집": [...] }
// 사용자 입력 토큰 t에 대해 t를 포함하는 도메인 모두 카운트 (한 토큰이 여러
// 도메인에 매핑될 수도 있음 — "닭"은 "음식" 만 hit, "맛집" 미hit).
export type DomainDict = Record<string, string[]>;

// 도메인별 매칭 점수. score = hit count. ties는 alphabetical 안정.
export type DomainScore = {
  domain: string;
  hits: string[]; // 매칭된 사용자 input 토큰 (디버그·trace 용)
  score: number; // hits.length
};

// 매칭 결과 묶음. routes/index.tsx 가 받아서 라우팅 결정.
export type DomainMatch = {
  // 입력 토큰 (정규화 후). cleanRequestedNoun 비교용.
  tokens: string[];
  // 모든 도메인 점수 (descending). 0 score는 제외.
  scores: DomainScore[];
  // 가장 높은 도메인. 동점이면 alphabetical 첫 번째.
  top?: DomainScore;
};

// Generic content shape for the Study pack folder. Each pack folder is a
// list of these — kind keeps the union open so other study packs (English,
// 일본어, etc.) can drop in problem/concept/vocab cards without changing
// the folder UI.

export type StudyTopic = "algebra" | "geometry" | "statistics" | "trigonometry";

export type StudyDifficulty = "easy" | "medium" | "hard";

export type CommonMistake = {
  // The exact wrong answer string this entry catches. Matched literally
  // against the user's selection so the on-device check can run without
  // touching the LLM.
  wrongAnswer: string;
  // Why a student typically picks this. Surfaced verbatim when matched.
  explanation: string;
  // Phase EN-fix E: 영어 모드 진단 본문. 미박힘 시 KO fallback. 데모 하이라이트
  // (특히 sat-m-005 삼각함수 부호 진단) — "AI가 어디서 틀렸는지 정확히 짚는다"
  // 가 영어로도 살게.
  explanationEn?: string;
};

export type SATMathProblem = {
  kind: "problem";
  subject: "sat-math";
  id: string;
  topic: StudyTopic;
  difficulty: StudyDifficulty;
  question: string;
  choices: string[];
  // The exact string from `choices` that is correct. Avoids index drift if
  // choices get reordered later.
  correctAnswer: string;
  hint: string;
  solution: string;
  commonMistakes: CommonMistake[];
  // Phase EN-fix E: 영어 모드 카드 렌더용 평행 필드. 미박힘 시 KO fallback.
  // 매처 (matchPackContent / facet) 는 KO 필드만 read — 영어 필드 추가는 카드
  // 렌더 (study.tsx) 에만 영향. SAT 자체가 원래 영어 시험이라 영어가 더
  // 자연스러움 (수식/숫자/보기는 그대로, 한국어 텍스트만 영어).
  questionEn?: string;
  hintEn?: string;
  solutionEn?: string;
  // V5.0 lite Phase A.5 facet — Study pack 마이그레이션. PackRecipe와 동일한
  // 5필드. 모두 optional → 미마이그레이션 problem은 기존 question/solution
  // 으로 fallback (backward compat 보장). topic 라벨이 entryName이라
  // facet은 problem이 아니라 topic 단위로 의미를 갖도록 작성한다.
  definition?: string;
  pack_context?: string;
  how_to?: string;
  examples?: string[];
  related_terms?: string[];
  // V5.0 lite Phase B3a 자기-기술 — PackRecipe와 동일 패턴. aliases가 매칭에
  // 사용되며 contexts는 향후 builder 분기용 (B3c+).
  aliases?: string[];
  contexts?: string[];
  // V5.0 lite Phase B3c — facet별 응답 옵션. PackRecipe.action_options와 동일
  // 구조. import는 type-only (런타임 영향 X, circular 회피).
  action_options?: Record<string, import("@/lib/dots-data").SuggestionOption[]>;
};

// Open union — add { kind: "concept"; ... } / { kind: "vocab"; ... } later.
export type StudyContent = SATMathProblem;

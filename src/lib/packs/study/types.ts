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
  // V5.0 lite Phase A.5 facet — Study pack 마이그레이션. PackRecipe와 동일한
  // 5필드. 모두 optional → 미마이그레이션 problem은 기존 question/solution
  // 으로 fallback (backward compat 보장). topic 라벨이 entryName이라
  // facet은 problem이 아니라 topic 단위로 의미를 갖도록 작성한다.
  definition?: string;
  pack_context?: string;
  how_to?: string;
  examples?: string[];
  related_terms?: string[];
};

// Open union — add { kind: "concept"; ... } / { kind: "vocab"; ... } later.
export type StudyContent = SATMathProblem;

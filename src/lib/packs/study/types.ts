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
};

// Open union — add { kind: "concept"; ... } / { kind: "vocab"; ... } later.
export type StudyContent = SATMathProblem;

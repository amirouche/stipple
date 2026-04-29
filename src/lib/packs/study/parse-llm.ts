// LLM이 반환한 SAT 수학 문제 텍스트를 SATMathProblem으로 파싱.
// 프롬프트는 다음 형식을 요청한다:
//
//   문제: ...
//   ① ...
//   ② ...
//   ③ ...
//   ④ ...
//   정답: ②
//   풀이: ...
//
// 파서는 줄 시작 라벨 + 약간의 변형(":". " ", 공백 차이)에 관용적이지만,
// 보기 4개와 명확한 정답 표기가 없으면 null을 돌려준다 — 그 경우엔 호출
// 측이 더미 폴백으로 대체.

import type { SATMathProblem } from "./types";

type Parsed = {
  question: string;
  choices: string[];
  correctIdx: number;
  solution: string;
};

const CHOICE_LINE_RE = /^([①②③④1-4])[\s.:)-]*\s*(.+)$/;

const SYM_TO_IDX: Record<string, number> = {
  "①": 0,
  "②": 1,
  "③": 2,
  "④": 3,
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
};

function parseLLMResponse(text: string): Parsed | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let question = "";
  const choices: string[] = [];
  let correctSym = "";
  const solutionLines: string[] = [];
  let inSolution = false;

  for (const line of lines) {
    if (inSolution) {
      solutionLines.push(line);
      continue;
    }
    if (line.startsWith("문제")) {
      question = line.replace(/^문제[:\s]*/, "").trim();
      continue;
    }
    if (line.startsWith("정답")) {
      correctSym = line.replace(/^정답[:\s]*/, "").trim();
      continue;
    }
    if (line.startsWith("풀이")) {
      const rest = line.replace(/^풀이[:\s]*/, "").trim();
      if (rest) solutionLines.push(rest);
      inSolution = true;
      continue;
    }
    const m = CHOICE_LINE_RE.exec(line);
    if (m && choices.length < 4) {
      choices.push(m[2].trim());
    }
  }

  if (!question || choices.length !== 4 || !correctSym) return null;
  const firstChar = correctSym.charAt(0);
  const idx = SYM_TO_IDX[firstChar];
  if (idx === undefined) return null;

  return {
    question,
    choices,
    correctIdx: idx,
    solution: solutionLines.join("\n").trim() || "풀이 정보가 없습니다.",
  };
}

// Dummy fallback when the LLM is down or the response can't be parsed.
// Rotates through a small pool keyed by how many user-generated problems
// already exist, so successive failures don't hand back the same problem.
const DUMMY_POOL: Parsed[] = [
  {
    question: "x² − 5x + 6 = 0의 해는?",
    choices: ["x = 1, 6", "x = 2, 3", "x = −2, −3", "x = 5, 1"],
    correctIdx: 1,
    solution: "인수분해: (x−2)(x−3) = 0 → x = 2 또는 x = 3.",
  },
  {
    question: "정육각형의 한 내각의 크기는?",
    choices: ["108°", "120°", "135°", "150°"],
    correctIdx: 1,
    solution: "내각의 합 = 180(n−2) = 720°. 한 내각 = 720 ÷ 6 = 120°.",
  },
  {
    question: "두 사건 A, B가 서로 독립이고 P(A) = 0.4, P(B) = 0.5일 때 P(A ∩ B)는?",
    choices: ["0.1", "0.2", "0.5", "0.9"],
    correctIdx: 1,
    solution: "독립이면 P(A ∩ B) = P(A) × P(B) = 0.4 × 0.5 = 0.2.",
  },
  {
    question: "log₂ 8 + log₂ 4 의 값은?",
    choices: ["4", "5", "6", "12"],
    correctIdx: 1,
    solution: "log₂ 8 = 3, log₂ 4 = 2. 합 = 5.",
  },
];

function dummyParsed(seed: number): Parsed {
  return DUMMY_POOL[seed % DUMMY_POOL.length];
}

// Convert a Parsed into a fully-typed SATMathProblem. id is generated.
function buildProblem(p: Parsed, opts: { source: "llm" | "dummy" }): SATMathProblem {
  const ts = Date.now();
  return {
    kind: "problem",
    subject: "sat-math",
    id: `sat-m-user-${ts}`,
    // LLM doesn't classify; default to medium. Topic is best-effort from
    // simple keyword sniffing; defaults to algebra.
    topic: detectTopic(p.question),
    difficulty: "medium",
    question: p.question,
    choices: p.choices,
    correctAnswer: p.choices[p.correctIdx],
    hint:
      opts.source === "dummy"
        ? "(샘플 문제로 대체) 보기를 비교해보고 가장 그럴듯한 걸 골라봐."
        : "이 문제는 방금 만들어진 거야. 차근차근 풀어봐.",
    solution: p.solution,
    // 사용자 풀이를 거치며 LLM 폴백으로 채워질 수 있도록 빈 배열로 시작.
    commonMistakes: [],
  };
}

function detectTopic(q: string): SATMathProblem["topic"] {
  const s = q.toLowerCase();
  if (/sin|cos|tan|삼각/.test(s)) return "trigonometry";
  if (/확률|주사위|사건|독립/.test(s)) return "statistics";
  if (/삼각형|사각형|넓이|각|길이|반지름|육각/.test(s)) return "geometry";
  return "algebra";
}

// One-stop entry: try parsing, fall back to dummy on any failure.
export function buildSATMathFromLLM(
  llmText: string,
  existingUserCount: number,
): { problem: SATMathProblem; source: "llm" | "dummy" } {
  const parsed = parseLLMResponse(llmText);
  if (parsed) {
    return { problem: buildProblem(parsed, { source: "llm" }), source: "llm" };
  }
  console.warn("[sat-math parse] failed, using dummy fallback. raw:", llmText.slice(0, 200));
  return {
    problem: buildProblem(dummyParsed(existingUserCount), { source: "dummy" }),
    source: "dummy",
  };
}

// Used when LLM call fails entirely (network/503/timeout).
export function buildSATMathDummy(existingUserCount: number): SATMathProblem {
  return buildProblem(dummyParsed(existingUserCount), { source: "dummy" });
}

// SAT 수학 문제 데모 — 5개. 답 검증, 힌트, 풀이, 자주 틀리는 답까지 모두
// 온디바이스에서 동작하도록 구조화했다. LLM은 `commonMistakes`에 잡히지
// 않는 깊은 설명이나 변형 문제 생성에만 호출된다.
//
// 사용자(또는 LLM)가 만든 문제는 user-store.ts에 영속되며, 조회는 항상
// 두 소스를 합쳐 본다 — 그래야 폴더와 매처에 새 문제가 곧바로 보인다.

import type { SATMathProblem } from "./types";
import { getUserSATProblems } from "./user-store";

export const SAT_MATH_PROBLEMS: SATMathProblem[] = [
  {
    kind: "problem",
    subject: "sat-math",
    id: "sat-m-001",
    topic: "algebra",
    difficulty: "easy",
    question: "2x + 3 = 11일 때, x의 값은?",
    choices: ["3", "4", "5", "5.5"],
    correctAnswer: "4",
    hint: "양변에서 3을 먼저 빼고, 그다음 2로 나눠.",
    solution: [
      "1) 양변에서 3을 뺀다: 2x = 11 − 3 = 8",
      "2) 양변을 2로 나눈다: x = 8 ÷ 2 = 4",
      "검산: 2(4) + 3 = 8 + 3 = 11 ✓",
    ].join("\n"),
    commonMistakes: [
      {
        wrongAnswer: "5.5",
        explanation:
          "11을 먼저 2로 나눠서 5.5가 나온 거야. +3을 양변에서 처리하지 않고 11을 통째로 나눠버리면 이렇게 돼. 등호 양변을 동시에 같은 연산으로 줄여나가야 해.",
      },
      {
        wrongAnswer: "5",
        explanation:
          "11/2를 5로 반올림한 결과야. 같은 실수 — +3을 빼는 단계를 건너뛰면 안 돼. 먼저 −3, 그다음 ÷2.",
      },
      {
        wrongAnswer: "3",
        explanation:
          "11에서 3을 빼는 건 맞는데, 그 다음 2로 나누는 단계를 빼먹은 듯. 8을 그대로 두지 말고 ÷2까지 가야 해.",
      },
    ],
    // V5.0 lite Phase A.5 facet — sat-m-001을 "대수" topic의 canonical entry로
    // 채움. collectEntries에서 sat-m-001과 sat-m-002 둘 다 entryName="대수"이지만
    // iteration order로 sat-m-001이 먼저 head로 잡힌다. 따라서 "대수" exact
    // match와 "수학"/"방정식" fuzzy match 모두 이 facet을 노출.
    definition:
      "대수(algebra)는 미지수와 식의 관계를 다루는 수학 분야야. 일차/이차 방정식을 풀어 미지수를 구하거나, 함수 형태로 변수 간 관계를 다룬다.",
    pack_context:
      "Study Companion 팩의 SAT 수학 5문제 중 대수 2문제(일차·이차)가 들어 있어. 미적분, 선형대수학 같은 대학 수준은 cloud나 별도 팩 참조.",
    how_to:
      "기본은 등호 양변에 같은 연산을 적용해서 미지수를 분리. 일차는 한 번에 풀리고, 이차는 인수분해 / 근의 공식 / 꼭짓점 공식으로 접근. 검산까지 가는 게 안전해.",
    examples: ["일차방정식 (2x+3=11)", "이차함수 꼭짓점 (x²−4x+3)"],
    related_terms: ["일차", "이차", "방정식", "함수", "꼭짓점"],
    // V5.0 lite Phase B3d — Study trace 누수 케이스 직격 해소. 어제 trace
    // 분석에서 fuzzy로 빠지던 "방정식", "이차 방정식" 입력이 모두 exact-alias
    // 로 격상. "대수학" 학명도 함께. 길이 desc 정렬.
    // B3d revision: "수학" 단독 alias 제거 — 너무 broad. 미래 sat-m-002~005
    // 마이그레이션 시 모든 수학 입력이 sat-m-001로 매핑되는 회귀 위험.
    // future: sat-m-002 (이차 방정식) 마이그레이션 시 "방정식" alias 충돌 검토.
    aliases: ["이차 방정식", "수학 문제", "대수학", "방정식"],
    contexts: ["definition", "how_to", "search", "casual"],
    // V5.0 Phase B3c action_options — 학습 entry 옵션. SAT folder open + 새 문제
    // 생성이 핵심. craving은 study contexts에 없어 미정의 (학습에 식욕 없음).
    action_options: {
      how_to: [
        { kind: "open-folder", label: "풀어볼래", target: "/study" },
        {
          kind: "llm-call",
          label: "새 문제 받을래",
          systemPrompt:
            "당신은 SAT 수학 튜터입니다. 한국어로 친절하지만 간결하게 답하세요. 사용자가 요청한 형식을 정확히 지키세요.",
          prompt: [
            "SAT 수학 객관식 문제 1개를 새로 만들어 주세요. 다음 형식을 정확히 지켜주세요.",
            "",
            "문제: [한 두 문장의 문제]",
            "① [보기 1]",
            "② [보기 2]",
            "③ [보기 3]",
            "④ [보기 4]",
            "정답: [번호]",
            "풀이: [두세 줄의 짧은 풀이]",
          ].join("\n"),
          postAction: "save-as-sat-problem",
        },
      ],
      definition: [
        { kind: "open-folder", label: "풀어볼래", target: "/study" },
        {
          kind: "llm-call",
          label: "더 자세히",
          prompt: "대수에 대해 더 자세히 알려줘. 한국어로 짧고 정확하게.",
        },
      ],
      search: [
        { kind: "open-folder", label: "풀어볼래", target: "/study" },
        {
          kind: "llm-call",
          label: "새 문제 받을래",
          systemPrompt:
            "당신은 SAT 수학 튜터입니다. 한국어로 친절하지만 간결하게 답하세요. 사용자가 요청한 형식을 정확히 지키세요.",
          prompt: [
            "SAT 수학 객관식 문제 1개를 새로 만들어 주세요. 다음 형식을 정확히 지켜주세요.",
            "",
            "문제: [한 두 문장의 문제]",
            "① [보기 1]",
            "② [보기 2]",
            "③ [보기 3]",
            "④ [보기 4]",
            "정답: [번호]",
            "풀이: [두세 줄의 짧은 풀이]",
          ].join("\n"),
          postAction: "save-as-sat-problem",
        },
      ],
      casual: [{ kind: "open-folder", label: "풀어볼래", target: "/study" }],
    },
  },
  {
    kind: "problem",
    subject: "sat-math",
    id: "sat-m-002",
    topic: "algebra",
    difficulty: "medium",
    question: "이차함수 y = x² − 4x + 3의 꼭짓점 좌표는?",
    choices: ["(1, 0)", "(2, −1)", "(−2, 15)", "(3, 0)"],
    correctAnswer: "(2, −1)",
    hint: "꼭짓점의 x좌표는 −b/(2a). 거기에 대입해서 y를 구해.",
    solution: [
      "1) 꼭짓점 x = −b / (2a) = −(−4) / (2·1) = 4/2 = 2",
      "2) y = (2)² − 4(2) + 3 = 4 − 8 + 3 = −1",
      "3) 따라서 꼭짓점은 (2, −1).",
    ].join("\n"),
    commonMistakes: [
      {
        wrongAnswer: "(−2, 15)",
        explanation:
          "−b/(2a)에서 부호를 한 번 더 뒤집어서 −2로 본 거 같아. b = −4니까 −b는 +4, 2a로 나누면 +2야. 부호 두 번 뒤집힘 주의.",
      },
      {
        wrongAnswer: "(1, 0)",
        explanation: "y = 0이 되는 x를 푼 거 — 그건 x절편이야 (x=1 또는 x=3). 꼭짓점이 아니라.",
      },
      {
        wrongAnswer: "(3, 0)",
        explanation:
          "또 다른 x절편. 꼭짓점은 두 x절편의 가운데지 절편 자체가 아니야. (1+3)/2 = 2를 다시 떠올려봐.",
      },
    ],
  },
  {
    kind: "problem",
    subject: "sat-math",
    id: "sat-m-003",
    topic: "geometry",
    difficulty: "easy",
    question: "직각삼각형의 두 직각변이 각각 6, 4일 때 넓이는?",
    choices: ["10", "12", "24", "20"],
    correctAnswer: "12",
    hint: "삼각형 넓이 공식 — ½ × 밑변 × 높이.",
    solution: [
      "1) 직각삼각형은 두 직각변을 밑변·높이로 잡을 수 있어.",
      "2) 넓이 = ½ × 6 × 4 = ½ × 24 = 12",
    ].join("\n"),
    commonMistakes: [
      {
        wrongAnswer: "24",
        explanation: "½을 빼먹은 답. 6 × 4 = 24까지만 한 거야. 삼각형 공식엔 항상 ½이 붙어.",
      },
      {
        wrongAnswer: "10",
        explanation: "6 + 4 = 10. 변끼리 더한 거 — 그건 둘레의 일부지 넓이가 아니야.",
      },
      {
        wrongAnswer: "20",
        explanation:
          "어디서 나온 숫자인지 보면, 6 × 4 = 24에서 비스듬히 깎아본 듯. 정공법: ½ × 밑변 × 높이 = ½ × 6 × 4.",
      },
    ],
  },
  {
    kind: "problem",
    subject: "sat-math",
    id: "sat-m-004",
    topic: "statistics",
    difficulty: "medium",
    question: "공정한 6면 주사위 두 개를 던질 때, 두 눈의 합이 7이 될 확률은?",
    choices: ["1/6", "1/12", "5/36", "7/36"],
    correctAnswer: "1/6",
    hint: "전체 경우의 수는 6×6. 합이 7이 되는 (a, b) 쌍을 모두 세어봐 — 순서 다른 것도 따로.",
    solution: [
      "1) 전체 경우: 6 × 6 = 36",
      "2) 합이 7이 되는 쌍: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) — 6가지",
      "3) 확률 = 6/36 = 1/6",
    ].join("\n"),
    commonMistakes: [
      {
        wrongAnswer: "1/12",
        explanation:
          "(1,6) (2,5) (3,4) 3가지만 세고 순서를 바꾼 (6,1) (5,2) (4,3)을 빼먹은 답. 두 주사위는 구별되니까 순서 다른 것도 따로 세야 해.",
      },
      {
        wrongAnswer: "5/36",
        explanation:
          "합이 6 또는 8이 될 확률이야. 둘 다 5가지 경우. 7만 정확히 6가지인 게 핵심 — 가운데 합이라.",
      },
      {
        wrongAnswer: "7/36",
        explanation:
          "분자에 7을 그대로 쓴 답이지만, 합이 7이 되는 쌍은 6가지야. '합 = 분자' 매칭은 우연히 맞을 때도 있어도 일반적으로 틀려.",
      },
    ],
  },
  {
    kind: "problem",
    subject: "sat-math",
    id: "sat-m-005",
    topic: "trigonometry",
    difficulty: "hard",
    question: "sin θ = 3/5이고 θ가 1사분면에 있을 때, cos θ의 값은?",
    choices: ["3/4", "4/5", "5/4", "−4/5"],
    correctAnswer: "4/5",
    hint: "sin² θ + cos² θ = 1. 1사분면이니까 cos는 양수.",
    solution: [
      "1) sin² θ = (3/5)² = 9/25",
      "2) cos² θ = 1 − 9/25 = 16/25",
      "3) cos θ = ±4/5. θ가 1사분면이므로 cos θ > 0.",
      "4) 따라서 cos θ = 4/5.",
    ].join("\n"),
    commonMistakes: [
      {
        wrongAnswer: "3/4",
        explanation:
          "sin/cos = tan = 3/4를 cos로 잘못 적은 답이야. tan θ = 3/4지 cos θ가 아니야. 헷갈리면 항등식 sin² + cos² = 1로 돌아가.",
      },
      {
        wrongAnswer: "−4/5",
        explanation:
          "값 자체는 맞게 구했는데 부호를 놓쳤어. 1사분면(0 < θ < 90°)에서는 sin·cos·tan 모두 양수야.",
      },
      {
        wrongAnswer: "5/4",
        explanation:
          "분자/분모가 뒤집힌 답 — 1/cos = sec θ를 cos로 본 거 같아. cos는 1보다 클 수 없어 (|cos θ| ≤ 1).",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// On-device validation helpers — no LLM, no network. The whole point of the
// pack/folder model is that the 90% case (correct? wrong? which mistake?)
// stays on the device.
// ---------------------------------------------------------------------------

export function getAllSATMathProblems(): SATMathProblem[] {
  // Base 5 first, then user-generated ones — that ordering makes the
  // newest content visibly stack onto the bottom of the folder rather
  // than reshuffling the curated set.
  return [...SAT_MATH_PROBLEMS, ...getUserSATProblems()];
}

export function getSATMathProblem(id: string): SATMathProblem | undefined {
  return (
    SAT_MATH_PROBLEMS.find((p) => p.id === id) ?? getUserSATProblems().find((p) => p.id === id)
  );
}

export type CheckResult =
  | { kind: "correct"; problem: SATMathProblem }
  | {
      kind: "incorrect";
      problem: SATMathProblem;
      selected: string;
      // If the selection matches a known wrong-answer pattern, the
      // explanation comes from the pack data — no LLM needed. Otherwise
      // null and the UI offers a "더 자세히" button that calls Gemini.
      mistakeExplanation: string | null;
    };

export function checkAnswer(problemId: string, selected: string): CheckResult | null {
  const problem = getSATMathProblem(problemId);
  if (!problem) return null;
  if (selected === problem.correctAnswer) {
    return { kind: "correct", problem };
  }
  const mistake = problem.commonMistakes.find((m) => m.wrongAnswer === selected);
  return {
    kind: "incorrect",
    problem,
    selected,
    mistakeExplanation: mistake?.explanation ?? null,
  };
}

const TOPIC_KO: Record<StudyTopic_, string> = {
  algebra: "대수",
  geometry: "기하",
  statistics: "확률·통계",
  trigonometry: "삼각함수",
};

type StudyTopic_ = SATMathProblem["topic"];

export function topicLabel(t: SATMathProblem["topic"]): string {
  return TOPIC_KO[t];
}

const DIFFICULTY_KO: Record<SATMathProblem["difficulty"], string> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};

export function difficultyLabel(d: SATMathProblem["difficulty"]): string {
  return DIFFICULTY_KO[d];
}

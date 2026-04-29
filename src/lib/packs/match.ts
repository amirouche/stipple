// 온디바이스 콘텐츠 매처. 사용자 입력이 들어오면 먼저 여기를 통해 활성 팩
// + 다른 설치 팩의 contents를 훑는다. 매칭이 있으면 buildPackSuggestion이
// 버튼 옵션이 붙은 답변 페이로드를 만들어 LLM 호출 없이 화면에 띄울 수
// 있게 한다. 매칭이 없을 때만 기존처럼 composeAnswer → Gemini로 흘러간다.

import {
  COOKING_RECIPES,
  type AnswerPayload,
  type Pack,
  type PackRecipe,
  type SuggestionOption,
} from "@/lib/dots-data";
import { getSATMathProblem } from "@/lib/packs/study/sat-math";
import type { SATMathProblem } from "@/lib/packs/study/types";

// 문제별 키워드 — 특정 문제를 정확히 가리키는 단어들. "삼각비" 같은 입력이
// 들어오면 sat-m-005만 점수 받음.
const SAT_MATH_KEYWORDS: Record<string, string[]> = {
  "sat-m-001": ["일차", "방정식", "linear", "equation"],
  "sat-m-002": ["이차", "꼭짓점", "포물선", "parabola", "quadratic", "vertex"],
  "sat-m-003": ["삼각형", "넓이", "직각", "triangle", "area"],
  "sat-m-004": ["확률", "주사위", "probability", "dice"],
  "sat-m-005": ["삼각비", "삼각함수", "sin", "cos", "tan", "trig"],
};

// 팩 전체를 가리키는 일반 키워드. "수학"이 들어오면 5문제 전부가 약하게
// 매치되고, 결과는 pack-level로 분류된다 ("SAT 수학 5문제 있어").
const SAT_MATH_GENERIC = ["수학", "math", "sat", "문제", "퀴즈"];

const COOKING_RECIPE_KEYWORDS: Record<string, string[]> = {
  "baek-kimchi-jjigae": ["김치찌개", "김치", "찌개", "백종원", "돼지"],
  "tuna-kimchi-jjigae": ["김치찌개", "김치", "찌개", "참치", "두부"],
};

const COOKING_GENERIC = ["요리", "레시피", "음식", "cook", "recipe"];

// Score thresholds:
//   - SPECIFIC_HIT (>=3): user named a topic-specific term → content-level match
//   - GENERIC_HIT (1):    only the umbrella keyword fired → pack-level match
const SPECIFIC_HIT_SCORE = 3;

export type ContentMatch =
  | { kind: "sat-math"; problem: SATMathProblem; score: number }
  | { kind: "cooking-recipe"; recipe: PackRecipe; score: number };

export type PackMatchResult = {
  pack: Pack;
  isActivePack: boolean;
  // True when no specific content scored above the generic threshold —
  // the user's query is about the pack as a whole, not one item.
  packLevel: boolean;
  matches: ContentMatch[];
};

function lower(s: string): string {
  return s.toLowerCase();
}

function scoreSATMath(q: string, problem: SATMathProblem): number {
  let score = 0;
  for (const k of SAT_MATH_KEYWORDS[problem.id] ?? []) {
    if (q.includes(lower(k))) score += SPECIFIC_HIT_SCORE;
  }
  for (const k of SAT_MATH_GENERIC) {
    if (q.includes(lower(k))) {
      score += 1;
      break; // generic keywords only count once per problem
    }
  }
  return score;
}

function scoreCookingRecipe(q: string, recipe: PackRecipe): number {
  let score = 0;
  for (const k of COOKING_RECIPE_KEYWORDS[recipe.id] ?? []) {
    if (q.includes(lower(k))) score += SPECIFIC_HIT_SCORE;
  }
  for (const k of COOKING_GENERIC) {
    if (q.includes(lower(k))) {
      score += 1;
      break;
    }
  }
  return score;
}

export function matchPackContent(
  query: string,
  installedPacks: Pack[],
  activePackId?: string,
): PackMatchResult | null {
  const q = lower(query);

  type Candidate = {
    pack: Pack;
    isActive: boolean;
    matches: ContentMatch[];
    bestScore: number;
  };

  const candidates: Candidate[] = [];

  for (const pack of installedPacks) {
    if (!pack.contents || pack.contents.length === 0) continue;
    const matches: ContentMatch[] = [];
    for (const ref of pack.contents) {
      if (ref.kind === "sat-math") {
        const problem = getSATMathProblem(ref.problemId);
        if (!problem) continue;
        const score = scoreSATMath(q, problem);
        if (score > 0) matches.push({ kind: "sat-math", problem, score });
      } else if (ref.kind === "cooking-recipe") {
        const recipe = COOKING_RECIPES.find((r) => r.id === ref.recipeId);
        if (!recipe) continue;
        const score = scoreCookingRecipe(q, recipe);
        if (score > 0) matches.push({ kind: "cooking-recipe", recipe, score });
      }
    }
    if (matches.length === 0) continue;
    matches.sort((a, b) => b.score - a.score);
    candidates.push({
      pack,
      isActive: pack.id === activePackId,
      matches,
      bestScore: matches[0].score,
    });
  }

  if (candidates.length === 0) return null;

  // Active pack wins ties; otherwise highest-scoring pack wins.
  candidates.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.bestScore - a.bestScore;
  });

  const winner = candidates[0];
  const packLevel = winner.bestScore < SPECIFIC_HIT_SCORE;
  // Pack-level match → keep all matches (used for "5문제 있어"). Content-
  // level → keep only the items that tie at the top score, capped at 2.
  const matches = packLevel
    ? winner.matches
    : winner.matches.filter((m) => m.score === winner.bestScore).slice(0, 2);

  return {
    pack: winner.pack,
    isActivePack: winner.isActive,
    packLevel,
    matches,
  };
}

// ---------------------------------------------------------------------------
// Suggestion text + button options
// ---------------------------------------------------------------------------

const SAT_TOPIC_LABEL: Record<SATMathProblem["topic"], string> = {
  algebra: "대수",
  geometry: "기하",
  statistics: "확률·통계",
  trigonometry: "삼각함수",
};

function buildSATMathSuggestion(result: PackMatchResult): {
  text: string;
  options: SuggestionOption[];
} {
  const { pack, packLevel, matches } = result;
  const head = matches[0];
  if (head?.kind !== "sat-math") {
    return { text: `${pack.name}에서 비슷한 게 보여.`, options: [] };
  }

  const text = packLevel
    ? `${pack.name}에 SAT 수학 ${matches.length}문제 있어. 풀어볼래? 아니면 새 문제 받을래?`
    : `${pack.name}에 ${SAT_TOPIC_LABEL[head.problem.topic]} 문제(${head.problem.difficulty === "easy" ? "쉬움" : head.problem.difficulty === "medium" ? "보통" : "어려움"}) 있어. 풀어볼래?`;

  const options: SuggestionOption[] = [
    { kind: "open-folder", label: "풀어볼래", target: "/study" },
    {
      kind: "llm-call",
      label: "새 문제 받을래",
      // systemPrompt overrides whatever pack persona the thread is in. SAT
      // math under a cooking persona would just make Gemini refuse.
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
    },
  ];

  return { text, options };
}

function buildCookingSuggestion(result: PackMatchResult): {
  text: string;
  options: SuggestionOption[];
} {
  const { pack, packLevel, matches } = result;
  const head = matches[0];
  if (head?.kind !== "cooking-recipe") {
    return { text: `${pack.name}에서 비슷한 게 보여.`, options: [] };
  }

  let text: string;
  if (packLevel) {
    text = `${pack.name}에 레시피 ${matches.length}개 있어. 보여줄까?`;
  } else if (matches.length === 1) {
    text = `${pack.name}에 ${head.recipe.title} 레시피 있어. 보여줄까? 아니면 다른 음식?`;
  } else {
    text = `${pack.name}에 비슷한 레시피 ${matches.length}개 있어. 어떤 거 볼래?`;
  }

  const recipeOptions: SuggestionOption[] = matches
    .filter((m): m is ContentMatch & { kind: "cooking-recipe" } => m.kind === "cooking-recipe")
    .slice(0, 2)
    .map((m) => ({
      kind: "show-recipe",
      label: matches.length === 1 ? "보여줘" : m.recipe.title,
      recipeId: m.recipe.id,
    }));

  const options: SuggestionOption[] = [
    ...recipeOptions,
    {
      kind: "llm-call",
      label: "다른 음식",
      prompt: "다른 요리 하나 추천해줘. 비슷한 결인데 살짝 다른 걸로.",
    },
  ];

  return { text, options };
}

export function buildPackSuggestion(result: PackMatchResult): AnswerPayload {
  const head = result.matches[0];
  let body: { text: string; options: SuggestionOption[] };
  if (head?.kind === "sat-math") {
    body = buildSATMathSuggestion(result);
  } else if (head?.kind === "cooking-recipe") {
    body = buildCookingSuggestion(result);
  } else {
    body = { text: `${result.pack.name}에서 비슷한 게 보여.`, options: [] };
  }
  return {
    kind: "pack-suggestion",
    text: body.text,
    options: body.options,
    matchedPackName: result.pack.name,
  };
}

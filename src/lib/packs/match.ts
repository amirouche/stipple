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
import { getUserSATProblems } from "@/lib/packs/study/user-store";

// 문제별 키워드 — 특정 문제를 정확히 가리키는 단어들. "삼각비" 같은 입력이
// 들어오면 sat-m-005만 점수 받음.
const SAT_MATH_KEYWORDS: Record<string, string[]> = {
  "sat-m-001": ["일차", "방정식", "linear", "equation"],
  "sat-m-002": ["이차", "꼭짓점", "포물선", "parabola", "quadratic", "vertex"],
  "sat-m-003": ["삼각형", "넓이", "직각", "triangle", "area"],
  "sat-m-004": ["확률", "주사위", "probability", "dice"],
  "sat-m-005": ["삼각비", "삼각함수", "sin", "cos", "tan", "trig"],
};

// SAT 수학 도메인 키워드. 이 중 하나라도 hit하면 팩 매칭이 성립한다 —
// "수학" 단독이면 5문제 전부 약하게 매치되고 pack-level로 분류된다.
const SAT_MATH_DOMAIN = [
  "수학",
  "math",
  "sat",
  "방정식",
  "함수",
  "기하",
  "확률",
  "삼각",
  "통계",
  "대수",
];

// 일반 학습 키워드. 단독으로는 매칭 X — DOMAIN 또는 specific 키워드와
// 함께 있어야 점수에 가산된다. 이 게이트가 "사회문제" / "국어 문제"
// 같은 입력이 SAT 수학으로 잘못 잡히던 버그를 막는다.
const SAT_MATH_GENERIC = ["문제", "퀴즈", "테스트", "problem", "quiz", "test"];

const COOKING_RECIPE_KEYWORDS: Record<string, string[]> = {
  "baek-kimchi-jjigae": ["김치찌개", "김치", "찌개", "백종원", "돼지"],
  "tuna-kimchi-jjigae": ["김치찌개", "김치", "찌개", "참치", "두부"],
};

// Cooking-domain substrings — any single hit counts as a cooking signal.
// Mirrors SAT_MATH_DOMAIN's role: prevents an input like "양자역학" from
// drifting into Cooking just because the cooking pack is installed.
//
// Note: "국" / "밥" / "면" are very short Korean tokens and can collide
// (e.g. "한국어" contains "국"). Kept per spec — if false positives show
// up in production we narrow to compounds like "국밥" / "찌개국" instead.
const COOKING_DOMAIN = [
  "요리",
  "레시피",
  "음식",
  "cook",
  "recipe",
  "조리",
  "찌개",
  "국",
  "밥",
  "면",
  "반찬",
  "디저트",
  "재료",
  "양념",
  "백종원",
];

// Cooking-generic — too broad to match alone. Only counts when a
// specific-recipe or domain keyword also fired. "맛집 추천해줘" alone
// shouldn't surface kimchi recipes; "한식 레시피" should (domain hit
// via "레시피").
const COOKING_GENERIC = ["맛", "한식", "양식", "추천"];

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
  let specific = 0;
  let domain = 0;
  let generic = 0;
  for (const k of SAT_MATH_KEYWORDS[problem.id] ?? []) {
    if (q.includes(lower(k))) {
      specific += SPECIFIC_HIT_SCORE;
      break;
    }
  }
  for (const k of SAT_MATH_DOMAIN) {
    if (q.includes(lower(k))) {
      domain = 1;
      break;
    }
  }
  for (const k of SAT_MATH_GENERIC) {
    if (q.includes(lower(k))) {
      generic = 1;
      break;
    }
  }
  // Gate: must have a specific (per-problem) or domain keyword. Generic-
  // only ("사회문제" → only "문제" matches GENERIC) → 0, lets the input
  // fall through to store search instead of mis-matching SAT math.
  if (specific === 0 && domain === 0) return 0;
  return specific + domain + generic;
}

function scoreCookingRecipe(q: string, recipe: PackRecipe): number {
  let specific = 0;
  let domain = 0;
  let generic = 0;
  for (const k of COOKING_RECIPE_KEYWORDS[recipe.id] ?? []) {
    if (q.includes(lower(k))) {
      specific += SPECIFIC_HIT_SCORE;
      // Don't break — multiple recipe keywords reinforcing the signal
      // (김치 + 찌개 + 백종원) is fine, but cap at one bonus per recipe
      // to keep scoring comparable across packs.
      break;
    }
  }
  for (const k of COOKING_DOMAIN) {
    if (q.includes(lower(k))) {
      domain = 1;
      break;
    }
  }
  for (const k of COOKING_GENERIC) {
    if (q.includes(lower(k))) {
      generic = 1;
      break;
    }
  }
  // Gate: same shape as scoreSATMath. Generic-only ("맛집 추천" → only
  // "맛" + "추천" GENERIC, no DOMAIN) returns 0 so the input falls through
  // to store search / Stage 3. "양자역학" → 0 across the board → 0.
  if (specific === 0 && domain === 0) return 0;
  return specific + domain + generic;
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
    // User-generated SAT problems live outside the static contents array
    // (added at runtime). Pull them in here so a user-saved problem also
    // counts toward "Study에 N문제 있어".
    if (pack.id === "study-companion") {
      for (const problem of getUserSATProblems()) {
        const score = scoreSATMath(q, problem);
        if (score > 0) matches.push({ kind: "sat-math", problem, score });
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
      // Tells the chat handler to parse the response and store it in the
      // Study pack rather than showing raw text in chat.
      postAction: "save-as-sat-problem",
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
    matchedPackId: result.pack.id,
  };
}

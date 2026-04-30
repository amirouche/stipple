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
import {
  cosineSimilarity,
  embed,
  embedBatch,
  getEmbeddingStatus,
  PACK_SIMILARITY_THRESHOLD,
} from "@/lib/embedding";
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

// Study 팩 도메인 키워드. SAT 수학 전용("수학", "방정식")부터 학습 전반
// ("공부", "설명")까지 묶음. 이 중 한 단어 hit이면 팩 매칭이 성립 —
// "수학" 단독이면 5문제 전부 약하게 매치되어 pack-level로 분류된다.
// "공부"/"설명"이 빠져 있어 inferDomainPack soft에서 cooking이 잘못
// 잡히던 버그(회귀 진단 BUG #2) 수정 차원에서 보강.
const STUDY_DOMAIN = [
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
  "공부",
  "study",
  "homework",
  "설명",
];

// 일반 학습 키워드. 단독으로는 매칭 X — DOMAIN 또는 specific 키워드와
// 함께 있어야 점수에 가산된다. 이 게이트가 "사회문제" / "국어 문제"
// 같은 입력이 SAT 수학으로 잘못 잡히던 버그를 막는다.
const STUDY_GENERIC = ["문제", "퀴즈", "테스트", "problem", "quiz", "test"];

const COOKING_RECIPE_KEYWORDS: Record<string, string[]> = {
  "baek-kimchi-jjigae": ["김치찌개", "김치", "찌개", "백종원", "돼지"],
  "tuna-kimchi-jjigae": ["김치찌개", "김치", "찌개", "참치", "두부"],
};

// Cooking-domain substrings — any single hit counts as a cooking signal.
// Mirrors STUDY_DOMAIN's role: prevents an input like "양자역학" from
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

// Score weights — rescaled so we can apply a "must be confident" threshold
// before forcing the user into a local match. With these weights:
//   "김치찌개"        → specific(60) + domain(30) = 90   → match
//   "한식 레시피"     → domain(30)   + generic(5)  = 35   → match (pack-level)
//   "수학"            → domain(30)                 = 30   → match (pack-level)
//   "메뉴 추천"       → only generic, gated to 0           → LLM
//   "양자역학"        → no hit                     = 0    → LLM
// 회귀 진단 BUG #1: domain alone(20)이 MATCH_THRESHOLD(30) 미만이라 "수학"
// 단독 입력이 카드로 안 떴다. 30으로 올려 domain hit만으로도 pack-level
// 매칭이 성립하게.
// V2 헌법: 자연스러움 우선. 점수 낮으면 억지로 카드 띄우지 말고 LLM이
// 자연스러운 톤으로 답하게.
const SPECIFIC_HIT_SCORE = 60;
const DOMAIN_HIT_SCORE = 30;
const GENERIC_HIT_SCORE = 5;

// Below this, matchPackContent returns null even though we found a
// non-zero score — the input is too ambiguous to justify a SuggestionBlock.
// inferDomainPack still surfaces the leaning pack so the LLM can pick up
// its voice/tone for a natural response.
export const MATCH_THRESHOLD = 30;

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

// Two scoring modes:
//   "strict" — matchPackContent. Generic-only inputs ("맛집 추천") gate
//              to 0 so we don't surface a SuggestionBlock from a single
//              broad word.
//   "soft"   — inferDomainPack. Generic-only is enough to lean toward a
//              pack, because all we're doing is hinting voice/tone for
//              the LLM. "메뉴 추천" leans cooking; we want that.
type ScoreMode = "strict" | "soft";

function scoreSATMath(q: string, problem: SATMathProblem, mode: ScoreMode): number {
  let specific = 0;
  let domain = 0;
  let generic = 0;
  for (const k of SAT_MATH_KEYWORDS[problem.id] ?? []) {
    if (q.includes(lower(k))) {
      specific += SPECIFIC_HIT_SCORE;
      break;
    }
  }
  for (const k of STUDY_DOMAIN) {
    if (q.includes(lower(k))) {
      domain = DOMAIN_HIT_SCORE;
      break;
    }
  }
  for (const k of STUDY_GENERIC) {
    if (q.includes(lower(k))) {
      generic = GENERIC_HIT_SCORE;
      break;
    }
  }
  if (mode === "strict" && specific === 0 && domain === 0) return 0;
  return specific + domain + generic;
}

function scoreCookingRecipe(q: string, recipe: PackRecipe, mode: ScoreMode): number {
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
      domain = DOMAIN_HIT_SCORE;
      break;
    }
  }
  for (const k of COOKING_GENERIC) {
    if (q.includes(lower(k))) {
      generic = GENERIC_HIT_SCORE;
      break;
    }
  }
  if (mode === "strict" && specific === 0 && domain === 0) return 0;
  return specific + domain + generic;
}

type Candidate = {
  pack: Pack;
  isActive: boolean;
  matches: ContentMatch[];
  bestScore: number;
};

// V4 Hybrid Search — 팩 콘텐츠 시맨틱 매칭. 모듈 단위 캐시: 첫 매칭 호출
// 시 모든 팩 콘텐츠를 batch로 임베딩해서 보관. 사용자가 모델을 바꾸면
// (768d ↔ 384d) 차원이 달라지므로 캐시를 비우고 다시 구축.
const packVectorCache = new Map<string, Float32Array>();
let packVectorBuildPromise: Promise<void> | null = null;
let lastBuildModelId: string | undefined;

function packVectorKey(kind: ContentMatch["kind"], id: string): string {
  return `${kind}:${id}`;
}

function getRecipeMatchText(r: PackRecipe): string {
  // 매칭에 가장 중요한 신호: 제목 + 주요 재료. 단계는 매칭 노이즈 많음
  // ("끓이다"·"썰다" 같은 일반 동사). 시연 시 "백종원" / "참치" / "두부"가
  // 핵심 식별자.
  const ingredients = r.ingredients.map((i) => i.item).join(" ");
  return `${r.title} ${ingredients}`;
}

function getSATMatchText(p: SATMathProblem): string {
  // 한국어 토픽 라벨 + 문제 본문. 라벨이 한국어이므로 사용자가 한국어로
  // 입력해도 의미 거리가 가깝다 ("기하" / "삼각형" 등).
  return `${SAT_TOPIC_LABEL[p.topic]} ${p.question}`;
}

async function ensurePackVectors(installedPacks: Pack[]): Promise<void> {
  const status = getEmbeddingStatus();
  if (status.state !== "ready") return;
  // 모델이 바뀌면 차원도 바뀌므로 캐시 폐기 후 다시 구축.
  if (lastBuildModelId !== status.model) {
    packVectorCache.clear();
    lastBuildModelId = status.model;
    packVectorBuildPromise = null;
  }
  if (packVectorBuildPromise) return packVectorBuildPromise;

  packVectorBuildPromise = (async () => {
    type Item = { key: string; text: string };
    const items: Item[] = [];
    for (const pack of installedPacks) {
      if (!pack.contents) continue;
      for (const ref of pack.contents) {
        if (ref.kind === "sat-math") {
          const p = getSATMathProblem(ref.problemId);
          if (!p) continue;
          const key = packVectorKey("sat-math", p.id);
          if (packVectorCache.has(key)) continue;
          items.push({ key, text: getSATMatchText(p) });
        } else if (ref.kind === "cooking-recipe") {
          const r = COOKING_RECIPES.find((x) => x.id === ref.recipeId);
          if (!r) continue;
          const key = packVectorKey("cooking-recipe", r.id);
          if (packVectorCache.has(key)) continue;
          items.push({ key, text: getRecipeMatchText(r) });
        }
      }
      if (pack.id === "study-companion") {
        for (const p of getUserSATProblems()) {
          const key = packVectorKey("sat-math", p.id);
          if (packVectorCache.has(key)) continue;
          items.push({ key, text: getSATMatchText(p) });
        }
      }
    }
    if (items.length === 0) return;
    try {
      const vectors = await embedBatch(items.map((i) => i.text));
      items.forEach((item, i) => packVectorCache.set(item.key, vectors[i]));
    } catch (err) {
      console.warn("[packs] 콘텐츠 임베딩 실패, 키워드만 사용:", err);
    }
  })();

  await packVectorBuildPromise;
  packVectorBuildPromise = null;
}

// 키워드 점수와 시맨틱 점수를 합친다. 두 신호 중 큰 값을 사용 — OR 게이트.
//   - 키워드 hit (specific 60 / domain 30 / generic 5)이 강하면 그대로
//   - 시맨틱 유사도 0.85 이상이면 sim*100으로 스케일해서 같이 비교
//   - 둘 다 약하면 합쳐도 약함 → 매칭 임계값(30) 미달로 미스
function combineScores(
  keywordScore: number,
  queryVec: Float32Array | null,
  vectorKey: string,
): number {
  if (!queryVec) return keywordScore;
  const stored = packVectorCache.get(vectorKey);
  if (!stored) return keywordScore;
  const sim = cosineSimilarity(queryVec, stored);
  if (sim < PACK_SIMILARITY_THRESHOLD) return keywordScore;
  return Math.max(keywordScore, sim * 100);
}

// Shared scoring loop. Builds candidates with non-zero scores; sorts so
// the active pack wins ties, then highest-score wins. Both
// matchPackContent and inferDomainPack use this — same scoring different
// modes (strict gates generic-only to 0; soft keeps it).
//
// V4: queryVec이 주어지면 시맨틱 점수를 키워드 점수와 max로 합친다.
// queryVec === null이면 V3 키워드만 — 모델 미사용 / inferDomainPack soft
// 모드 호출 시.
function scoreCandidates(
  query: string,
  installedPacks: Pack[],
  activePackId: string | undefined,
  mode: ScoreMode,
  queryVec: Float32Array | null = null,
): Candidate[] {
  const q = lower(query);
  const candidates: Candidate[] = [];

  for (const pack of installedPacks) {
    if (!pack.contents || pack.contents.length === 0) continue;
    const matches: ContentMatch[] = [];
    for (const ref of pack.contents) {
      if (ref.kind === "sat-math") {
        const problem = getSATMathProblem(ref.problemId);
        if (!problem) continue;
        const keyword = scoreSATMath(q, problem, mode);
        const score = combineScores(keyword, queryVec, packVectorKey("sat-math", problem.id));
        if (score > 0) matches.push({ kind: "sat-math", problem, score });
      } else if (ref.kind === "cooking-recipe") {
        const recipe = COOKING_RECIPES.find((r) => r.id === ref.recipeId);
        if (!recipe) continue;
        const keyword = scoreCookingRecipe(q, recipe, mode);
        const score = combineScores(keyword, queryVec, packVectorKey("cooking-recipe", recipe.id));
        if (score > 0) matches.push({ kind: "cooking-recipe", recipe, score });
      }
    }
    // User-generated SAT problems live outside the static contents array
    // (added at runtime). Pull them in here so a user-saved problem also
    // counts toward "Study에 N문제 있어".
    if (pack.id === "study-companion") {
      for (const problem of getUserSATProblems()) {
        const keyword = scoreSATMath(q, problem, mode);
        const score = combineScores(keyword, queryVec, packVectorKey("sat-math", problem.id));
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

  // Active pack wins ties; otherwise highest-scoring pack wins.
  candidates.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.bestScore - a.bestScore;
  });

  return candidates;
}

export async function matchPackContent(
  query: string,
  installedPacks: Pack[],
  activePackId?: string,
): Promise<PackMatchResult | null> {
  // V4 Hybrid Search 준비: 첫 호출 시 팩 콘텐츠를 batch로 임베딩 (모델
  // ready일 때만). 이후 호출은 캐시 hit. 모델 미사용 환경에선 즉시 return.
  await ensurePackVectors(installedPacks);

  // 사용자 입력 임베딩. 모델 미사용 / 임베딩 실패 시 null로 흘려 V3
  // 키워드 매칭만 작동.
  let queryVec: Float32Array | null = null;
  if (getEmbeddingStatus().state === "ready") {
    try {
      queryVec = await embed(query);
    } catch (err) {
      console.warn("[packs] 사용자 입력 임베딩 실패, 키워드만 사용:", err);
    }
  }

  const candidates = scoreCandidates(query, installedPacks, activePackId, "strict", queryVec);
  if (candidates.length === 0) return null;

  const winner = candidates[0];
  // V2: 점수가 임계값 미만이면 매칭 자체를 포기한다. "메뉴 추천"·"수학"
  // 같은 모호한 입력은 SuggestionBlock 강제 X, Stage 3 LLM이 자연스럽게.
  if (winner.bestScore < MATCH_THRESHOLD) return null;

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

// V2 voice/tone hint: when matchPackContent returns null but the input
// still leans toward a domain ("메뉴 추천" → cooking domain via "추천"
// generic, "수학" → study domain via "수학" domain), surface the
// closest pack so Stage 3 dispatch can apply its voice/tone. Matching
// itself is too soft to show a SuggestionBlock, but the LLM answering
// in cooking voice still feels right.
//
// Returns undefined when no pack scored above 0 — fully off-topic input
// like "양자역학" gets the default DOTS tone.
export function inferDomainPack(
  query: string,
  installedPacks: Pack[],
  activePackId?: string,
): Pack | undefined {
  // Soft mode: generic-only inputs ("메뉴 추천" → only "추천" GENERIC)
  // count as cooking-leaning even though matchPackContent would gate
  // them to 0. The point is to give the LLM a voice/tone hint, not to
  // surface a card.
  const candidates = scoreCandidates(query, installedPacks, activePackId, "soft");
  return candidates[0]?.pack;
}

// ---------------------------------------------------------------------------
// Intent: definition / explanation request
// ---------------------------------------------------------------------------
//
// V2 라우터 진화. "찜부추국수는 뭐야?" 같은 입력은 음식 도메인 키워드는
// hit이지만 사용자 의도는 카드(레시피/스토어 추천)가 아니라 *설명*이다.
// 도메인 매칭만 보고 카드를 띄우면 의도와 어긋난 응답이 된다.
//
// 이 함수가 true면 send()는 Stage 1(matchPackContent)과 Stage 2
// (searchStoreForQuery)를 skip하고 Stage 2.5(학습 캐시) → Stage 3(LLM)
// 으로 흘려보낸다. inferDomainPack은 그대로 호출되므로 voice/tone은
// 도메인에 맞춰 따라간다 — 단지 카드가 안 뜰 뿐.
//
// 키워드 선정 노트:
//   - "뭐야"·"뭐지"·"뭐예요"는 명백한 WHAT-IS 질문. "뭐" 단독은
//     "뭐든 추천" 같은 비-정의 표현과 충돌하므로 **포함하지 않는다**.
//   - "?" 단독은 신호로 안 친다. "김치찌개 만드는 법?"이 정의 요청으로
//     오인되어 레시피 카드가 사라지면 회귀.
//   - 키워드 hit이 없으면 false → 기존 매칭 흐름 그대로.
const DEFINITION_PATTERNS = [
  // WHAT-IS 형 질문
  "뭐야",
  "뭐지",
  "뭐예요",
  "뭔데",
  "무엇",
  // 명시적 설명 요청
  "설명해",
  "설명 해",
  "설명해줘",
  // 미지(unfamiliarity) 표현
  "처음 들어",
  "들어봐",
  "처음이야",
  "모르는데",
  "모르겠어",
  "잘 모르",
  // 어떤 것 / which-is 형
  "어떤 거",
  "어떤 것",
  // 영어
  "what is",
  "what's",
  "explain",
  "never heard",
  "don't know",
];

export function hasDefinitionIntent(text: string): boolean {
  const q = lower(text);
  return DEFINITION_PATTERNS.some((p) => q.includes(p));
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

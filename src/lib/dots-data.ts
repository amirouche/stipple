// Shared mock data + simulated DOTS routing logic.
// DOTS = local-first. Check packs and memory before reaching for anything deeper.

import { lookupMemory, type LookupResult } from "@/lib/memory";
import type { Pitch } from "@/lib/pitch/types";

// Folder content reference. The actual content lives in
// `src/lib/packs/<pack>/...`; the pack only carries pointers so dots-data.ts
// stays a flat catalog and doesn't transitively pull every pack's data into
// every consumer.
export type PackContentRef =
  | { kind: "sat-math"; problemId: string }
  | { kind: "cooking-recipe"; recipeId: string };

export type Pack = {
  id: string;
  name: string;
  category: "Cooking" | "Education" | "Lifestyle" | "Work";
  installed: boolean;
  short: string;
  behavior: string;
  triggers: string[];
  // Injected into the AI's system prompt when this pack is the active mode.
  // Defines tone, answer shape, recommendation flow — not just a trigger label.
  systemPrompt: string;
  // Content the pack ships as a folder. Empty/undefined = mode-only pack
  // (no folder view).
  contents?: PackContentRef[];
  // Route for this pack's folder UI. Only set on packs that have a
  // dedicated folder screen — drives the ◇ icon in the chat header. A
  // pack can have contents (used by matchPackContent) without having a
  // folderRoute (no dedicated screen, content rendered inline).
  folderRoute?: string;
};

export const PACKS: Pack[] = [
  {
    id: "cooking-essentials",
    name: "Cooking Essentials",
    category: "Cooking",
    installed: true,
    short: "Recipes returned as structured execution units.",
    behavior:
      "Reformats any food question into ingredients, steps, timing, and tips. Remembers your spice tolerance and household size.",
    triggers: [
      "recipe",
      "cook",
      "stew",
      "kimchi",
      "pasta",
      "ingredients",
      "김치찌개",
      "찌개",
      "요리",
      "레시피",
    ],
    systemPrompt: [
      "지금 당신은 요리 전문가 모드입니다.",
      "- 답변은 짧고 실용적으로. 재료, 조리법, 타이밍, 팁 위주로.",
      "- 음식 추천 흐름으로 자연스럽게 끌어가세요. 사용자가 음식 얘기를 안 해도, 식사 시간대(아침·점심·저녁)면 자연스럽게 음식 화제로 연결하세요.",
      "- 모호한 질문도 음식·식사·장보기 관점으로 다시 풀어서 답하세요.",
    ].join("\n"),
    contents: [
      { kind: "cooking-recipe", recipeId: "baek-kimchi-jjigae" },
      { kind: "cooking-recipe", recipeId: "tuna-kimchi-jjigae" },
    ],
  },
  {
    id: "study-companion",
    name: "Study Companion",
    category: "Education",
    installed: true,
    short: "Adapts explanations to your current level.",
    behavior: "Breaks complex topics into a 3-layer scaffold and quizzes you instead of lecturing.",
    triggers: ["explain", "what is", "study", "homework", "설명", "공부", "뭐야"],
    systemPrompt: [
      "지금 당신은 학습 코치 모드입니다.",
      "- 답변은 단계적이고 차분하게. 톤은 침착함을 유지하세요.",
      "- 개념을 설명할 땐 비유 → 예시 → 핵심 정리, 3단계로 구조화하세요.",
      "- 사용자의 질문이 흐트러져 있으면, 먼저 한 줄로 정리해주고 답변을 시작하세요.",
      "- 모호한 질문도 학습·이해·정리 관점으로 풀어서 답하세요.",
    ].join("\n"),
    contents: [
      { kind: "sat-math", problemId: "sat-m-001" },
      { kind: "sat-math", problemId: "sat-m-002" },
      { kind: "sat-math", problemId: "sat-m-003" },
      { kind: "sat-math", problemId: "sat-m-004" },
      { kind: "sat-math", problemId: "sat-m-005" },
    ],
    folderRoute: "/study",
  },
  {
    id: "morning-routine",
    name: "Morning Routine",
    category: "Lifestyle",
    installed: true,
    short: "Local, fast answers for your daily rhythm.",
    behavior:
      "Handles weather, schedule, and reminders from on-device memory without going to the cloud.",
    triggers: ["weather", "schedule", "today", "remind", "날씨", "오늘", "일정"],
    systemPrompt: [
      "지금 당신은 아침 루틴 동반자 모드입니다.",
      "- 답변은 짧고 부드럽게. 에너지를 끌어올리는 톤이지만 과하지 않게.",
      "- 운동, 식사, 컨디션, 일정 위주로 답하세요.",
      "- 절대 길게 말하지 마세요 — 사용자가 하루를 시작하는 데 방해되면 안 됩니다. 1~2 문장이 기본입니다.",
    ].join("\n"),
  },
  {
    id: "focus-writer",
    name: "Focus Writer",
    category: "Work",
    installed: false,
    short: "Calm, opinionated editing for long-form writing.",
    behavior: "Suggests cuts before additions. Refuses to pad prose. Tracks your typical voice.",
    triggers: ["edit", "rewrite", "draft"],
    systemPrompt: [
      "지금 당신은 글쓰기 편집자 모드입니다.",
      "- 답변은 간결하고 단호하게. 칭찬·아이스브레이커는 빼세요.",
      "- 추가보다 삭제를 먼저 제안하세요. 늘어진 문장은 거부하세요.",
      "- 사용자의 평소 목소리를 유지하면서 군더더기만 정리하세요.",
    ].join("\n"),
  },
  {
    id: "wine-cellar",
    name: "Wine & Pairing",
    category: "Lifestyle",
    installed: false,
    short: "Pairings tuned to what's actually in your kitchen.",
    behavior: "Combines pack heuristics with dormant memory of your past meals.",
    triggers: ["wine", "pair", "drink"],
    systemPrompt: [
      "지금 당신은 와인 큐레이터 모드입니다.",
      "- 답변은 감각적이지만 구체적으로. 가격대·지역·페어링을 정확히 제시하세요.",
      "- 추천할 땐 사용자의 음식, 기분, 예산에 맞춰서 좁히세요.",
      "- 모호한 질문도 와인·페어링·테이스팅 관점으로 풀어서 답하세요.",
    ].join("\n"),
  },
  {
    id: "code-review",
    name: "Code Review",
    category: "Work",
    installed: false,
    short: "Reviews diffs against your team's conventions.",
    behavior: "Loads your repo style as a local pack so reviews stay consistent.",
    triggers: ["review", "diff", "pr"],
    systemPrompt: [
      "지금 당신은 시니어 엔지니어 모드입니다.",
      "- 답변은 직설적이고 기술적으로. 과한 칭찬은 빼세요.",
      "- 코드를 받으면 — 문제점 → 개선안 → 트레이드오프 순서로 답하세요.",
      "- 모호한 질문도 엔지니어링·아키텍처·코드 품질 관점으로 풀어서 답하세요.",
    ].join("\n"),
  },
];

export type Route = "local" | "memory" | "deep";

// ---------------------------------------------------------------------------
// Seeded local memory — what DOTS already knows about this user.
// ---------------------------------------------------------------------------

export const LOCAL_MEMORY = {
  recentTopics: ["점심 메뉴", "요리", "공부"],
  preferences: ["김치찌개", "된장찌개"],
  savedRecipeTitles: ["백종원식 김치찌개", "참치김치찌개"],
};

export type SavedRecipe = {
  id: string;
  title: string;
  mentioned: string;
  note: string;
  matches: string[];
};

export const SAVED_RECIPES: SavedRecipe[] = [
  {
    id: "baek-kimchi-jjigae",
    title: "백종원식 김치찌개",
    mentioned: "2주 전에 저장",
    note: "돼지고기 앞다리살에 설탕 한 꼬집 들어가는 버전.",
    matches: ["kimchi", "김치", "찌개", "백종원", "돼지"],
  },
  {
    id: "tuna-kimchi-jjigae",
    title: "참치김치찌개",
    mentioned: "지난주에 저장",
    note: "참치캔이랑 두부로 빨리 끓이는 평일 저녁용.",
    matches: ["kimchi", "김치", "찌개", "참치", "두부"],
  },
];

// ---------------------------------------------------------------------------
// Pack content — Cooking Essentials structured recipes.
// ---------------------------------------------------------------------------

export type PackRecipe = {
  id: string;
  title: string;
  serves: string;
  total: string;
  ingredients: { item: string; amount: string }[];
  steps: { t: string; minutes?: number }[];
  tip: string;
};

export const COOKING_RECIPES: PackRecipe[] = [
  {
    id: "baek-kimchi-jjigae",
    title: "백종원식 김치찌개",
    serves: "2인분",
    total: "약 30분",
    ingredients: [
      { item: "묵은지", amount: "1/4포기, 큼직하게" },
      { item: "돼지고기 앞다리살", amount: "200g" },
      { item: "두부", amount: "1/2모" },
      { item: "대파", amount: "1대" },
      { item: "양파", amount: "1/2개" },
      { item: "설탕", amount: "1/2 작은술" },
      { item: "고춧가루", amount: "1 큰술" },
      { item: "물", amount: "3컵" },
    ],
    steps: [
      { t: "냄비에 돼지고기를 먼저 볶아 기름을 낸다.", minutes: 4 },
      { t: "묵은지와 양파를 넣고 같이 볶는다.", minutes: 5 },
      { t: "물을 붓고 설탕, 고춧가루를 넣어 끓인다.", minutes: 15 },
      { t: "두부와 대파를 넣고 한 번 더 끓인다.", minutes: 5 },
    ],
    tip: "설탕 한 꼬집이 김치의 신맛을 잡아줘. 너무 많이 넣으면 안 돼.",
  },
  {
    id: "tuna-kimchi-jjigae",
    title: "참치김치찌개",
    serves: "2인분",
    total: "약 20분",
    ingredients: [
      { item: "묵은지", amount: "2컵" },
      { item: "참치캔", amount: "1캔 (기름 빼서)" },
      { item: "두부", amount: "1/2모" },
      { item: "대파", amount: "1대" },
      { item: "마늘", amount: "1 큰술" },
      { item: "고춧가루", amount: "1 큰술" },
      { item: "물 또는 멸치육수", amount: "2.5컵" },
    ],
    steps: [
      { t: "냄비에 김치, 마늘, 고춧가루를 넣고 잠깐 볶는다.", minutes: 3 },
      { t: "육수를 붓고 끓어오르면 중불로 줄인다.", minutes: 10 },
      { t: "참치와 두부를 넣고 더 끓인다.", minutes: 5 },
      { t: "대파를 올려 마무리.", minutes: 1 },
    ],
    tip: "참치 기름을 빼야 국물이 깔끔해. 두부는 마지막에 넣어야 안 부서져.",
  },
];

// ---------------------------------------------------------------------------
// Study Companion pack content.
// ---------------------------------------------------------------------------

export const STUDY_PACK = {
  prompts: [
    "어디까지 알고 있는지 한 줄만 말해줘.",
    "지금 막히는 지점이 정확히 어디야?",
    "이게 시험용인지, 그냥 이해하고 싶은 건지?",
  ],
  shortAnswerHint: "한 문장으로 정리해줄게.",
  deepExplanationHint: "그럼 단계별로 풀어볼게.",
};

// ---------------------------------------------------------------------------
// Routing — local-first decision making.
// ---------------------------------------------------------------------------

const MEMORY_TRIGGERS = ["전에", "아까", "저장", "기억", "지난번", "예전"];
const COOKING_TRIGGERS = ["recipe", "cook", "김치찌개", "찌개", "요리", "레시피", "끓"];

export type RouteDecision = {
  route: Route;
  pack?: Pack;
  reason: string;
  lookup?: LookupResult;
};

export function routeQuery(query: string, installedPacks: Pack[]): RouteDecision {
  const q = query.toLowerCase().trim();

  // Light greetings — answer naturally, no status. Skip lookup entirely.
  const isGreeting =
    /^(안녕|하이|반가워|헬로|hi|hello|hey|yo|오랜만)/i.test(q) || q.split(/\s+/).length <= 1;
  if (isGreeting) {
    return { route: "local", reason: "" };
  }

  // Local-first: consult memory + archives before any pack/deep decision.
  // Side-effect: dormant matches get woken to active.
  const lookup = lookupMemory(query);

  // Memory-first: user explicitly references prior context.
  const wantsMemory = MEMORY_TRIGGERS.some((t) => q.includes(t));
  if (wantsMemory) {
    return {
      route: "memory",
      reason: "전에 얘기한 거 먼저 볼게.",
      lookup,
    };
  }

  // Cooking-first: explicit cooking signal goes to the pack.
  const cookingHit = COOKING_TRIGGERS.some((t) => q.includes(t));
  const cookingPack = installedPacks.find((p) => p.id === "cooking-essentials");
  if (cookingHit && cookingPack) {
    return {
      route: "local",
      pack: cookingPack,
      reason: "",
      lookup,
    };
  }

  // Other pack triggers.
  const hit = installedPacks.find((p) => p.triggers.some((t) => q.includes(t)));
  if (hit) {
    return { route: "local", pack: hit, reason: "", lookup };
  }

  // No pack matched — but if local memory has hits, prefer memory over deep.
  // This is the rule-book's "로컬 우선 판단": deep is the last resort.
  if (lookup.totalScore > 0) {
    return {
      route: "memory",
      reason: "전에 본 게 있어서 그쪽 먼저 볼게.",
      lookup,
    };
  }

  // Nothing local — go deeper.
  return {
    route: "deep",
    reason: "안에서는 바로 안 잡혀.",
    lookup,
  };
}

// Saved recipes are a separate, hand-curated collection from the auto-captured
// memory layer. We still trigger a memory lookup here so dormant memories that
// the user is asking about wake up correctly — even when the saved-recipe
// match is what ends up rendered.
export function recallFromMemory(query: string): SavedRecipe[] {
  lookupMemory(query);
  const q = query.toLowerCase();
  return SAVED_RECIPES.filter((r) => r.matches.some((m) => q.includes(m)));
}

// Greetings stay low-effort.
const KO_GREETINGS = ["안녕.", "응, 왔어.", "안녕. 편하게 있어.", "어, 안녕.", "왔구나."];

function pickGreeting(): string {
  return KO_GREETINGS[Math.floor(Math.random() * KO_GREETINGS.length)];
}

// ---------------------------------------------------------------------------
// Answer composition — varied, local-first, no fixed fallback.
// ---------------------------------------------------------------------------

// One-click action attached to a pack-suggestion. The whole point of the
// suggestion is to offer the user a no-LLM path (open the folder, render
// the matched recipe inline) plus a single explicit "fall back to LLM"
// choice — so the model isn't called speculatively.
//
// llm-call carries an optional systemPrompt so the matched pack (e.g. SAT
// 수학 튜터 페르소나) can override the chat thread's active-pack persona.
// Without this, asking for SAT math while the thread is in cooking mode
// makes the cooking persona refuse or drift off-task.
export type SuggestionOption =
  | { kind: "open-folder"; label: string; target: string }
  | { kind: "show-recipe"; label: string; recipeId: string }
  | { kind: "llm-call"; label: string; prompt: string; systemPrompt?: string };

export type AnswerPayload =
  | { kind: "text"; text: string; pitch?: Pitch }
  | { kind: "recipe"; recipeId: string; intro?: string; pitch?: Pitch }
  | { kind: "memory-recipes"; recipeIds: string[]; intro: string; pitch?: Pitch }
  | {
      kind: "pack-suggestion";
      text: string;
      options: SuggestionOption[];
      matchedPackName: string;
    };

export function answerFor(query: string, pack?: Pack, route?: Route): AnswerPayload {
  const q = query.toLowerCase();

  // No `\b` — JS word-boundary doesn't fire on Hangul, which made "안녕" miss
  // this branch and fall through to the deep-route fallback text.
  if (/^(안녕|하이|반가워|헬로|오랜만|hi|hello|hey|yo)/i.test(q)) {
    return { kind: "text", text: pickGreeting() };
  }

  // ---- MEMORY HIT: warm, recall-flavored. References "전에", "저장해둔". ----
  if (route === "memory") {
    const matches = recallFromMemory(query);
    if (matches.length === 1) {
      const m = matches[0];
      const intros = [
        `응, 전에 저장해둔 ${m.title} 있어.`,
        `${m.mentioned}한 ${m.title}, 이거 맞아?`,
      ];
      return {
        kind: "memory-recipes",
        recipeIds: [m.id],
        intro: intros[Math.floor(Math.random() * intros.length)],
      };
    }
    if (matches.length > 1) {
      const titles = matches.map((m) => m.title);
      const intros = [
        `응, 전에 저장해둔 김치찌개 쪽에서 ${matches.length}개가 보여. ${titles.join(", ")}.`,
        `전에 이야기한 레시피 중엔 김치찌개가 ${matches.length}가지 있어 — ${titles.join(", ")}. 어느 쪽 볼래?`,
      ];
      return {
        kind: "memory-recipes",
        recipeIds: matches.map((m) => m.id),
        intro: intros[Math.floor(Math.random() * intros.length)],
      };
    }
    // Memory route triggered but nothing actually saved on this topic.
    return {
      kind: "text",
      text: "그 얘기는 저장된 게 안 잡히네. 어떤 거였는지 한 마디만 더 줄래?",
    };
  }

  // ---- PACK HIT: direct, structured. No preamble — just the result. ----
  if (pack?.id === "cooking-essentials") {
    const recipeId = q.includes("참치") ? "tuna-kimchi-jjigae" : "baek-kimchi-jjigae";
    return { kind: "recipe", recipeId };
  }

  if (pack?.id === "morning-routine") {
    return {
      kind: "text",
      text: "맑은 아침이고 14도야. 10시 30분에 미라랑 약속 하나 있고, 점심 전까지는 그것 말곤 별다른 일정 없어.",
    };
  }

  if (pack?.id === "study-companion") {
    return {
      kind: "text",
      text: STUDY_PACK.prompts[0],
    };
  }

  // Generic kimchi mention without an active pack.
  if (q.includes("김치") || q.includes("kimchi")) {
    return {
      kind: "text",
      text: "김치찌개는 보통 묵은지에 돼지고기나 참치, 두부, 양파를 넣고 끓여. 자세한 비율 필요하면 말해.",
    };
  }

  // ---- NO LOCAL RESULT: honest, slightly slower, signals it's reaching. ----
  const deepReplies = [
    "지금 안에 있는 것만으론 애매해서 조금 더 확인해볼게.",
    "이건 안에서는 안 잡혀. 잠깐 더 봐야겠다.",
    "음, 가진 걸로는 부족해. 조금만 시간 줘.",
  ];
  return {
    kind: "text",
    text: deepReplies[Math.floor(Math.random() * deepReplies.length)],
  };
}

export function getCookingRecipe(id: string): PackRecipe | undefined {
  return COOKING_RECIPES.find((r) => r.id === id);
}

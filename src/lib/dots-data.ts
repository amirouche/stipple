// Shared mock data + simulated DOTS routing logic.
// DOTS = local-first. Check packs and memory before reaching for anything deeper.

export type Pack = {
  id: string;
  name: string;
  category: "Cooking" | "Education" | "Lifestyle" | "Work";
  installed: boolean;
  short: string;
  behavior: string;
  triggers: string[];
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
    triggers: ["recipe", "cook", "stew", "kimchi", "pasta", "ingredients", "김치찌개", "찌개", "요리", "레시피"],
  },
  {
    id: "study-companion",
    name: "Study Companion",
    category: "Education",
    installed: true,
    short: "Adapts explanations to your current level.",
    behavior:
      "Breaks complex topics into a 3-layer scaffold and quizzes you instead of lecturing.",
    triggers: ["explain", "what is", "study", "homework", "설명", "공부", "뭐야"],
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
  },
  {
    id: "focus-writer",
    name: "Focus Writer",
    category: "Work",
    installed: false,
    short: "Calm, opinionated editing for long-form writing.",
    behavior:
      "Suggests cuts before additions. Refuses to pad prose. Tracks your typical voice.",
    triggers: ["edit", "rewrite", "draft"],
  },
  {
    id: "wine-cellar",
    name: "Wine & Pairing",
    category: "Lifestyle",
    installed: false,
    short: "Pairings tuned to what's actually in your kitchen.",
    behavior:
      "Combines pack heuristics with dormant memory of your past meals.",
    triggers: ["wine", "pair", "drink"],
  },
  {
    id: "code-review",
    name: "Code Review",
    category: "Work",
    installed: false,
    short: "Reviews diffs against your team's conventions.",
    behavior:
      "Loads your repo style as a local pack so reviews stay consistent.",
    triggers: ["review", "diff", "pr"],
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

export function routeQuery(
  query: string,
  installedPacks: Pack[]
): { route: Route; pack?: Pack; reason: string } {
  const q = query.toLowerCase().trim();

  // Light greetings — answer naturally, no status.
  const isGreeting =
    /^(안녕|하이|반가워|헬로|hi|hello|hey|yo|오랜만)/i.test(q) ||
    q.split(/\s+/).length <= 1;
  if (isGreeting) {
    return { route: "local", reason: "" };
  }

  // Memory-first: user explicitly references prior context.
  const wantsMemory = MEMORY_TRIGGERS.some((t) => q.includes(t));
  if (wantsMemory) {
    return {
      route: "memory",
      reason: "잠깐, 전에 얘기한 거 먼저 볼게.",
    };
  }

  // Cooking-first: explicit cooking signal goes to the pack.
  const cookingHit = COOKING_TRIGGERS.some((t) => q.includes(t));
  const cookingPack = installedPacks.find((p) => p.id === "cooking-essentials");
  if (cookingHit && cookingPack) {
    // If we also have a saved match, treat as memory recall too.
    const memHit = recallFromMemory(query);
    if (memHit.length > 0) {
      return {
        route: "memory",
        pack: cookingPack,
        reason: "저장해둔 게 있어서 먼저 꺼내볼게.",
      };
    }
    return {
      route: "local",
      pack: cookingPack,
      reason: "",
    };
  }

  // Other pack triggers.
  const hit = installedPacks.find((p) =>
    p.triggers.some((t) => q.includes(t))
  );
  if (hit) {
    return { route: "local", pack: hit, reason: "" };
  }

  // Nothing local matches — go deeper, but say it naturally.
  return {
    route: "deep",
    reason: "안에서는 안 잡히네. 조금 더 찾아볼게.",
  };
}

export function recallFromMemory(query: string): SavedRecipe[] {
  const q = query.toLowerCase();
  return SAVED_RECIPES.filter((r) => r.matches.some((m) => q.includes(m)));
}

// Greetings stay low-effort.
const KO_GREETINGS = [
  "안녕.",
  "응, 왔어.",
  "안녕. 편하게 있어.",
  "어, 안녕.",
  "왔구나.",
];

function pickGreeting(): string {
  return KO_GREETINGS[Math.floor(Math.random() * KO_GREETINGS.length)];
}

// ---------------------------------------------------------------------------
// Answer composition — varied, local-first, no fixed fallback.
// ---------------------------------------------------------------------------

export type AnswerPayload =
  | { kind: "text"; text: string }
  | { kind: "recipe"; recipeId: string; intro?: string }
  | { kind: "memory-recipes"; recipeIds: string[]; intro: string };

export function answerFor(
  query: string,
  pack?: Pack,
  route?: Route
): AnswerPayload {
  const q = query.toLowerCase();

  if (/^(안녕|하이|반가워|헬로|오랜만|hi|hello|hey|yo)\b/i.test(q)) {
    return { kind: "text", text: pickGreeting() };
  }

  // Memory recall path — surface saved recipes with natural phrasing.
  if (route === "memory") {
    const matches = recallFromMemory(query);
    if (matches.length === 1) {
      return {
        kind: "memory-recipes",
        recipeIds: [matches[0].id],
        intro: `전에 저장해둔 ${matches[0].title} 있어. 이걸로 볼래?`,
      };
    }
    if (matches.length > 1) {
      return {
        kind: "memory-recipes",
        recipeIds: matches.map((m) => m.id),
        intro: `저장된 거 두 개 있어. ${matches.map((m) => m.title).join(", ")}. 어느 쪽?`,
      };
    }
    // memory route but no match — be honest, stay calm.
    return {
      kind: "text",
      text: "그 얘기는 저장된 게 안 잡히네. 다시 한번 떠올려볼래?",
    };
  }

  // Cooking pack — return a structured recipe.
  if (pack?.id === "cooking-essentials") {
    if (q.includes("참치")) {
      return { kind: "recipe", recipeId: "tuna-kimchi-jjigae" };
    }
    return {
      kind: "recipe",
      recipeId: "baek-kimchi-jjigae",
    };
  }

  // Morning routine pack.
  if (pack?.id === "morning-routine") {
    return {
      kind: "text",
      text: "맑은 아침이고 14도야. 10시 30분에 미라랑 약속 하나 있고, 점심 전까지는 그것 말곤 별다른 일정 없어.",
    };
  }

  // Study pack.
  if (pack?.id === "study-companion") {
    return {
      kind: "text",
      text: STUDY_PACK.prompts[0],
    };
  }

  // Generic kimchi mention without pack — short prose.
  if (q.includes("김치") || q.includes("kimchi")) {
    return {
      kind: "text",
      text: "김치찌개는 보통 묵은지에 돼지고기나 참치, 두부, 양파를 넣고 끓여. 자세한 비율 필요하면 말해.",
    };
  }

  // Deep route (unknown territory) — varied, never the same fallback twice.
  const deepReplies = [
    "그건 안에 없네. 조금만 시간 줘.",
    "처음 보는 얘기야. 잠깐 정리해볼게.",
    "음, 이건 좀 더 봐야겠다.",
  ];
  return {
    kind: "text",
    text: deepReplies[Math.floor(Math.random() * deepReplies.length)],
  };
}

export function getCookingRecipe(id: string): PackRecipe | undefined {
  return COOKING_RECIPES.find((r) => r.id === id);
}

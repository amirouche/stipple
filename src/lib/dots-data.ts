// Shared mock data + simulated DOTS routing logic.
// DOTS = local pack/memory check first, escalate to deeper inference if needed.

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
    triggers: ["recipe", "cook", "stew", "kimchi", "pasta", "ingredients"],
  },
  {
    id: "study-companion",
    name: "Study Companion",
    category: "Education",
    installed: true,
    short: "Adapts explanations to your current level.",
    behavior:
      "Breaks complex topics into a 3-layer scaffold and quizzes you instead of lecturing.",
    triggers: ["explain", "what is", "study", "homework"],
  },
  {
    id: "morning-routine",
    name: "Morning Routine",
    category: "Lifestyle",
    installed: true,
    short: "Local, fast answers for your daily rhythm.",
    behavior:
      "Handles weather, schedule, and reminders from on-device memory without going to the cloud.",
    triggers: ["weather", "schedule", "today", "remind"],
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

// A small slice of "what the user has previously mentioned" — the kind of
// thing a real local memory store would hold. Used by the demo flow to show
// recall happening before any inference.
export type SavedRecipe = {
  id: string;
  title: string;
  mentioned: string; // human-readable timestamp
  note: string;
  matches: string[]; // lowercase tokens that should trigger recall
};

export const SAVED_RECIPES: SavedRecipe[] = [
  {
    id: "moms-kimchi-jjigae",
    title: "Mom's kimchi jjigae",
    mentioned: "saved 3 weeks ago",
    note: "You mentioned she uses anchovy stock and skips sugar.",
    matches: ["kimchi", "jjigae", "stew"],
  },
  {
    id: "weeknight-kimchi-tofu",
    title: "Weeknight kimchi & tofu",
    mentioned: "saved 6 days ago",
    note: "Lighter version, no pork. You called it 'the lazy one.'",
    matches: ["kimchi", "tofu", "stew"],
  },
];

// Decide whether DOTS can answer from what it already knows, or take a longer
// look. The user never sees a handoff — it's all the same conversation.
export function routeQuery(
  query: string,
  installedPacks: Pack[]
): { route: Route; pack?: Pack; reason: string } {
  const q = query.toLowerCase().trim();

  // Light greetings and very short inputs — answer naturally, no status.
  const isGreeting =
    /^(안녕|하이|반가워|헬로|hi|hello|hey|yo|오랜만)/i.test(q) ||
    q.split(/\s+/).length <= 2;
  if (isGreeting) {
    return { route: "local", reason: "" };
  }

  const hit = installedPacks.find((p) =>
    p.triggers.some((t) => q.includes(t))
  );
  if (hit) {
    const wordy = query.split(/\s+/).length > 14;
    if (!wordy) {
      return {
        route: "local",
        pack: hit,
        reason: "잠깐만, 먼저 확인해볼게.",
      };
    }
    return {
      route: "deep",
      pack: hit,
      reason: "전에 이야기한 게 있었는지 먼저 볼게.",
    };
  }
  return {
    route: "deep",
    reason: "이건 바로 답할 수도 있는데, 먼저 안에 있는 걸 확인해볼게.",
  };
}

// Look in local memory first, before any pack or model work.
export function recallFromMemory(query: string): SavedRecipe[] {
  const q = query.toLowerCase();
  return SAVED_RECIPES.filter((r) => r.matches.some((m) => q.includes(m)));
}

// Greetings stay short and human. DOTS doesn't lead — it just opens the door.
// No memory hooks, no pack mentions, no system explanations.
const KO_GREETINGS = [
  "안녕. 편하게 얘기해도 돼.",
  "안녕. 지금 뭐 보고 싶어?",
  "안녕. 필요하면 바로 같이 볼게.",
  "안녕.",
  "응, 왔어.",
];

function pickGreeting(): string {
  return KO_GREETINGS[Math.floor(Math.random() * KO_GREETINGS.length)];
}

// Mock answers — the same prompt produces a different shape depending on packs.
export function answerFor(query: string, pack?: Pack): string {
  const q = query.toLowerCase();

  if (/^(안녕|하이|반가워|헬로|오랜만|hi|hello|hey|yo)\b/i.test(q)) {
    return pickGreeting();
  }
  if (q.includes("kimchi") && pack?.id === "cooking-essentials") {
    return JSON.stringify({ kind: "recipe", id: "kimchi-stew" });
  }
  if (q.includes("kimchi") || q.includes("김치")) {
    return JSON.stringify({ kind: "generic-recipe", id: "kimchi-stew" });
  }
  if (q.includes("weather") || q.includes("today") || q.includes("날씨") || q.includes("오늘")) {
    return "맑은 아침이고 14도야. 10시 30분에 미라랑 약속 하나 있고, 점심 전까지는 그것 말곤 별다른 일정 없어.";
  }
  if (q.includes("explain") || q.includes("what is") || q.includes("설명")) {
    return "어느 정도 알고 있는지 알려주면, 거기서 한 칸 위부터 시작할게.";
  }
  return "조금만 더 말해줄래? 어떤 결로 풀어가고 싶은지 같이 잡아볼게.";
}

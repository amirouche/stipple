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
        reason: "One sec.",
      };
    }
    return {
      route: "deep",
      pack: hit,
      reason: "Looking at a couple of things you've mentioned before.",
    };
  }
  return {
    route: "deep",
    reason: "Give me a moment with this one.",
  };
}

// Look in local memory first, before any pack or model work.
export function recallFromMemory(query: string): SavedRecipe[] {
  const q = query.toLowerCase();
  return SAVED_RECIPES.filter((r) => r.matches.some((m) => q.includes(m)));
}

// Mock answers — the same prompt produces a different shape depending on packs.
export function answerFor(query: string, pack?: Pack): string {
  const q = query.toLowerCase();

  if (q.includes("kimchi") && pack?.id === "cooking-essentials") {
    return JSON.stringify({ kind: "recipe", id: "kimchi-stew" });
  }
  if (q.includes("kimchi")) {
    return JSON.stringify({ kind: "generic-recipe", id: "kimchi-stew" });
  }
  if (/^(안녕|하이|반가워|헬로)/i.test(q)) {
    return "안녕. 오늘은 뭐가 궁금해?";
  }
  if (/^(hi|hello|hey|yo)\b/i.test(q)) {
    return "Hey. What's on your mind?";
  }
  if (q.includes("weather") || q.includes("today")) {
    return "Clear morning, 14°C. Your 10:30 with Mira is the only fixed thing — nothing else needs you before lunch.";
  }
  if (q.includes("explain") || q.includes("what is")) {
    return "Tell me what's already familiar and I'll start a notch above that.";
  }
  return "Here's a starting point. Tell me which way to take it.";
}

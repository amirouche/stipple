// Minimal conversation skeleton for the MVP.
// Names the states + intents explicitly so the rest of the app can reason
// about them. Wraps the existing routing/answer logic in dots-data.ts.

import {
  PACKS,
  routeQuery,
  answerFor,
  recallFromMemory,
  COOKING_RECIPES,
  type Pack,
  type AnswerPayload,
} from "@/lib/dots-data";

export type ConversationState =
  | "idle"
  | "greeting"
  | "checking_local"
  | "found_local"
  | "checking_external";

export type UserIntent =
  | "greeting"
  | "memory_lookup"
  | "pack_lookup"
  | "follow_up"
  | "external_request";

const GREETING_RE = /^(안녕|하이|반가워|헬로|hi|hello|hey|yo|오랜만)/i;
const MEMORY_HINTS = ["전에", "아까", "저장", "기억", "지난번", "예전"];
const PACK_HINTS = ["레시피", "요리", "김치찌개", "찌개", "cook", "recipe"];
// Short follow-up signals — usually mean "stay on the same track".
const FOLLOWUP_HINTS = [
  "다른거",
  "다른 거",
  "또",
  "또?",
  "더",
  "딴거",
  "딴 거",
  "another",
  "more",
  "next",
];

export function classifyIntent(query: string): UserIntent {
  const q = query.toLowerCase().trim();
  if (GREETING_RE.test(q) || (q.length <= 2 && !FOLLOWUP_HINTS.some((t) => q.includes(t))))
    return "greeting";
  if (FOLLOWUP_HINTS.some((t) => q.includes(t))) return "follow_up";
  if (MEMORY_HINTS.some((t) => q.includes(t))) return "memory_lookup";
  if (PACK_HINTS.some((t) => q.includes(t))) return "pack_lookup";
  return "external_request";
}

export type EngineContext = {
  // Pack the current thread is sitting in. Used for follow-ups.
  contextPackId?: string;
  // Recipes the thread has already shown — engine will rotate.
  servedRecipeIds?: string[];
};

export type EngineStep = {
  intent: UserIntent;
  state: ConversationState;
  pack?: Pack;
  payload: AnswerPayload;
  reason: string;
};

// Tracks recently emitted assistant lines so the engine never repeats itself.
const recentLines: string[] = [];
const RECENT_MAX = 6;

function payloadLine(p: AnswerPayload): string {
  if (p.kind === "text") return p.text;
  if (p.kind === "memory-recipes") return p.intro;
  return p.intro ?? `recipe:${p.recipeId}`;
}

function rememberLine(line: string) {
  recentLines.push(line);
  if (recentLines.length > RECENT_MAX) recentLines.shift();
}

function nonRepeating(
  query: string,
  pack: Pack | undefined,
  route: "local" | "memory" | "deep"
): AnswerPayload {
  let payload = answerFor(query, pack, route);
  let tries = 0;
  while (recentLines.includes(payloadLine(payload)) && tries < 4) {
    payload = answerFor(query, pack, route);
    tries++;
  }
  rememberLine(payloadLine(payload));
  return payload;
}

// Pick the next cooking recipe that hasn't been served in this thread yet.
function nextCookingRecipe(servedIds: string[] = []): {
  recipeId: string;
  intro: string;
} | null {
  const remaining = COOKING_RECIPES.filter((r) => !servedIds.includes(r.id));
  if (remaining.length === 0) return null;
  const pick = remaining[0];
  const intros = [
    "그럼 다른 쪽으로 — 이건 어때.",
    "이것도 같은 결인데, 살짝 다른 버전.",
    "응, 한 가지 더 있어.",
  ];
  return {
    recipeId: pick.id,
    intro: intros[Math.floor(Math.random() * intros.length)],
  };
}

export function step(
  query: string,
  installed: Pack[] = PACKS.filter((p) => p.installed),
  ctx: EngineContext = {}
): EngineStep {
  const intent = classifyIntent(query);

  if (intent === "greeting") {
    const payload = nonRepeating(query, undefined, "local");
    return { intent, state: "greeting", payload, reason: "" };
  }

  // ---- Follow-up: stay in the current pack if there is one ----
  if (intent === "follow_up" && ctx.contextPackId) {
    const pack = installed.find((p) => p.id === ctx.contextPackId);
    if (pack?.id === "cooking-essentials") {
      const next = nextCookingRecipe(ctx.servedRecipeIds);
      if (next) {
        const payload: AnswerPayload = {
          kind: "recipe",
          recipeId: next.recipeId,
          intro: next.intro,
        };
        rememberLine(payloadLine(payload));
        return {
          intent,
          state: "found_local",
          pack,
          payload,
          reason: "",
        };
      }
      // Out of cooking recipes — soft handoff but stay in pack tone.
      return {
        intent,
        state: "checking_external",
        pack,
        payload: {
          kind: "text",
          text: "안에 있는 두 개는 다 보여줬어. 더 찾아볼까?",
        },
        reason: "안에 있는 건 다 봤어.",
      };
    }
    if (pack?.id === "study-companion") {
      const payload: AnswerPayload = {
        kind: "text",
        text: "그럼 다른 각도로 풀어볼게. 어디가 헷갈렸어?",
      };
      rememberLine(payloadLine(payload));
      return { intent, state: "found_local", pack, payload, reason: "" };
    }
    if (pack?.id === "morning-routine") {
      const payload: AnswerPayload = {
        kind: "text",
        text: "오후 일정도 같이 볼까?",
      };
      rememberLine(payloadLine(payload));
      return { intent, state: "found_local", pack, payload, reason: "" };
    }
  }

  const decision = routeQuery(query, installed);

  if (intent === "memory_lookup") {
    const matches = recallFromMemory(query);
    const sstate: ConversationState =
      matches.length > 0 ? "found_local" : "checking_external";
    const payload = nonRepeating(query, decision.pack, "memory");
    return {
      intent,
      state: sstate,
      pack: decision.pack,
      payload,
      reason: decision.reason,
    };
  }

  if (intent === "pack_lookup") {
    const sstate: ConversationState = decision.pack
      ? "found_local"
      : "checking_external";
    const route = decision.pack ? "local" : "deep";
    const payload = nonRepeating(query, decision.pack, route);
    return {
      intent,
      state: sstate,
      pack: decision.pack,
      payload,
      reason: decision.reason,
    };
  }

  // External / unknown — but if a thread is sitting in a pack and the query
  // is ambiguous, prefer the pack rather than jumping straight to deep.
  if (!decision.pack && ctx.contextPackId) {
    const ctxPack = installed.find((p) => p.id === ctx.contextPackId);
    if (ctxPack) {
      const payload = nonRepeating(query, ctxPack, "local");
      return {
        intent,
        state: "found_local",
        pack: ctxPack,
        payload,
        reason: "",
      };
    }
  }

  const sstate: ConversationState =
    decision.route === "deep" ? "checking_external" : "found_local";
  const payload = nonRepeating(query, decision.pack, decision.route);
  return {
    intent,
    state: sstate,
    pack: decision.pack,
    payload,
    reason: decision.reason,
  };
}

export function resetEngineMemory() {
  recentLines.length = 0;
}

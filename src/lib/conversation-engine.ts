// Minimal conversation skeleton for the MVP.
// Names the states + intents explicitly so the rest of the app can reason
// about them. Wraps the existing routing/answer logic in dots-data.ts.

import {
  PACKS,
  routeQuery,
  answerFor,
  recallFromMemory,
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
  // Stage-5 local-first lookup result attached when routeQuery is consulted
  // (i.e. not for greetings or pack-context follow-ups). Downstream answer
  // composition can use this to enrich responses with prior memory context.
  lookup?: import("@/lib/memory").LookupResult;
};

// Tracks recently emitted assistant lines so the engine never repeats itself.
const recentLines: string[] = [];
const RECENT_MAX = 6;

function payloadLine(p: AnswerPayload): string {
  if (p.kind === "text") return p.text;
  if (p.kind === "memory-recipes") return p.intro;
  if (p.kind === "recipe") return p.intro ?? `recipe:${p.recipeId}`;
  // pack-suggestion never flows through the engine's anti-repeat path;
  // guard for type completeness.
  return p.text;
}

function rememberLine(line: string) {
  recentLines.push(line);
  if (recentLines.length > RECENT_MAX) recentLines.shift();
}

function nonRepeating(
  query: string,
  pack: Pack | undefined,
  route: "local" | "memory" | "deep",
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

export function step(
  query: string,
  installed: Pack[] = PACKS.filter((p) => p.installed),
  ctx: EngineContext = {},
): EngineStep {
  const intent = classifyIntent(query);

  if (intent === "greeting") {
    const payload = nonRepeating(query, undefined, "local");
    return { intent, state: "greeting", payload, reason: "" };
  }

  // V2 (자연스러움 우선): the engine no longer fabricates pack-themed
  // payloads or claims a pack from ctx.contextPackId on its own.
  // Two old branches lived here:
  //   - follow_up + cooking → auto-rotate kimchi recipe
  //   - external/unknown + ctx.contextPackId → answerFor(query, ctxPack)
  // Both turned bare follow-ups like "더 자세히" into cooking content
  // even when the thread topic had moved on. Removed: the LLM (with
  // threadHistory) handles follow-ups naturally; inferDomainPack at the
  // call site adds voice/tone only when the new input itself signals a
  // domain. ctx.contextPackId is still tracked for future use but is no
  // longer load-bearing in the engine.

  const decision = routeQuery(query, installed);

  if (intent === "memory_lookup") {
    const matches = recallFromMemory(query);
    // Either saved-recipe match OR memory-layer hit means we found something local.
    const localHit = matches.length > 0 || (decision.lookup?.totalScore ?? 0) > 0;
    const sstate: ConversationState = localHit ? "found_local" : "checking_external";
    const payload = nonRepeating(query, decision.pack, "memory");
    return {
      intent,
      state: sstate,
      pack: decision.pack,
      payload,
      reason: decision.reason,
      lookup: decision.lookup,
    };
  }

  if (intent === "pack_lookup") {
    const sstate: ConversationState = decision.pack ? "found_local" : "checking_external";
    const route = decision.pack ? "local" : "deep";
    const payload = nonRepeating(query, decision.pack, route);
    return {
      intent,
      state: sstate,
      pack: decision.pack,
      payload,
      reason: decision.reason,
      lookup: decision.lookup,
    };
  }

  const sstate: ConversationState = decision.route === "deep" ? "checking_external" : "found_local";
  const payload = nonRepeating(query, decision.pack, decision.route);
  return {
    intent,
    state: sstate,
    pack: decision.pack,
    payload,
    reason: decision.reason,
    lookup: decision.lookup,
  };
}

export function resetEngineMemory() {
  recentLines.length = 0;
}

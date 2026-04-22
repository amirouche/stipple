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
  | "external_request";

const GREETING_RE = /^(안녕|하이|반가워|헬로|hi|hello|hey|yo|오랜만)/i;
const MEMORY_HINTS = ["전에", "아까", "저장", "기억", "지난번", "예전"];
const PACK_HINTS = ["레시피", "요리", "김치찌개", "찌개", "cook", "recipe"];

export function classifyIntent(query: string): UserIntent {
  const q = query.toLowerCase().trim();
  if (GREETING_RE.test(q) || q.split(/\s+/).length <= 1) return "greeting";
  if (MEMORY_HINTS.some((t) => q.includes(t))) return "memory_lookup";
  if (PACK_HINTS.some((t) => q.includes(t))) return "pack_lookup";
  return "external_request";
}

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

// If the chosen payload would repeat a recent line, ask answerFor for another
// variant by re-rolling. Caps at a few attempts so we always return something.
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

export function step(
  query: string,
  installed: Pack[] = PACKS.filter((p) => p.installed)
): EngineStep {
  const intent = classifyIntent(query);

  if (intent === "greeting") {
    const payload = nonRepeating(query, undefined, "local");
    return { intent, state: "greeting", payload, reason: "" };
  }

  const decision = routeQuery(query, installed);

  // Memory lookup intent — did we actually find anything?
  if (intent === "memory_lookup") {
    const matches = recallFromMemory(query);
    const state: ConversationState =
      matches.length > 0 ? "found_local" : "checking_external";
    const payload = nonRepeating(query, decision.pack, "memory");
    return { intent, state, pack: decision.pack, payload, reason: decision.reason };
  }

  // Pack lookup intent — did a pack actually match?
  if (intent === "pack_lookup") {
    const state: ConversationState = decision.pack
      ? "found_local"
      : "checking_external";
    const route = decision.pack ? "local" : "deep";
    const payload = nonRepeating(query, decision.pack, route);
    return { intent, state, pack: decision.pack, payload, reason: decision.reason };
  }

  // Anything else — pass through routeQuery; if it landed somewhere local,
  // surface that, otherwise mark as checking_external.
  const state: ConversationState =
    decision.route === "deep" ? "checking_external" : "found_local";
  const payload = nonRepeating(query, decision.pack, decision.route);
  return {
    intent,
    state,
    pack: decision.pack,
    payload,
    reason: decision.reason,
  };
}

export function resetEngineMemory() {
  recentLines.length = 0;
}

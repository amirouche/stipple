// Orchestrates AI-generated answers with local-memory context, falling back
// to the canned `answerFor()` payload on any failure (no key, network down,
// safety block, empty response).
//
// For text payloads, Gemini's output replaces the canned text. For
// recipe/memory-recipes payloads, the structured data (recipe ids) is
// preserved and Gemini's output becomes the surrounding `intro` text — the
// system prompt asks for a short intro that complements the recipe card.

import type { AnswerPayload, Pack } from "@/lib/dots-data";
import type { LookupResult } from "@/lib/memory";
// Direct path avoids a cycle: memory/index.ts ↔ dots-data via topics.ts.
import { extractTopics } from "@/lib/memory/topics";
import type { Intent } from "@/lib/packs/intent";
import { matchPitch } from "@/lib/pitch";
import { getPreferences } from "@/lib/preferences";
import { dispatchLLMCall, type DispatchTurn } from "./dispatch";
// V5.0 Phase P-2: 통일된 prompt 빌더가 dispatch 안에서 호출되며, compose는
// memory + payload kind 만 dispatch에 전달. compose의 BASE_PERSONA / pack /
// memory section 빌더 모두 system-prompt.ts 로 이전.

export type ComposeArgs = {
  query: string;
  pack?: Pack;
  lookup?: LookupResult;
  fallback: AnswerPayload;
  // Prior turns from the active thread, oldest → newest. dispatch trims
  // to the last N internally so callers can pass the whole conversation.
  history?: DispatchTurn[];
  // Per-token callback for streaming UIs. Fires once per delta with the
  // partial text so far. Gemini answers in one go (single onToken call
  // with the full text); WebLLM streams incrementally. Default no-op.
  onToken?: (delta: string, sofar: string) => void;
  // V3 라우터에서 분류된 의도. dispatch까지 그대로 전달 — casual일 땐
  // CASUAL_DISCIPLINE이 끼어 1 문장 인사로 응답 강제.
  intent?: Intent;
};

export type ComposeResult = {
  payload: AnswerPayload;
  // Which provider answered, if an LLM call ran. Absent on the fallback
  // path (network failure → canned reply has no LLM origin).
  provider?: "webllm" | "gemini";
};

// V5.0 Phase P-2: BASE_PERSONA / 팩·메모리 섹션 빌더 / payload-specific 디시플린
// 모두 src/lib/ai/system-prompt.ts 로 이전. composeAnswer는 더 이상 prompt
// string을 만들지 않고, memory + payloadKind 컨텍스트를 dispatchLLMCall에
// 직접 전달한다 (DispatchInput의 새 필드).

function attachPitch(payload: AnswerPayload, query: string): AnswerPayload {
  // Pitch matching is purely local — nothing about the query, topics, or
  // the chosen pitch leaves the device. The LLM never sees it either; we
  // attach it next to the answer the model already produced.
  const prefs = getPreferences();
  if (!prefs.pitch.enabled || prefs.pitch.categories.length === 0) return payload;
  // pack-suggestion is the on-device choice surface — no pitch overlay.
  if (payload.kind === "pack-suggestion") return payload;
  const pitch = matchPitch({
    query,
    topics: extractTopics(query),
    enabledCategories: prefs.pitch.categories,
  });
  return pitch ? { ...payload, pitch } : payload;
}

export async function composeAnswer(args: ComposeArgs): Promise<ComposeResult> {
  try {
    // V5.0 Phase P-2: memory + payloadKind를 직접 dispatch에 전달 — 통일된
    // buildSystemPrompt가 두 컨텍스트 모두 한 번에 처리. 이전엔 compose가 prompt
    // string을 만들어 dispatch가 다시 prepend하던 2-layer 구조였음.
    const { text, provider } = await dispatchLLMCall(
      {
        userMessage: args.query,
        history: args.history,
        pack: args.pack,
        intent: args.intent,
        memory: args.lookup,
        payloadKind: args.fallback.kind,
      },
      args.onToken,
    );

    // Wrap text into the same payload shape as the fallback so
    // structured fields (recipeId/recipeIds) survive.
    let payload: AnswerPayload;
    if (args.fallback.kind === "text") {
      payload = { kind: "text", text };
    } else if (args.fallback.kind === "recipe") {
      payload = { ...args.fallback, intro: text };
    } else if (args.fallback.kind === "memory-recipes") {
      payload = { ...args.fallback, intro: text };
    } else {
      payload = args.fallback;
    }
    return { payload: attachPitch(payload, args.query), provider };
  } catch (err) {
    console.error("[compose] LLM call failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    // 안정성 정정 (2026-04-30): Gemini 503/UNAVAILABLE 같은 외부 일시
    // 장애일 땐 "안에서는 바로 안 잡혀…" 같은 모호한 캔드 fallback 대신
    // 명확한 "지금 클라우드 혼잡" 메시지를 노출. 사용자에게 원인이 보이게.
    const isOverloaded = /\b503\b|overload|UNAVAILABLE|혼잡/i.test(message);
    if (isOverloaded) {
      return {
        payload: {
          kind: "text",
          text: "지금 클라우드 서버가 혼잡해. 잠시 후 다시 시도해줘.",
        },
      };
    }
    return { payload: attachPitch(args.fallback, args.query) };
  }
}

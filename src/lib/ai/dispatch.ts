// Single entry point for every LLM call DOTS makes after Stage 3 routing.
// Picks WebLLM or Gemini based on the user's preference and the current
// engine readiness, optionally streams tokens, and returns the final
// text + which provider answered.
//
// CONSTITUTION: 매칭 hit (Stage 1, 2)에서는 이 함수를 부르지 않는다 —
// LLM 호출 자체가 사용자가 명시적으로 선택한 결과여야 한다는 헌법.
// dispatch는 Stage 3 + onSuggestionAction llm-call에서만.
//
// Provider semantics:
//   webllm-first (default) — try WebLLM if loaded, fall back to Gemini.
//                            If WebLLM fails mid-generation we still fall
//                            through; the user gets an answer.
//   gemini-only            — never touch WebLLM. Lets users skip the
//                            1.8GB download entirely.
//   webllm-only            — no cloud. Throws if WebLLM isn't loaded so
//                            the caller can surface a "다운로드 필요" UI.

import type { Pack } from "@/lib/dots-data";
import { getPreferences, type LLMProvider } from "@/lib/preferences";
import { generateWithWebLLM, getWebLLMStatus, type WebLLMStatus } from "@/lib/webllm";
import { askGemini, type GeminiHistoryTurn } from "./gemini";

export type DispatchTurn = { role: "user" | "assistant"; content: string };

// Last N turns kept as multi-turn context. 6 = 3 user/assistant pairs —
// enough for "수학말고 다른거" style follow-ups, light enough to stay
// well under any model's context window even with long replies.
const HISTORY_LIMIT = 6;

export type DispatchInput = {
  userMessage: string;
  systemPrompt?: string;
  history?: DispatchTurn[];
  // When provided, voice/tone get prepended to the system prompt so the
  // model takes on the pack's persona. The prompt itself stays as-is for
  // call sites (SAT 출제 등) that already crafted a complete prompt.
  pack?: Pack;
};

export type DispatchResult = {
  text: string;
  provider: "webllm" | "gemini";
};

// Voice + tone become the first lines of the system prompt. We keep
// this separate from the pack's longer `systemPrompt` field so the next
// step (WebLLM-driven persona synthesis) has a clear seam to swap in.
function withVoiceTone(
  systemPrompt: string | undefined,
  pack: Pack | undefined,
): string | undefined {
  if (!pack || !pack.voice || !pack.tone) return systemPrompt;
  const persona = [`너는 "${pack.voice}"로서 사용자에게 답한다.`, `톤: ${pack.tone}`].join("\n");
  return systemPrompt ? `${persona}\n\n${systemPrompt}` : persona;
}

function trimHistory(history: DispatchTurn[] | undefined): DispatchTurn[] {
  if (!history || history.length === 0) return [];
  return history.slice(-HISTORY_LIMIT);
}

function isWebLLMReady(status: WebLLMStatus): boolean {
  return status.state === "ready" || status.state === "generating";
}

async function callGemini(
  input: DispatchInput,
  systemPrompt: string | undefined,
  history: DispatchTurn[],
): Promise<DispatchResult> {
  const { text } = await askGemini({
    data: {
      userMessage: input.userMessage,
      systemPrompt,
      history: history as GeminiHistoryTurn[],
    },
  });
  return { text, provider: "gemini" };
}

async function callWebLLM(
  input: DispatchInput,
  systemPrompt: string | undefined,
  history: DispatchTurn[],
  onToken: (delta: string, sofar: string) => void,
): Promise<DispatchResult> {
  // WebLLM speaks the OpenAI message shape — system is its own role
  // (Gemini puts it in systemInstruction, hence the divergence).
  const messages = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: input.userMessage },
  ];
  const text = await generateWithWebLLM(messages, onToken);
  return { text, provider: "webllm" };
}

export async function dispatchLLMCall(
  input: DispatchInput,
  onToken: (delta: string, sofar: string) => void = () => {},
): Promise<DispatchResult> {
  const provider: LLMProvider = getPreferences().llmProvider;
  const systemPrompt = withVoiceTone(input.systemPrompt, input.pack);
  const history = trimHistory(input.history);

  if (provider === "gemini-only") {
    return callGemini(input, systemPrompt, history);
  }

  const webllmReady = isWebLLMReady(getWebLLMStatus());

  if (provider === "webllm-only") {
    if (!webllmReady) {
      throw new Error("WebLLM 모델이 아직 로드되지 않았어. 설정에서 모델을 다운로드해.");
    }
    return callWebLLM(input, systemPrompt, history, onToken);
  }

  // webllm-first
  if (webllmReady) {
    try {
      return await callWebLLM(input, systemPrompt, history, onToken);
    } catch (err) {
      console.warn("[dispatch] WebLLM 호출 실패, Gemini로 fallback:", err);
    }
  }
  return callGemini(input, systemPrompt, history);
}

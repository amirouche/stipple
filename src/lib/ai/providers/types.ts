// Provider-neutral LLM interface. DOTS's routing / memory / pack layers never
// see a concrete provider — they call dispatch, dispatch calls `askLLM`, and
// `askLLM` picks one of these adapters by the LLM_PROVIDER env var. Swapping
// ChatGPT ↔ Gemini ↔ Claude ↔ Grok is a one-line config change, never a code
// change. This file is the whole contract every adapter implements.

export type ProviderId = "gemini" | "openai" | "claude" | "grok";

// Multi-turn context. DOTS speaks in "user" | "assistant"; each adapter maps to
// its own role convention internally (Gemini: assistant → model; Anthropic:
// system is a top-level field, not a role; OpenAI / Grok: system is a message
// role). Same shape as DispatchTurn in src/lib/ai/dispatch.ts.
export type LLMHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type LLMInput = {
  userMessage: string;
  systemPrompt?: string;
  history?: LLMHistoryTurn[];
};

export type LLMOutput = {
  text: string;
};

// A provider adapter is a plain server-side async function: neutral input in,
// text out. It reads its own API key from `process.env`, absorbs every
// wire-format difference internally, and throws on misconfiguration or a bad
// response. Adapters run only inside the `askLLM` server function, so neither
// the keys nor this code reach the client bundle.
export type LLMAdapter = (input: LLMInput) => Promise<LLMOutput>;

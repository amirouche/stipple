// Gemini adapter (Google Generative Language API). This is the original DOTS
// cloud caller, moved verbatim behind the LLMAdapter interface — behavior is
// byte-identical to the previous ai/gemini.ts so the default path never
// regresses. Key is read from GEMINI_API_KEY; model override via LLM_MODEL.
//
// Free tier (gemini-2.5-flash): 15 RPM, 1500 RPD. More than enough for v1.

import type { LLMInput, LLMOutput } from "./types";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

export async function geminiAdapter(input: LLMInput): Promise<LLMOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Stitch history (oldest → newest) before the current turn. Gemini wants
  // role "user" | "model" and refuses messages where two consecutive turns
  // share the same role, so adjacent same-role entries get folded into one —
  // defensive, since the chat store should already alternate.
  const historyContents = (input.history ?? [])
    .map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    }))
    .reduce<{ role: string; parts: { text: string }[] }[]>((acc, turn) => {
      const last = acc[acc.length - 1];
      if (last && last.role === turn.role) {
        last.parts.push(...turn.parts);
      } else {
        acc.push(turn);
      }
      return acc;
    }, []);

  const body = {
    contents: [
      ...historyContents,
      {
        role: "user",
        parts: [{ text: input.userMessage }],
      },
    ],
    ...(input.systemPrompt
      ? {
          systemInstruction: {
            parts: [{ text: input.systemPrompt }],
          },
        }
      : {}),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800,
    },
  };

  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as GeminiResponse;
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`);
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Gemini returned no text");
  }

  return { text: text.trim() };
}

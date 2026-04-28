// Server-only Gemini API caller. The handler runs in the TanStack Start
// server runtime (Node in dev, Cloudflare Workers in prod with nodejs_compat).
// The API key is read from `process.env.GEMINI_API_KEY` and never reaches
// the client bundle — `createServerFn` compiles the handler out of the
// client build entirely.
//
// Free tier (gemini-2.5-flash): 15 RPM, 1500 RPD. More than enough for v1.

import { createServerFn } from "@tanstack/react-start";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type GeminiInput = {
  userMessage: string;
  systemPrompt?: string;
};

export type GeminiOutput = {
  text: string;
};

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

export const askGemini = createServerFn({ method: "POST" })
  .inputValidator((data: GeminiInput) => data)
  .handler(async ({ data }): Promise<GeminiOutput> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: data.userMessage }],
        },
      ],
      ...(data.systemPrompt
        ? {
            systemInstruction: {
              parts: [{ text: data.systemPrompt }],
            },
          }
        : {}),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    };

    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
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
  });

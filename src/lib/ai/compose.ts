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
import { matchPitch } from "@/lib/pitch";
import { getPreferences } from "@/lib/preferences";
import { askGemini } from "./gemini";

export type ComposeArgs = {
  query: string;
  pack?: Pack;
  lookup?: LookupResult;
  fallback: AnswerPayload;
};

const BASE_PERSONA = [
  "당신은 DOTS — 사용자의 로컬 메모리를 기반으로 답하는 한국어 AI 어시스턴트입니다.",
  "원칙:",
  "- 짧고 자연스럽게, 격식 없이. 1~3 문장이면 충분합니다.",
  '- 사용자의 로컬 메모리 컨텍스트가 있으면 자연스럽게 반영하세요. 예: "전에 ~ 좋아한다고 하셨던 거 기억해서" 같이.',
  "- 처음 보는 주제면 평범하게 답하세요.",
].join("\n");

function buildSystemPrompt(args: ComposeArgs): string {
  const sections: string[] = [BASE_PERSONA];

  if (args.fallback.kind === "recipe" || args.fallback.kind === "memory-recipes") {
    sections.push(
      "[중요] 답변 직후 별도의 레시피 카드가 화면에 표시됩니다. 재료·단계·시간을 다시 적지 마세요. 1~2 문장의 짧은 인사·맥락만 작성하세요. 사용자가 전에 좋아한 재료나 흐름이 있으면 자연스럽게 언급하세요.",
    );
  }

  if (args.pack) {
    // The pack's systemPrompt defines mode-of-conversation: tone, answer
    // shape, recommendation flow. It overrides the generic DOTS persona for
    // the duration of this turn — that's what makes packs feel like switching
    // who you're talking to, not just adding context.
    sections.push(`[활성 팩: ${args.pack.name}]\n${args.pack.systemPrompt}`);
  }

  if (args.lookup && args.lookup.totalScore > 0) {
    const lines: string[] = ["[사용자의 로컬 메모리 컨텍스트]"];

    const memTopics = args.lookup.memoryMatches
      .slice(0, 5)
      .map(
        (m) =>
          `- ${m.record.topic} (${m.record.state}, ${m.record.accessCount}회 언급, score=${m.score.toFixed(2)})`,
      );
    if (memTopics.length > 0) {
      lines.push("최근 메모리:", ...memTopics);
    }

    const archTopics = args.lookup.archiveMatches.slice(0, 3).map((m) => {
      const topicList = m.matchedTopics.map((t) => `${t.topic}×${t.count}`).join(", ");
      return `- ${topicList} (${m.entry.granularity} 아카이브)`;
    });
    if (archTopics.length > 0) {
      lines.push("아카이브:", ...archTopics);
    }

    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

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

export async function composeAnswer(args: ComposeArgs): Promise<AnswerPayload> {
  const systemPrompt = buildSystemPrompt(args);

  try {
    const { text } = await askGemini({
      data: { userMessage: args.query, systemPrompt },
    });

    // Wrap Gemini text into the same payload shape as the fallback so
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
    return attachPitch(payload, args.query);
  } catch (err) {
    console.error("[compose] Gemini call failed, using fallback:", err);
    return attachPitch(args.fallback, args.query);
  }
}

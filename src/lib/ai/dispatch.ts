// Single entry point for every LLM call DOTS makes after Stage 3 routing.
// Picks WebLLM or Gemini based on the user's preference and the current
// engine readiness, optionally streams tokens, and returns the final
// text + which provider answered.
//
// CONSTITUTION: 매칭 hit (Stage 1, 2)에서는 이 함수를 부르지 않는다 —
// LLM 호출 자체가 사용자가 명시적으로 선택한 결과여야 한다는 헌법.
// dispatch는 Stage 3 + onSuggestionAction llm-call에서만.
//
// Provider semantics (사용자 시점 정정 후):
//   gemini-only (default) — 외부 API. 정확하고 자연스러운 응답. 일반
//                           사용자가 첫 설치 후 그대로 작동.
//   webllm-only           — 외부 호출 X. WebLLM 미로드 시 throw — 호출
//                           쪽이 "다운로드 필요" UI를 띄우게 한다.
// 폐기된 "webllm-first": WebLLM↔Gemini 자동 fallback이 응답 품질을
// 예측 불가능하게 만들고 ("양자역학" 2줄 환각 vs 풍부한 답이 무작위로
// 섞임), 사용자에게 부정확한 응답을 강제하던 어중간한 모드.

import type { Pack } from "@/lib/dots-data";
import type { Intent } from "@/lib/packs/intent";
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
  // V3 라우터에서 분류된 사용자 의도. casual일 때만 시스템 프롬프트에
  // 짧은 인사 디시플린을 더한다 — definition/search/recommend는
  // 기존 프롬프트로 충분.
  intent?: Intent;
};

export type DispatchResult = {
  text: string;
  provider: "webllm" | "gemini";
};

// Always-prepended quality discipline. WebLLM's small models (Qwen 3B,
// Llama 3.2 3B) drift into Japanese/English without explicit constraints
// and tend to ramble into food recommendations on unrelated inputs. The
// few-shot examples are small enough to not crowd the context but show
// the model the answer shape we want.
const BASE_DISCIPLINE = [
  "당신은 한국어 도우미입니다.",
  "",
  "원칙:",
  "- 한국어로만 답변. 일본어/중국어/영어 단어 섞지 마.",
  "- 사용자 입력에 정확히 답. 무관한 주제로 답하지 마.",
  "- 단어 한 개 입력 시 → 그 단어의 정의 + 핵심 1~2 문장.",
  "- 되물음 X. 사용자가 더 묻기 전엔 추가 질문 하지 마.",
  '- 모르면 솔직히 "잘 모르겠어" 라고 답해.',
  "- 짧고 정확. 추측 X.",
  "",
  "예시:",
  "사용자: 양자역학",
  "답: 양자역학은 원자 이하 미시 세계의 물리 법칙을 다루는 분야야. 입자가 파동처럼 행동하거나 동시에 여러 상태에 있을 수 있는 점이 핵심이야.",
  "",
  "사용자: 사과",
  "답: 사과는 장미과 사과나무 열매. 비타민 C와 식이섬유가 풍부하고 한국에서 많이 먹는 과일이야.",
].join("\n");

// Recommendation-intent words. When the user's message contains one of
// these AND we've inferred a pack, we add a small discipline section
// telling the model to make ONE concrete suggestion instead of dumping
// a catalog. "메뉴 추천" + cooking → "오늘 김치찌개 어때?" (one specific
// item) instead of "이런 옵션이 있어요: ..." (catalog).
const RECOMMENDATION_HINTS = [
  "추천",
  "뭐",
  "고민",
  "메뉴",
  "어떨까",
  "어때",
  "recommend",
  "suggest",
];

const RECOMMENDATION_DISCIPLINE = [
  "사용자가 추천을 요청했습니다. 다음을 지키세요:",
  "- 한 가지 구체적 제안만 (예: 음식 이름 하나).",
  "- 짧은 이유 한 줄 (시간/날씨/기분/상황 중 하나).",
  "- 카탈로그 / 옵션 나열 X. 친구처럼 자연스럽게.",
].join("\n");

// V3 casual 인텐트 전용. "안녕"·"고마워"에 대해서는 정의 설명/메모리 인용
// 없이 1 문장 인사로만 답하게 강제. BASE_DISCIPLINE의 "단어 한 개 입력 시
// → 그 단어의 정의" 룰을 덮어쓰는 역할.
const CASUAL_DISCIPLINE = [
  "사용자가 인사 또는 감사 표현을 했어. 다음을 지키세요:",
  "- 1 문장으로 짧고 친근하게 응답. 예: '안녕!', '천만에!', '잘 지내?'",
  "- 정의 설명 / 도움 제안 / 추가 질문 X. 인사로만 답해.",
].join("\n");

function hasRecommendationIntent(userMessage: string): boolean {
  const q = userMessage.toLowerCase();
  return RECOMMENDATION_HINTS.some((h) => q.includes(h));
}

// Voice + tone become the next lines after the base discipline. We keep
// this separate from the pack's longer `systemPrompt` field so the next
// step (WebLLM-driven persona synthesis) has a clear seam to swap in.
function buildSystemPrompt(
  userMessage: string,
  systemPrompt: string | undefined,
  pack: Pack | undefined,
  intent: Intent | undefined,
): string {
  const sections: string[] = [BASE_DISCIPLINE];
  if (pack?.voice && pack.tone) {
    sections.push([`너는 "${pack.voice}"로서 사용자에게 답한다.`, `톤: ${pack.tone}`].join("\n"));
  }
  // V3: casual이 가장 우선. 다른 디시플린(추천 등)과 충돌해도 인사 응답이
  // 우선이어야 자연스럽다 ("안녕"에 메뉴 추천 늘어놓으면 깬다).
  if (intent === "casual") {
    sections.push(CASUAL_DISCIPLINE);
  } else if (intent === "recommend" || hasRecommendationIntent(userMessage)) {
    // Recommendation discipline: V3 의도 분류가 "recommend"면 곧장 적용.
    // 분류기 없는 fallback 환경에서도 키워드 기반 hasRecommendationIntent가
    // 그대로 살아 있다.
    sections.push(RECOMMENDATION_DISCIPLINE);
  }
  if (systemPrompt) {
    sections.push(systemPrompt);
  }
  return sections.join("\n\n");
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
  const systemPrompt = buildSystemPrompt(
    input.userMessage,
    input.systemPrompt,
    input.pack,
    input.intent,
  );
  const history = trimHistory(input.history);

  if (provider === "webllm-only") {
    const webllmReady = isWebLLMReady(getWebLLMStatus());
    if (!webllmReady) {
      throw new Error("WebLLM 모델이 아직 로드되지 않았어. 설정에서 모델을 다운로드해.");
    }
    return callWebLLM(input, systemPrompt, history, onToken);
  }
  // gemini-only (기본): 모든 LLM 호출은 Gemini로. WebLLM은 옵션 모드에서만.
  return callGemini(input, systemPrompt, history);
}

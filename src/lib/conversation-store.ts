// Lightweight in-memory store for multi-thread conversations.
// Threads are themed (요리, 공부, 루틴, 자유) so each one keeps its own
// pack context — answering "다른거는?" inside a 요리 thread stays in the
// Cooking Essentials pack instead of routing externally.

import { useSyncExternalStore } from "react";
import type { ConversationState } from "@/lib/conversation-engine";
import type { PackRecipe, Route as RouteType, SuggestionOption } from "@/lib/dots-data";
import type { Pitch } from "@/lib/pitch/types";
import { captureFromMessage } from "@/lib/memory";

export type ThreadTheme = "cooking" | "study" | "routine" | "open";

// On-device pack-content match attached to an assistant message. Presence
// of this field is the signal to the UI that the response was produced
// without calling Gemini — it should render buttons instead of free text.
export type ThreadSuggestion = {
  matchedPackName: string;
  // Set when the suggestion came from an installed-pack match. Lets
  // onSuggestionAction(llm-call) lift the matched pack's voice/tone
  // onto the LLM call without needing a separate "active pack" mode —
  // matching IS the activation in this design.
  matchedPackId?: string;
  options: SuggestionOption[];
  // Mirrors AnswerPayload.pack-suggestion.badge — controls the footer
  // label under the buttons.
  badge?: "local" | "store" | "create";
};

export type ThreadMsg =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text?: string;
      recipes?: PackRecipe[];
      pitch?: Pitch;
      route: RouteType;
      state: ConversationState;
      reason: string;
      packName?: string;
      pending?: boolean;
      suggestion?: ThreadSuggestion;
      // Where the answer came from. Drives the small footer badge:
      //   webllm  → 초록 (내 기기, V2 헌법: 외부 호출 0)
      //   gemini  → 파란 (외부 클라우드)
      //   learned → 빨강 (학습 캐시 — V2 Phase 2)
      // Absent for canned/local replies that never went through dispatch.
      provider?: "webllm" | "gemini" | "learned";
      // Phase B: 이 메시지가 가리키는 LearnedResponse id. 사용자가 "좋아"·
      // "다른 거"를 누를 때 어떤 학습 엔트리를 평가할지 알아내는 핸들.
      // 채팅이 reload되어도 학습 store는 살아 있으므로 다음 같은 입력에
      // 평가가 매칭에 반영된다.
      learnedId?: string;
      // V5.0 Phase I-5: cloud-direct 모드 메시지 표시. 박혀 있으면:
      //   - system prompt 가 PACK_REFERENCE + CLOUD_DISCIPLINE 박힘 (pack
      //     identity 흉내 X)
      //   - ProviderBadge 라벨이 "Cloud (Pack 외부)" 형태로 강화
      // 미박힘 = pack identity 응답 (suggestion onClick 등) 또는 cloud 호출
      // 미발생.
      cloudMode?: boolean;
      // Phase EN-4: 메시지 응답 언어. 사용자 입력 detectLanguage 결과 박힘.
      // RecipeCard / SuggestionBlock 등 카드 렌더 시 라벨 분기. 미박힘 = 한국어
      // (Korean 회귀 default).
      lang?: "ko" | "en";
    };

// V5.0 lite Phase B2: 직전 pack 매칭의 confidence·entry·요청 명사구를 보존.
// 다음 turn에서 사용자가 거부 신호 (classifyRejection) 보내면 같은 entry
// 재노출 차단. exact 매칭은 보존 X — confident하니 부정 처리가 어색.
export type LastPackEntry = {
  packId: string;
  packName: string;
  entryName: string;
  confidence: "partial" | "fuzzy";
  requestedNoun?: string; // fuzzy 분기에서만. 사용자가 입력했지만 entry에 없는 명사.
  setAt: number;
};

// Multi-match phase: chooser 가 박힌 turn 의 카테고리 클러스터. 사용자가
// "다른 레시피" 류 follow-up 박으면 servedRecipeIds 에 없는 다른 cluster
// entry 로 rotate — Cloud 호출 회피. 모든 cluster entry 가 served 되면
// 다음 turn 에서 자연 fall-through.
export type MultiMatchCluster = {
  packId: string;
  packName: string;
  recipeIds: string[];
  term: string; // "김치찌개"
  setAt: number;
};

export type Thread = {
  id: string;
  title: string;
  theme: ThreadTheme;
  // last pack the thread was operating in — used for follow-ups like "다른거는?"
  lastPackId?: string;
  // V5.0 Phase B2: 직전 pack 매칭 컨텍스트 (rejection 검출용).
  lastPackEntry?: LastPackEntry;
  // Multi-match phase: 직전 카테고리 chooser 의 cluster (다음 turn "다른"
  // rotation 용). chooser 응답 직후 set, rotation 한 번 발생 + 모든 entry served
  // 되면 자동 clear.
  multiMatchCluster?: MultiMatchCluster;
  // recipes already shown in this thread, so follow-ups can rotate to a new one
  servedRecipeIds: string[];
  messages: ThreadMsg[];
  updatedAt: number;
};

// Phase 2: seed 채팅 (한국어 "점심 메뉴 골라줘" / "어텐션 다시 설명") 제거.
// 영어 데모는 새 대화로 깨끗하게 시작. routes/index.tsx useEffect 가 threads.
// length === 0 이면 createThread("open", t.shell.newThreadDefaultTitle) 호출
// 해 자동으로 빈 새 대화 1개 생성 → 화면 항상 1+ thread 유지.

let state: { threads: Thread[]; activeId: string } = {
  threads: [],
  activeId: "",
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function useConversationStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

export function getActiveThread(): Thread {
  return state.threads.find((t) => t.id === state.activeId) ?? state.threads[0];
}

export function selectThread(id: string) {
  state = { ...state, activeId: id };
  emit();
}

export function createThread(theme: ThreadTheme = "open", title?: string): Thread {
  const t: Thread = {
    id: `thread-${crypto.randomUUID().slice(0, 8)}`,
    title: title ?? "새 대화",
    theme,
    servedRecipeIds: [],
    messages: [],
    updatedAt: Date.now(),
    lastPackId: themePackId(theme),
  };
  state = { threads: [t, ...state.threads], activeId: t.id };
  emit();
  return t;
}

export function themePackId(theme: ThreadTheme): string | undefined {
  switch (theme) {
    case "cooking":
      return "cooking-essentials";
    case "study":
      return "study-companion";
    case "routine":
      return "morning-routine";
    default:
      return undefined;
  }
}

export function updateThread(id: string, patch: (t: Thread) => Partial<Thread>) {
  state = {
    ...state,
    threads: state.threads.map((t) =>
      t.id === id ? { ...t, ...patch(t), updatedAt: Date.now() } : t,
    ),
  };
  emit();
}

export function appendMessage(threadId: string, msg: ThreadMsg) {
  updateThread(threadId, (t) => ({ messages: [...t.messages, msg] }));
  // Capture only user messages — assistant replies don't carry user intent.
  if (msg.role === "user") {
    captureFromMessage(msg.text, { sourceThreadId: threadId });
  }
}

export function patchMessage(
  threadId: string,
  msgId: string,
  patch: Partial<Extract<ThreadMsg, { role: "assistant" }>>,
) {
  updateThread(threadId, (t) => ({
    messages: t.messages.map((m) =>
      m.id === msgId && m.role === "assistant" ? { ...m, ...patch } : m,
    ),
  }));
}

export function setThreadPack(threadId: string, packId?: string) {
  updateThread(threadId, () => ({ lastPackId: packId }));
}

// V5.0 Phase B2: 직전 pack 매칭 컨텍스트 setter. partial/fuzzy hit 직후 set,
// exact hit 또는 매칭 실패 / 다른 stage 진입 시 undefined로 clear.
export function setThreadLastEntry(threadId: string, entry: LastPackEntry | undefined) {
  updateThread(threadId, () => ({ lastPackEntry: entry }));
}

// Multi-match cluster setter. chooser 응답 직후 set, 모든 entry 가 served 되거나
// 사용자가 다른 발화로 넘어가면 undefined.
export function setThreadCluster(threadId: string, cluster: MultiMatchCluster | undefined) {
  updateThread(threadId, () => ({ multiMatchCluster: cluster }));
}

export function markRecipeServed(threadId: string, recipeId: string) {
  updateThread(threadId, (t) => ({
    servedRecipeIds: Array.from(new Set([...t.servedRecipeIds, recipeId])),
  }));
}

export function renameThreadIfDefault(threadId: string, fromText: string) {
  const t = state.threads.find((x) => x.id === threadId);
  if (!t || t.title !== "새 대화") return;
  const next = fromText.trim().slice(0, 24);
  if (!next) return;
  updateThread(threadId, () => ({ title: next }));
}

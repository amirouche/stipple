// Lightweight in-memory store for multi-thread conversations.
// Threads are themed (요리, 공부, 루틴, 자유) so each one keeps its own
// pack context — answering "다른거는?" inside a 요리 thread stays in the
// Cooking Essentials pack instead of routing externally.

import { useSyncExternalStore } from "react";
import type { ConversationState } from "@/lib/conversation-engine";
import type { PackRecipe, Route as RouteType } from "@/lib/dots-data";
import { captureFromMessage } from "@/lib/memory";

export type ThreadTheme = "cooking" | "study" | "routine" | "open";

export type ThreadMsg =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text?: string;
      recipes?: PackRecipe[];
      route: RouteType;
      state: ConversationState;
      reason: string;
      packName?: string;
      pending?: boolean;
    };

export type Thread = {
  id: string;
  title: string;
  theme: ThreadTheme;
  pinned?: boolean;
  // last pack the thread was operating in — used for follow-ups like "다른거는?"
  lastPackId?: string;
  // recipes already shown in this thread, so follow-ups can rotate to a new one
  servedRecipeIds: string[];
  messages: ThreadMsg[];
  updatedAt: number;
};

// ------- Seeded threads so the sidebar feels lived-in from the first load -------

const now = Date.now();

const seedThreads: Thread[] = [
  {
    id: "thread-cooking",
    title: "요리",
    theme: "cooking",
    pinned: true,
    lastPackId: "cooking-essentials",
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 30,
  },
  {
    id: "thread-study",
    title: "공부",
    theme: "study",
    pinned: true,
    lastPackId: "study-companion",
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 60 * 5,
  },
  {
    id: "thread-routine",
    title: "루틴",
    theme: "routine",
    pinned: true,
    lastPackId: "morning-routine",
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 60 * 24,
  },
  {
    id: "thread-open",
    title: "자유 대화",
    theme: "open",
    pinned: true,
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 60 * 24 * 2,
  },
  // A couple of recent ad-hoc threads
  {
    id: "thread-recent-1",
    title: "점심 메뉴 골라줘",
    theme: "cooking",
    lastPackId: "cooking-essentials",
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 60 * 3,
  },
  {
    id: "thread-recent-2",
    title: "어텐션 다시 설명",
    theme: "study",
    lastPackId: "study-companion",
    servedRecipeIds: [],
    messages: [],
    updatedAt: now - 1000 * 60 * 60 * 12,
  },
];

let state: { threads: Thread[]; activeId: string } = {
  threads: seedThreads,
  activeId: seedThreads[0].id,
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

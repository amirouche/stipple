import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { ProcessingTrace } from "@/components/ProcessingTrace";
import { RecipeCard } from "@/components/RecipeCard";
import {
  PACKS,
  getCookingRecipe,
  type Pack,
  type PackRecipe,
  type Route as RouteType,
} from "@/lib/dots-data";
import { step } from "@/lib/conversation-engine";
import {
  appendMessage,
  createThread,
  markRecipeServed,
  patchMessage,
  renameThreadIfDefault,
  selectThread,
  setThreadPack,
  useConversationStore,
  type ThreadMsg,
} from "@/lib/conversation-store";
import { usePreferences } from "@/lib/preferences";
import { buildContinuations, type ContinueCard } from "@/lib/continuations";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "대화 — DOTS" },
      {
        name: "description",
        content:
          "DOTS는 사용자에게 맞춰지는 한 겹의 레이어입니다. 팩, 기억, 그리고 깊은 추론 사이를 조용히 오갑니다.",
      },
    ],
  }),
  component: ChatPage,
});

// Theme labels are no longer surfaced on the chat home — kept internal.

// "Continue from here" cards are produced by buildContinuations() —
// scored across recent threads, repeated topics, and recently used packs.

function ChatPage() {
  const [installed] = useState<Pack[]>(PACKS.filter((p) => p.installed));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { threads, activeId } = useConversationStore();
  const prefs = usePreferences();

  // Always have at least one thread; fall back to seeded one.
  useEffect(() => {
    if (threads.length === 0) createThread("open", "새 대화");
  }, [threads.length]);

  const thread = threads.find((t) => t.id === activeId) ?? threads[0];
  const messages = thread?.messages ?? [];

  function send(text: string) {
    if (!text.trim() || busy || !thread) return;
    const userId = crypto.randomUUID();
    const asstId = crypto.randomUUID();

    const result = step(text, installed, {
      contextPackId: thread.lastPackId,
      servedRecipeIds: thread.servedRecipeIds,
    });
    const route: RouteType =
      result.state === "checking_external"
        ? "deep"
        : result.intent === "memory_lookup"
          ? "memory"
          : "local";

    // Move thread updates eagerly.
    appendMessage(thread.id, { id: userId, role: "user", text });
    renameThreadIfDefault(thread.id, text);
    appendMessage(thread.id, {
      id: asstId,
      role: "assistant",
      route,
      state: result.state,
      reason: result.reason,
      packName: result.pack?.name,
      pending: true,
    });

    if (result.pack) setThreadPack(thread.id, result.pack.id);

    setInput("");
    setBusy(true);

    const delay =
      result.state === "greeting"
        ? 500
        : result.state === "found_local"
          ? 700
          : result.state === "checking_external"
            ? 2400
            : 1100;

    setTimeout(() => {
      const payload = result.payload;
      let body = "";
      let recipes: PackRecipe[] | undefined;
      if (payload.kind === "text") {
        body = payload.text;
      } else if (payload.kind === "recipe") {
        const r = getCookingRecipe(payload.recipeId);
        recipes = r ? [r] : undefined;
        body = payload.intro ?? "";
        if (r) markRecipeServed(thread.id, r.id);
      } else if (payload.kind === "memory-recipes") {
        recipes = payload.recipeIds
          .map((id) => getCookingRecipe(id))
          .filter((r): r is PackRecipe => Boolean(r));
        body = payload.intro;
      }
      patchMessage(thread.id, asstId, {
        pending: false,
        text: body,
        recipes,
      });
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }, delay);
  }

  if (!thread) return null;

  // Score-based "Continue from here" — capped at 2.
  // Honors home priority by giving a small boost to the matching source.
  const baseContinues = buildContinuations(threads, installed);
  const orderedContinues =
    prefs.homePriority === "memory-first"
      ? [...baseContinues].sort((a, b) =>
          a.source === "topic" ? -1 : b.source === "topic" ? 1 : 0
        )
      : prefs.homePriority === "packs-first"
        ? [...baseContinues].sort((a, b) =>
            a.source === "pack" ? -1 : b.source === "pack" ? 1 : 0
          )
        : baseContinues;

  // Quick-entry pack row (top 3) — shown on mobile as shortcuts.
  const quickPacks = installed.slice(0, 3);
  const hasMessages = messages.length > 0;

  return (
    <Shell>
      <ChatBody
        threadId={thread.id}
        activePackId={thread.lastPackId}
        quickPacks={quickPacks}
        hasMessages={hasMessages}
        orderedContinues={orderedContinues}
        messages={messages}
        scrollRef={scrollRef}
        input={input}
        setInput={setInput}
        busy={busy}
        send={send}
        onPackJump={(packId) => {
          const themed = threads.find(
            (t) => t.pinned && t.lastPackId === packId
          );
          if (themed) selectThread(themed.id);
        }}
      />
    </Shell>
  );
}

function ChatBody({
  threadId,
  activePackId,
  quickPacks,
  hasMessages,
  orderedContinues,
  messages,
  scrollRef,
  input,
  setInput,
  busy,
  send,
  onPackJump,
}: {
  threadId: string;
  activePackId?: string;
  quickPacks: Pack[];
  hasMessages: boolean;
  orderedContinues: ContinueCard[];
  messages: ThreadMsg[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  send: (text: string) => void;
  onPackJump: (packId: string) => void;
}) {
  const shell = useShell();

  return (
    <div className="flex flex-col h-screen">
      {/* Header — mobile menu button + quick pack row, no titles or status */}
      <header className="border-b border-border">
        <div className="flex items-center gap-2 px-3 sm:px-8 md:px-12 py-3">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => shell?.openMobile()}
            className="md:hidden shrink-0 h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="메뉴 열기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          {/* Quick pack row — same on desktop & mobile, just shortcuts */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickPacks.map((p) => (
              <button
                key={p.id}
                onClick={() => setThreadPack(threadId, p.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full hairline text-[12px] transition-colors ${
                  activePackId === p.id
                    ? "bg-accent text-ink"
                    : "bg-surface-2 text-ink-soft hover:text-ink"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-6 sm:py-10 space-y-8">
          {!hasMessages && (
            <WelcomeState
              continues={orderedContinues}
              onPick={send}
              onPackJump={onPackJump}
            />
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end fade-in">
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px] leading-relaxed">
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantBubble key={m.id} m={m} />
            )
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-3 rounded-xl border border-border bg-card px-4 py-3 focus-within:border-strong transition-colors"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="DOTS에게 말 걸기"
              className="flex-1 resize-none bg-transparent outline-none text-[14.5px] leading-relaxed text-ink placeholder:text-ink-soft/70 max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="shrink-0 h-8 px-3 rounded-md bg-ink text-background text-[12.5px] font-medium disabled:opacity-30 transition-opacity"
            >
              보내기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


function AssistantBubble({
  m,
}: {
  m: Extract<ThreadMsg, { role: "assistant" }>;
}) {
  return (
    <div className="space-y-3 fade-in">
      {(m.pending || m.route === "deep") && (
        <ProcessingTrace
          route={m.route}
          reason={m.reason}
          packName={m.packName}
        />
      )}
      {!m.pending && (
        <div className="space-y-3">
          {m.text && (
            <div className="text-[14.5px] leading-[1.65] text-ink max-w-2xl">
              {m.text}
            </div>
          )}
          {m.recipes?.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function WelcomeState({
  continues,
  onPick,
}: {
  continues: ContinueCard[];
  onPick: (s: string) => void;
  onPackJump: (packId: string) => void;
}) {
  // Cap at 2 — the home is intentionally minimal before chat begins.
  const items = continues.slice(0, 2);
  if (items.length === 0) return null;

  return (
    <div className="fade-in pt-4 sm:pt-10">
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.prompt)}
            className="text-left px-4 py-3 sm:p-4 rounded-xl border border-border bg-card hover:border-strong hover:bg-surface transition-colors"
          >
            <p className="text-[13.5px] text-ink leading-snug">{c.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}


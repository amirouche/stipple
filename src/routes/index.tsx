import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { ProcessingTrace } from "@/components/ProcessingTrace";
import { RecipeCard } from "@/components/RecipeCard";
import {
  PACKS,
  getCookingRecipe,
  type Pack,
  type PackRecipe,
  type Route as RouteType,
} from "@/lib/dots-data";
import { step, type ConversationState } from "@/lib/conversation-engine";
import {
  appendMessage,
  createThread,
  getActiveThread,
  markRecipeServed,
  patchMessage,
  renameThreadIfDefault,
  selectThread,
  setThreadPack,
  useConversationStore,
  type ThreadMsg,
  type ThreadTheme,
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

const THEME_LABEL: Record<ThreadTheme, string> = {
  cooking: "요리",
  study: "공부",
  routine: "루틴",
  open: "자유 대화",
};

// "Continue from here" cards are now produced by buildContinuations() —
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
      <div className="flex flex-col h-screen">
        {/* Header — desktop only keeps the thread title; mobile gets quick pack row */}
        <header className="border-b border-border">
          {/* Desktop header */}
          <div className="hidden sm:flex px-8 md:px-12 pt-7 pb-4 items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[15px] font-semibold tracking-tight text-ink">
                {thread.title}
              </h1>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/60">
                {THEME_LABEL[thread.theme]}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {installed.map((p) => (
                <span
                  key={p.id}
                  className={`px-2.5 py-1 rounded-full hairline text-[11.5px] transition-colors ${
                    thread.lastPackId === p.id
                      ? "bg-accent text-ink"
                      : "bg-surface-2 text-ink-soft"
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          {/* Mobile quick-entry pack row */}
          <div className="sm:hidden px-4 pt-3 pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {quickPacks.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setThreadPack(thread.id, p.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full hairline text-[12px] transition-colors ${
                    thread.lastPackId === p.id
                      ? "bg-accent text-ink"
                      : "bg-surface-2 text-ink-soft"
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
                theme={thread.theme}
                continues={orderedContinues}
                installed={installed}
                onPick={send}
                onPackJump={(packId) => {
                  // Open or focus a themed thread for this pack.
                  const themed = threads.find(
                    (t) => t.pinned && t.lastPackId === packId
                  );
                  if (themed) selectThread(themed.id);
                }}
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
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-4">
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
            <div className="mt-2 px-1 flex items-center justify-between">
              <p className="text-[10.5px] text-ink-soft/70">
                ⏎ 보내기 · ⇧⏎ 줄바꿈
              </p>
              {thread.lastPackId && (
                <p className="text-[10.5px] text-ink-soft/70">
                  맥락 유지 · {installed.find((p) => p.id === thread.lastPackId)?.name ?? "—"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
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
  theme,
  continues,
  installed,
  onPick,
  onPackJump,
}: {
  theme: ThreadTheme;
  continues: ContinueCard[];
  installed: Pack[];
  onPick: (s: string) => void;
  onPackJump: (packId: string) => void;
}) {
  const mobileContinues = continues.slice(0, 2);

  return (
    <div className="fade-in space-y-12">
      {/* Intro + active packs — desktop only. Mobile keeps chat-first. */}
      <div className="hidden sm:block pt-6 space-y-12">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/60">
            {THEME_LABEL[theme]}
          </p>
          <p className="mt-3 text-[20px] leading-snug text-ink max-w-md tracking-tight">
            여기 있어. 천천히 시작해도 돼.
          </p>
        </div>

        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/60 mb-3">
            지금 켜져 있는 팩
          </p>
          <div className="flex flex-wrap gap-2">
            {installed.map((p) => (
              <button
                key={p.id}
                onClick={() => onPackJump(p.id)}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card hover:border-strong transition-colors text-[12px] text-ink"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {p.name}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Continue from here — compact on mobile, labeled on desktop. */}
      {continues.length > 0 && (
        <section className="pt-2 sm:pt-0">
          <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/60 mb-3">
            이어서
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {/* Mobile: max 2 */}
            <div className="contents sm:hidden">
              {mobileContinues.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onPick(c.prompt)}
                  className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:border-strong hover:bg-surface transition-colors"
                >
                  <p className="text-[13.5px] text-ink leading-snug">{c.label}</p>
                </button>
              ))}
            </div>
            {/* Desktop: full set with subtitle */}
            <div className="hidden sm:contents">
              {continues.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onPick(c.prompt)}
                  className="text-left p-4 rounded-xl border border-border bg-card hover:border-strong hover:bg-surface transition-colors group"
                >
                  <p className="text-[13.5px] text-ink leading-snug">{c.label}</p>
                  <p className="mt-1.5 text-[11.5px] text-ink-soft leading-relaxed">
                    {c.sub}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

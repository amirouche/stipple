import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat — DOTS" },
      {
        name: "description",
        content: "A calm chat surface where DOTS routes between local packs and deeper inference.",
      },
    ],
  }),
  component: ChatPage,
});

type Msg =
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

// Soft, low-pressure openers — kept around for when the user wants a nudge,
// but the empty state no longer pushes them to the front.
const STARTERS = [
  "김치찌개 어떻게 끓여?",
  "오늘 일정 뭐 있어?",
  "트랜스포머 어텐션 짧게 설명해줘.",
];

function ChatPage() {
  const [installed] = useState<Pack[]>(PACKS.filter((p) => p.installed));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    if (!text.trim() || busy) return;
    const userId = crypto.randomUUID();
    const asstId = crypto.randomUUID();
    const result = step(text, installed);
    const route: RouteType =
      result.state === "checking_external"
        ? "deep"
        : result.intent === "memory_lookup"
          ? "memory"
          : "local";

    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      {
        id: asstId,
        role: "assistant",
        route,
        state: result.state,
        reason: result.reason,
        packName: result.pack?.name,
        pending: true,
      },
    ]);
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
      } else if (payload.kind === "memory-recipes") {
        recipes = payload.recipeIds
          .map((id) => getCookingRecipe(id))
          .filter((r): r is PackRecipe => Boolean(r));
        body = payload.intro;
      }
      setMessages((m) =>
        m.map((msg) =>
          msg.id === asstId
            ? { ...msg, pending: false, text: body, recipes }
            : msg
        )
      );
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }, delay);
  }

  return (
    <Shell>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <header className="px-8 md:px-12 pt-7 pb-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-ink">
              대화
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {installed.map((p) => (
              <span
                key={p.id}
                className="px-2.5 py-1 rounded-full bg-surface-2 hairline text-[11.5px] text-ink-soft"
              >
                {p.name}
              </span>
            ))}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
            {messages.length === 0 && (
              <div className="fade-in pt-6">
                <p className="text-[15px] text-ink-soft leading-relaxed max-w-md">
                  여기 있어. 천천히 시작해도 돼.
                </p>
                <div className="mt-10">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft/60 mb-3">
                    필요하면
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="px-3 py-1.5 rounded-full border border-border bg-transparent hover:bg-surface hover:border-strong transition-colors text-[12px] text-ink-soft hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end fade-in">
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px] leading-relaxed">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="space-y-3 fade-in">
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
            <div className="mt-2 px-1">
              <p className="text-[10.5px] text-ink-soft/70">
                ⏎ 보내기 · ⇧⏎ 줄바꿈
              </p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

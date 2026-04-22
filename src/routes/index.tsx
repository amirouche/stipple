import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { ProcessingTrace } from "@/components/ProcessingTrace";
import { RecipeCard, KIMCHI_STEW } from "@/components/RecipeCard";
import { PACKS, routeQuery, answerFor, type Pack, type Route as RouteType } from "@/lib/dots-data";

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
      recipe?: typeof KIMCHI_STEW;
      route: RouteType;
      reason: string;
      packName?: string;
      pending?: boolean;
    };

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
    const decision = routeQuery(text, installed);

    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      {
        id: asstId,
        role: "assistant",
        route: decision.route,
        reason: decision.reason,
        packName: decision.pack?.name,
        pending: true,
      },
    ]);
    setInput("");
    setBusy(true);

    const delay = decision.route === "local" ? 700 : 2400;
    setTimeout(() => {
      const raw = answerFor(text, decision.pack);
      let recipe: typeof KIMCHI_STEW | undefined;
      let body = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.kind === "recipe" && parsed.id === "kimchi-stew") {
          recipe = KIMCHI_STEW;
          body = "";
        } else if (parsed.kind === "generic-recipe") {
          body =
            "김치찌개는 보통 묵은지에 돼지고기나 참치, 두부, 양파, 육수를 넣어. 고기를 먼저 살짝 볶다가 김치를 넣고, 육수를 부어서 한 20분 끓인 다음 마지막에 두부를 올려. 간은 입맛에 맞춰서.";
        }
      } catch {
        // not json, keep as-is
      }
      setMessages((m) =>
        m.map((msg) =>
          msg.id === asstId
            ? { ...msg, pending: false, text: body, recipe }
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
              <div className="fade-in">
                <h2 className="text-[28px] md:text-[32px] font-semibold tracking-tight leading-[1.15] text-ink max-w-xl">
                  뭐부터 볼까?
                </h2>
                <p className="mt-3 text-[14px] text-ink-soft max-w-lg">
                  짧게 끝낼 수 있는 건 짧게 답할게.
                </p>
                <div className="mt-8 grid sm:grid-cols-3 gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left px-4 py-3 rounded-lg border border-border bg-card hover:border-strong hover:bg-surface transition-colors text-[13px] text-ink"
                    >
                      {s}
                    </button>
                  ))}
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
                      {m.recipe && <RecipeCard recipe={m.recipe} />}
                      {m.text && (
                        <div className="text-[14.5px] leading-[1.65] text-ink max-w-2xl">
                          {m.text}
                        </div>
                      )}
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
                placeholder="Message DOTS"
                className="flex-1 resize-none bg-transparent outline-none text-[14.5px] leading-relaxed text-ink placeholder:text-ink-soft/70 max-h-40"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy}
                className="shrink-0 h-8 px-3 rounded-md bg-ink text-background text-[12.5px] font-medium disabled:opacity-30 transition-opacity"
              >
                Send
              </button>
            </form>
            <div className="mt-2 px-1">
              <p className="text-[10.5px] text-ink-soft/70">
                ⏎ to send · ⇧⏎ for newline
              </p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

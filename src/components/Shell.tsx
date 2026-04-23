import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ReactNode } from "react";
import {
  createThread,
  selectThread,
  useConversationStore,
  type ThreadTheme,
} from "@/lib/conversation-store";

const NAV = [
  { to: "/packs", label: "팩", glyph: "02" },
  { to: "/memory", label: "기억", glyph: "03" },
  { to: "/settings", label: "설정", glyph: "04" },
] as const;

const THEMES: { id: ThreadTheme; label: string; hint: string }[] = [
  { id: "cooking", label: "요리", hint: "주방 흐름에 맞춰" },
  { id: "study", label: "공부", hint: "이해 단계로 풀어서" },
  { id: "routine", label: "루틴", hint: "오늘의 리듬" },
  { id: "open", label: "자유 대화", hint: "그냥 편하게" },
];

const THEME_GLYPH: Record<ThreadTheme, string> = {
  cooking: "◎",
  study: "◇",
  routine: "○",
  open: "·",
};

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export function Shell({ children }: { children?: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { threads, activeId } = useConversationStore();

  const themed = THEMES.map((t) => ({
    theme: t,
    thread: threads.find((th) => th.pinned && th.theme === t.id),
  }));
  const recent = threads
    .filter((t) => !t.pinned)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const onChat = loc.pathname === "/";

  function openThread(id: string) {
    selectThread(id);
    if (!onChat) nav({ to: "/" });
  }

  function newThread() {
    const t = createThread("open", "새 대화");
    selectThread(t.id);
    if (!onChat) nav({ to: "/" });
  }

  return (
    <div className="min-h-screen w-full flex bg-background text-ink">
      <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-5 pt-6 pb-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-[20px] font-semibold tracking-tight">DOTS</span>
            <span className="font-mono text-[10px] text-ink-soft uppercase tracking-[0.18em]">
              v0.1
            </span>
          </Link>
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={newThread}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-card hover:border-strong transition-colors text-[13px] text-ink"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-ink-soft">＋</span>
              새 대화
            </span>
            <span className="font-mono text-[10px] text-ink-soft uppercase tracking-[0.14em]">
              new
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-5">
          {/* Themed conversation threads */}
          <section>
            <div className="px-3 pt-2 pb-2 flex items-baseline justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
                맥락
              </p>
              <p className="text-[10.5px] text-ink-soft/60">고정됨</p>
            </div>
            <ul className="space-y-0.5">
              {themed.map(({ theme, thread }) => {
                const active =
                  onChat && thread && thread.id === activeId;
                return (
                  <li key={theme.id}>
                    <button
                      onClick={() => {
                        if (thread) openThread(thread.id);
                        else {
                          const t = createThread(theme.id, theme.label);
                          openThread(t.id);
                        }
                      }}
                      className={`group w-full flex items-start gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        active
                          ? "bg-accent text-ink"
                          : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`font-mono text-[12px] mt-[1px] ${
                          active ? "text-primary" : "text-ink-soft/60"
                        }`}
                      >
                        {THEME_GLYPH[theme.id]}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] truncate">
                          {theme.label}
                        </span>
                        <span className="block text-[11px] text-ink-soft/70 truncate">
                          {theme.hint}
                        </span>
                      </span>
                      {active && (
                        <span className="h-1 w-1 mt-2 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Recent ad-hoc conversations */}
          {recent.length > 0 && (
            <section>
              <div className="px-3 pb-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
                  최근
                </p>
              </div>
              <ul className="space-y-0.5">
                {recent.map((t) => {
                  const active = onChat && t.id === activeId;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => openThread(t.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 rounded-md text-left transition-colors ${
                          active
                            ? "bg-accent text-ink"
                            : "text-ink-soft hover:text-ink hover:bg-surface-2"
                        }`}
                      >
                        <span className="text-[12.5px] truncate flex-1 min-w-0">
                          {t.title}
                        </span>
                        <span className="font-mono text-[10px] text-ink-soft/60 shrink-0">
                          {relTime(t.updatedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Secondary nav */}
          <section>
            <div className="px-3 pb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
                층
              </p>
            </div>
            <ul className="space-y-0.5">
              {NAV.map((item) => {
                const active = loc.pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                        active
                          ? "bg-accent text-ink"
                          : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`font-mono text-[10px] ${
                            active ? "text-primary" : "text-ink-soft/60"
                          }`}
                        >
                          {item.glyph}
                        </span>
                        {item.label}
                      </span>
                      {active && (
                        <span className="h-1 w-1 rounded-full bg-primary" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="px-5 py-4 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>이 기기 안에서</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}

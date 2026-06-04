import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ReactNode, createContext, useContext, useState } from "react";
import { createThread, selectThread, useConversationStore } from "@/lib/conversation-store";
import { setLanguage, usePreferences } from "@/lib/preferences";
import { useT, type Messages } from "@/lib/i18n";

// NAV 정의 — label 은 t 사전 키 참조. labelKey 가 Messages["shell"]["nav"] 의
// key union 이라 typo 시 tsc 잡힘.
const NAV_ITEMS = [
  { to: "/packs", labelKey: "packs", glyph: "02" },
  { to: "/store", labelKey: "store", glyph: "03" },
  { to: "/memory", labelKey: "memory", glyph: "04" },
  { to: "/settings", labelKey: "settings", glyph: "05" },
  { to: "/demo", labelKey: "demo", glyph: "06" },
] as const satisfies ReadonlyArray<{
  to: string;
  labelKey: keyof Messages["shell"]["nav"];
  glyph: string;
}>;

// relTime — t.shell.relTime 사전 받아 분기. ts 인자 + t 한 번에 받아 함수
// 외부 hook 의존 없이 순수 함수 유지 (테스트 / SSR 안전).
function relTime(ts: number, rt: Messages["shell"]["relTime"]): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return rt.justNow;
  if (m < 60) return rt.minutesAgo(m);
  const h = Math.floor(m / 60);
  if (h < 24) return rt.hoursAgo(h);
  const d = Math.floor(h / 24);
  return rt.daysAgo(d);
}

// Context so child routes can open the mobile sidebar from their own header.
type ShellCtx = { openMobile: () => void };
const ShellContext = createContext<ShellCtx | null>(null);
export function useShell() {
  return useContext(ShellContext);
}

export function Shell({ children }: { children?: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { threads, activeId } = useConversationStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();

  const onChat = loc.pathname === "/";
  // Single time-sorted chat list. The previous "맥락" section conflated
  // pinned themed threads with the pack/mode selector — that's now
  // owned by the chat header pill row, leaving the sidebar to do one
  // job: list chats.
  const sortedThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  function openThread(id: string) {
    selectThread(id);
    setMobileOpen(false);
    if (!onChat) nav({ to: "/" });
  }

  function newThread() {
    const thread = createThread("open", t.shell.newThreadDefaultTitle);
    selectThread(thread.id);
    setMobileOpen(false);
    if (!onChat) nav({ to: "/" });
  }

  const sidebarInner = (
    <>
      <div className="px-5 pt-6 pb-4">
        <Link to="/" className="block" onClick={() => setMobileOpen(false)}>
          {/* "O" 자리 = bg-current rounded-full — 알파벳 색 그대로 채워진 점. */}
          <div className="flex items-baseline gap-0.5">
            <span className="text-[36px] font-bold leading-none">D</span>
            <span
              aria-hidden="true"
              className="inline-block w-[14px] h-[14px] rounded-full bg-current self-center mb-1"
            />
            <span className="text-[36px] font-bold leading-none">TS</span>
          </div>
          <span className="mt-1.5 block text-[14px] font-semibold text-ink-soft">
            AI Layer Core System v1
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
            {t.shell.newThread}
          </span>
          <span className="font-mono text-[10px] text-ink-soft uppercase tracking-[0.14em]">
            new
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-5">
        <section>
          <div className="px-3 pt-2 pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
              {t.shell.sectionChats}
            </p>
          </div>
          {sortedThreads.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-ink-soft leading-relaxed">{t.shell.emptyTitle}</p>
              <p className="mt-1 text-[12px] text-ink-soft/70">{t.shell.emptyHint}</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {sortedThreads.map((thread) => {
                const active = onChat && thread.id === activeId;
                return (
                  <li key={thread.id}>
                    <button
                      onClick={() => openThread(thread.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        active
                          ? "bg-accent text-ink"
                          : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="text-[13px] truncate flex-1 min-w-0">{thread.title}</span>
                      <span className="font-mono text-[10px] text-ink-soft/60 shrink-0">
                        {relTime(thread.updatedAt, t.shell.relTime)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="px-3 pb-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
              {t.shell.sectionSystem}
            </p>
          </div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = loc.pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
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
                      {t.shell.nav[item.labelKey]}
                    </span>
                    {active && <span className="h-1 w-1 rounded-full bg-primary" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="px-5 py-4 border-t border-border">
        <LanguageToggle />
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span>{t.shell.deviceBadge}</span>
        </div>
      </div>
    </>
  );

  return (
    <ShellContext.Provider value={{ openMobile: () => setMobileOpen(true) }}>
      <div className="min-h-screen w-full flex bg-background text-ink">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-border bg-surface">
          {sidebarInner}
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative flex w-72 max-w-[80%] flex-col border-r border-border bg-surface fade-in">
              {sidebarInner}
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}

// Phase 2 i18n 사이드바 토글. 자기 라벨은 KO/EN 동일값 (UX 관행 — 사용자가
// 자기 언어 외 선택지를 자기 언어로 보면 헷갈림). preferences.language 갱신
// → useSyncExternalStore 자동 리렌더 → 전체 트리 즉시 전환.
function LanguageToggle() {
  const { language } = usePreferences();
  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden text-[11px]">
      <button
        type="button"
        onClick={() => setLanguage("ko")}
        className={`flex-1 px-3 py-1.5 transition-colors ${
          language === "ko"
            ? "bg-ink text-background"
            : "text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        한국어
      </button>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`flex-1 px-3 py-1.5 transition-colors ${
          language === "en"
            ? "bg-ink text-background"
            : "text-ink-soft hover:text-ink hover:bg-surface-2"
        }`}
      >
        English
      </button>
    </div>
  );
}

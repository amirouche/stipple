import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ReactNode, createContext, useContext, useState } from "react";
import { createThread, selectThread, useConversationStore } from "@/lib/conversation-store";

const NAV = [
  { to: "/packs", label: "팩", glyph: "02" },
  { to: "/memory", label: "기억", glyph: "03" },
  { to: "/settings", label: "설정", glyph: "04" },
] as const;

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
    const t = createThread("open", "새 대화");
    selectThread(t.id);
    setMobileOpen(false);
    if (!onChat) nav({ to: "/" });
  }

  const sidebarInner = (
    <>
      <div className="px-5 pt-6 pb-4">
        <Link to="/" className="flex items-baseline gap-2" onClick={() => setMobileOpen(false)}>
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
            <span className="font-mono text-[11px] text-ink-soft">＋</span>새 대화
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
              채팅
            </p>
          </div>
          {sortedThreads.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-ink-soft leading-relaxed">아직 시작된 대화가 없어.</p>
              <p className="mt-1 text-[12px] text-ink-soft/70">위의 + 새 대화로 시작해.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {sortedThreads.map((t) => {
                const active = onChat && t.id === activeId;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => openThread(t.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        active
                          ? "bg-accent text-ink"
                          : "text-ink-soft hover:text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="text-[13px] truncate flex-1 min-w-0">{t.title}</span>
                      <span className="font-mono text-[10px] text-ink-soft/60 shrink-0">
                        {relTime(t.updatedAt)}
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
              시스템
            </p>
          </div>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
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
                      {item.label}
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
        <div className="flex items-center gap-2 text-[11px] text-ink-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span>이 기기 안에서</span>
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

import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Chat", glyph: "01" },
  { to: "/packs", label: "Packs", glyph: "02" },
  { to: "/cooking", label: "Cooking demo", glyph: "03" },
  { to: "/memory", label: "Memory", glyph: "04" },
  { to: "/settings", label: "Settings", glyph: "05" },
] as const;

export function Shell({ children }: { children?: ReactNode }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen w-full flex bg-background text-ink">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-6 pt-7 pb-10">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-[22px] font-semibold tracking-tight">DOTS</span>
            <span className="font-mono text-[10px] text-ink-soft uppercase tracking-[0.18em]">
              v0.1
            </span>
          </Link>
          <p className="mt-2 text-[11px] text-ink-soft leading-relaxed max-w-[160px]">
            A user-adaptive layer on top of a strong base model.
          </p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map((item) => {
            const active =
              item.to === "/"
                ? loc.pathname === "/"
                : loc.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center justify-between px-3 py-2 rounded-md text-[13.5px] transition-colors ${
                  active
                    ? "bg-accent text-ink"
                    : "text-ink-soft hover:text-ink hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`font-mono text-[10px] ${
                      active ? "text-primary" : "text-ink-soft/70"
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
            );
          })}
        </nav>
        <div className="px-6 py-5 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>On-device · Personal layer active</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

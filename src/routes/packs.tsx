import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { PACKS, type Pack } from "@/lib/dots-data";

export const Route = createFileRoute("/packs")({
  head: () => ({
    meta: [
      { title: "Packs — DOTS" },
      {
        name: "description",
        content:
          "Browse and install DOTS packs. Each pack changes how the base model handles a category of questions.",
      },
    ],
  }),
  component: PacksPage,
});

const CATEGORIES = ["All", "Cooking", "Education", "Lifestyle", "Work"] as const;

function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>(PACKS);
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("All");

  const visible =
    filter === "All" ? packs : packs.filter((p) => p.category === filter);

  function toggle(id: string) {
    setPacks((ps) =>
      ps.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p))
    );
  }

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            Library
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            Packs
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
            A pack is a small, reusable execution unit. It rewires how DOTS
            interprets and structures a class of requests.
          </p>

          <div className="mt-6 flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                  filter === c
                    ? "bg-ink text-background"
                    : "text-ink-soft hover:text-ink hover:bg-surface-2"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </header>

        <div className="px-8 md:px-12 py-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {visible.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border bg-card p-5 flex flex-col hover:border-strong transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {p.category}
                  </span>
                  {p.installed && (
                    <span className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-primary">
                      <span className="h-1 w-1 rounded-full bg-primary" />
                      installed
                    </span>
                  )}
                </div>
                <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                  {p.name}
                </h3>
                <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
                  {p.short}
                </p>

                <div className="mt-4 pt-4 border-t border-border">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                    How it changes behavior
                  </p>
                  <p className="text-[12.5px] text-ink leading-relaxed">
                    {p.behavior}
                  </p>
                </div>

                <button
                  onClick={() => toggle(p.id)}
                  className={`mt-5 h-9 rounded-md text-[12.5px] font-medium transition-colors ${
                    p.installed
                      ? "border border-border text-ink hover:bg-surface-2"
                      : "bg-ink text-background hover:opacity-90"
                  }`}
                >
                  {p.installed ? "Remove" : "Install"}
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

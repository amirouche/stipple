import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { PACKS, type Pack } from "@/lib/dots-data";
import { usePreferences } from "@/lib/preferences";
import { useT, type Messages } from "@/lib/i18n";

export const Route = createFileRoute("/packs")({
  head: () => ({
    meta: [
      { title: "팩 — DOTS" },
      {
        name: "description",
        content: "DOTS의 팩을 둘러보세요. 각 팩은 같은 모델의 행동을 한 영역에서 다르게 바꿉니다.",
      },
    ],
  }),
  component: PacksPage,
});

// 카테고리 ID — Pack.category union 그대로. "all" 가 sentinel (전체) — 다른
// 값은 Pack.category 일치.
type CategoryFilter = "all" | Pack["category"];
const CATEGORY_FILTERS: readonly CategoryFilter[] = ["all", "Game", "Education", "Lifestyle"];

// Pack.category ("Game"/"Education"/"Lifestyle") → t.packs.categories key.
const PACK_CATEGORY_KEY: Record<Pack["category"], keyof Messages["packs"]["categories"]> = {
  Game: "game",
  Education: "education",
  Lifestyle: "lifestyle",
};

// pack.id → t.packs.behaviorLines key. 4 작동 팩만 매핑 — 미매핑 pack 은
// p.behavior fallback.
const PACK_BEHAVIOR_KEY: Record<string, keyof Messages["packs"]["behaviorLines"]> = {
  "cooking-essentials": "cookingEssentials",
  "study-companion": "studyCompanion",
  sudoku: "sudoku",
  "morning-routine": "morningRoutine",
};

function categoryLabel(c: CategoryFilter, t: Messages): string {
  if (c === "all") return t.packs.categories.all;
  return t.packs.categories[PACK_CATEGORY_KEY[c]];
}

function behaviorLineFor(packId: string, t: Messages): string | undefined {
  const key = PACK_BEHAVIOR_KEY[packId];
  return key ? t.packs.behaviorLines[key] : undefined;
}

function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>(PACKS);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  // "active" = installed AND user hasn't paused it. Keeps install vs use distinct.
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const prefs = usePreferences();
  const t = useT();
  const lang = prefs.language;

  const ordered = [...packs].sort((a, b) => {
    const ai = prefs.packOrder.indexOf(a.id);
    const bi = prefs.packOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const visible = filter === "all" ? ordered : ordered.filter((p) => p.category === filter);

  function toggleInstall(id: string) {
    setPacks((ps) => ps.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p)));
  }
  function togglePause(id: string) {
    setPaused((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            {t.packs.eyebrow}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            {t.packs.title}
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">{t.packs.subtitle}</p>

          <div className="mt-6 flex gap-1">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                  filter === c
                    ? "bg-ink text-background"
                    : "text-ink-soft hover:text-ink hover:bg-surface-2"
                }`}
              >
                {categoryLabel(c, t)}
              </button>
            ))}
          </div>
        </header>

        <div className="px-8 md:px-12 py-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {visible.map((p) => {
              const installed = p.installed;
              const active = installed && !paused.has(p.id);
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-border bg-card p-5 flex flex-col hover:border-strong transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                      {t.packs.categories[PACK_CATEGORY_KEY[p.category]]} · {p.category}
                    </span>
                    <StateBadge installed={installed} active={active} />
                  </div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-ink">{p.name}</h3>
                  <p className="mt-1 text-[12px] text-ink-soft">
                    <span className="text-ink">
                      {lang === "en" ? (p.voiceEn ?? p.voice) : p.voice}
                    </span>{" "}
                    · {lang === "en" ? (p.toneEn ?? p.tone) : p.tone}
                  </p>
                  <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
                    {lang === "en" ? (p.shortEn ?? p.short) : p.short}
                  </p>

                  {/* One-line behavior — the headline change */}
                  <div className="mt-3 px-3 py-2 rounded-md bg-surface border border-border">
                    <p className="text-[12.5px] text-ink leading-snug">
                      {behaviorLineFor(p.id, t) ?? p.behavior}
                    </p>
                  </div>

                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.14em] text-ink-soft hover:text-ink list-none">
                      {t.packs.detailsMore}
                    </summary>
                    <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
                      {lang === "en" ? (p.behaviorEn ?? p.behavior) : p.behavior}
                    </p>
                  </details>

                  <div className="mt-5 flex items-center gap-2">
                    <button
                      onClick={() => toggleInstall(p.id)}
                      className={`flex-1 h-9 rounded-md text-[12.5px] font-medium transition-colors ${
                        installed
                          ? "border border-border text-ink hover:bg-surface-2"
                          : "bg-ink text-background hover:opacity-90"
                      }`}
                    >
                      {installed ? t.packs.uninstall : t.packs.install}
                    </button>
                    {installed && (
                      <button
                        onClick={() => togglePause(p.id)}
                        className="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                      >
                        {active ? t.packs.pause : t.packs.activate}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function StateBadge({ installed, active }: { installed: boolean; active: boolean }) {
  const t = useT();
  if (!installed) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/60">
        {t.packs.state.notInstalled}
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        {t.packs.state.active}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-soft">
      <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
      {t.packs.state.idle}
    </span>
  );
}

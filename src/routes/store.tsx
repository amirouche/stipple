// 팩스토어 — 마켓플레이스 컨셉 증명용 화면. 실제 설치 동작은 더미고
// (클릭하면 카드 상태만 "설치됨"으로 토글), 카탈로그 UI 흐름만 보여준다.
// 헌법 4번을 시각화하는 자리.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { STORE_PACKS, formatPrice, type StorePack } from "@/lib/store-packs";
import { useT, type Messages } from "@/lib/i18n";

export const Route = createFileRoute("/store")({
  head: () => ({
    meta: [
      { title: "팩스토어 — DOTS" },
      {
        name: "description",
        content: "DOTS 팩스토어 — 더 많은 콘텐츠와 행동 패턴을 한 번에.",
      },
    ],
  }),
  component: StorePage,
});

// 카테고리 필터 ID — "all" sentinel + StorePack.category union (한국어 데이터).
// 데이터 layer 는 한국어 ID 유지. 렌더 시 t.store.categories 로 라벨 매핑.
type StoreFilter = "all" | StorePack["category"];
const STORE_FILTERS: readonly StoreFilter[] = [
  "all",
  "학습",
  "요리",
  "라이프스타일",
  "업무",
  "엔터테인먼트",
];
const STORE_CATEGORY_KEY: Record<StorePack["category"], keyof Messages["store"]["categories"]> = {
  학습: "learning",
  요리: "cooking",
  라이프스타일: "lifestyle",
  업무: "work",
  엔터테인먼트: "entertainment",
};

function filterLabel(c: StoreFilter, t: Messages): string {
  if (c === "all") return t.store.categories.all;
  return t.store.categories[STORE_CATEGORY_KEY[c]];
}

function StorePage() {
  const [packs, setPacks] = useState<StorePack[]>(STORE_PACKS);
  const [filter, setFilter] = useState<StoreFilter>("all");
  const [query, setQuery] = useState("");

  const visible = packs.filter((p) => {
    if (filter !== "all" && p.category !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.short.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  function toggleInstall(id: string) {
    setPacks((ps) => ps.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p)));
  }

  return (
    <Shell>
      <StoreBody
        packs={visible}
        filter={filter}
        setFilter={setFilter}
        query={query}
        setQuery={setQuery}
        onToggleInstall={toggleInstall}
      />
    </Shell>
  );
}

function StoreBody({
  packs,
  filter,
  setFilter,
  query,
  setQuery,
  onToggleInstall,
}: {
  packs: StorePack[];
  filter: StoreFilter;
  setFilter: (c: StoreFilter) => void;
  query: string;
  setQuery: (q: string) => void;
  onToggleInstall: (id: string) => void;
}) {
  const shell = useShell();
  const t = useT();

  return (
    <div className="flex flex-col">
      <header className="px-4 sm:px-8 md:px-12 pt-6 pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => shell?.openMobile()}
            className="md:hidden shrink-0 h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label={t.shell.menuOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              {t.store.eyebrow}
            </p>
            <h1 className="mt-1 text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">
              {t.store.title}
            </h1>
            <p className="mt-1 text-[13px] text-ink-soft max-w-xl">{t.store.subtitle}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.store.searchPlaceholder}
            className="flex-1 h-9 px-3 rounded-md border border-border bg-card text-[13px] text-ink placeholder:text-ink-soft/70 outline-none focus:border-strong transition-colors"
          />
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {STORE_FILTERS.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                  filter === c
                    ? "bg-ink text-background"
                    : "text-ink-soft hover:text-ink hover:bg-surface-2"
                }`}
              >
                {filterLabel(c, t)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8 md:px-12 py-8">
        {packs.length === 0 ? (
          <div className="max-w-xl">
            <p className="text-[13.5px] text-ink leading-relaxed">{t.store.emptyTitle}</p>
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
              {t.store.emptyDescription}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {packs.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border bg-card p-5 flex flex-col hover:border-strong transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {t.store.categories[STORE_CATEGORY_KEY[p.category]]}
                  </span>
                  <span
                    className={`font-mono text-[11px] tracking-[0.06em] ${
                      p.priceWon === 0 ? "text-primary" : "text-ink"
                    }`}
                  >
                    {formatPrice(p.priceWon, t.store.priceFree)}
                  </span>
                </div>
                <h3 className="text-[15.5px] font-semibold tracking-tight text-ink leading-snug">
                  {p.name}
                </h3>
                <p className="mt-1 text-[12px] text-ink-soft leading-snug">
                  <span className="text-ink">{p.voice}</span> · {p.tone}
                </p>
                <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">{p.short}</p>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-soft">
                  <span className="font-mono">{p.contentCount}</span>
                  <span className="text-ink-soft/40">·</span>
                  <span>{p.author}</span>
                </div>

                <button
                  onClick={() => onToggleInstall(p.id)}
                  className={`mt-5 h-9 rounded-md text-[12.5px] font-medium transition-colors ${
                    p.installed
                      ? "border border-border text-ink hover:bg-surface-2"
                      : "bg-ink text-background hover:opacity-90"
                  }`}
                >
                  {p.installed
                    ? t.store.buttonInstalledRemove
                    : p.priceWon === 0
                      ? t.store.buttonFreeInstall
                      : t.store.buttonBuyInstall}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

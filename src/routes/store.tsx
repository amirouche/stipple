// 팩스토어 — 마켓플레이스 컨셉 증명용 화면. 실제 설치 동작은 더미고
// (클릭하면 카드 상태만 "설치됨"으로 토글), 카탈로그 UI 흐름만 보여준다.
// 헌법 4번을 시각화하는 자리.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { STORE_CATEGORIES, STORE_PACKS, formatPrice, type StorePack } from "@/lib/store-packs";

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

function StorePage() {
  const [packs, setPacks] = useState<StorePack[]>(STORE_PACKS);
  const [filter, setFilter] = useState<(typeof STORE_CATEGORIES)[number]>("전체");
  const [query, setQuery] = useState("");

  const visible = packs.filter((p) => {
    if (filter !== "전체" && p.category !== filter) return false;
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
  filter: (typeof STORE_CATEGORIES)[number];
  setFilter: (c: (typeof STORE_CATEGORIES)[number]) => void;
  query: string;
  setQuery: (q: string) => void;
  onToggleInstall: (id: string) => void;
}) {
  const shell = useShell();

  return (
    <div className="flex flex-col">
      <header className="px-4 sm:px-8 md:px-12 pt-6 pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => shell?.openMobile()}
            className="md:hidden shrink-0 h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label="메뉴 열기"
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
              마켓플레이스
            </p>
            <h1 className="mt-1 text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">
              팩스토어
            </h1>
            <p className="mt-1 text-[13px] text-ink-soft max-w-xl">
              더 많은 콘텐츠와 행동 패턴을 추가하세요. 설치한 팩은 채팅과 매칭에서 곧장 작동해.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="팩, 작가, 주제 검색"
            className="flex-1 h-9 px-3 rounded-md border border-border bg-card text-[13px] text-ink placeholder:text-ink-soft/70 outline-none focus:border-strong transition-colors"
          />
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {STORE_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[12.5px] transition-colors ${
                  filter === c
                    ? "bg-ink text-background"
                    : "text-ink-soft hover:text-ink hover:bg-surface-2"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-8 md:px-12 py-8">
        {packs.length === 0 ? (
          <p className="text-[13px] text-ink-soft">검색 결과가 없어. 다른 단어로 시도해봐.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl">
            {packs.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border bg-card p-5 flex flex-col hover:border-strong transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {p.category}
                  </span>
                  <span
                    className={`font-mono text-[11px] tracking-[0.06em] ${
                      p.priceWon === 0 ? "text-primary" : "text-ink"
                    }`}
                  >
                    {formatPrice(p.priceWon)}
                  </span>
                </div>
                <h3 className="text-[15.5px] font-semibold tracking-tight text-ink leading-snug">
                  {p.name}
                </h3>
                <p className="mt-1.5 text-[12.5px] text-ink-soft leading-relaxed">{p.short}</p>

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
                  {p.installed ? "설치됨 — 제거" : p.priceWon === 0 ? "무료 설치" : "구매하고 설치"}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { PACKS, type Pack } from "@/lib/dots-data";
import { usePreferences } from "@/lib/preferences";

export const Route = createFileRoute("/packs")({
  head: () => ({
    meta: [
      { title: "팩 — DOTS" },
      {
        name: "description",
        content:
          "DOTS의 팩을 둘러보세요. 각 팩은 같은 모델의 행동을 한 영역에서 다르게 바꿉니다.",
      },
    ],
  }),
  component: PacksPage,
});

const CATEGORIES = ["전체", "Cooking", "Education", "Lifestyle", "Work"] as const;

const CATEGORY_KO: Record<Pack["category"], string> = {
  Cooking: "요리",
  Education: "공부",
  Lifestyle: "생활",
  Work: "일",
};

// One-line "what does this change" — stronger than the long behavior copy.
const BEHAVIOR_LINE: Record<string, string> = {
  "cooking-essentials": "요리 질문을 재료·순서·시간으로 바로 정리해줘.",
  "study-companion": "설명 대신 단계로 풀고, 막힌 지점을 먼저 물어봐.",
  "morning-routine": "오늘 일정·날씨를 기기 안에서 바로 답해.",
  "focus-writer": "긴 글에서 더하기보다 빼는 쪽으로 제안해.",
  "wine-cellar": "냉장고에 있는 걸 기준으로 페어링을 골라.",
  "code-review": "팀 컨벤션을 로컬 팩으로 읽고 그 기준으로 봐.",
};

function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>(PACKS);
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("전체");
  // "active" = installed AND user hasn't paused it. Keeps install vs use distinct.
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const prefs = usePreferences();

  const ordered = [...packs].sort((a, b) => {
    const ai = prefs.packOrder.indexOf(a.id);
    const bi = prefs.packOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const visible =
    filter === "전체" ? ordered : ordered.filter((p) => p.category === filter);

  function toggleInstall(id: string) {
    setPacks((ps) =>
      ps.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p))
    );
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
            팩 라이브러리
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            팩
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
            팩은 작은 실행 단위. DOTS가 같은 질문을 어떻게 해석하고
            정리해줄지 한 영역에서 바꿔.
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
                {c === "전체" ? c : CATEGORY_KO[c as Pack["category"]] ?? c}
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
                      {CATEGORY_KO[p.category]} · {p.category}
                    </span>
                    <StateBadge installed={installed} active={active} />
                  </div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-ink">
                    {p.name}
                  </h3>
                  <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">
                    {p.short}
                  </p>

                  {/* One-line behavior — the headline change */}
                  <div className="mt-3 px-3 py-2 rounded-md bg-surface border border-border">
                    <p className="text-[12.5px] text-ink leading-snug">
                      {BEHAVIOR_LINE[p.id] ?? p.behavior}
                    </p>
                  </div>

                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.14em] text-ink-soft hover:text-ink list-none">
                      더 자세히
                    </summary>
                    <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
                      {p.behavior}
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
                      {installed ? "제거" : "설치"}
                    </button>
                    {installed && (
                      <button
                        onClick={() => togglePause(p.id)}
                        className="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                      >
                        {active ? "일시정지" : "활성화"}
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
  if (!installed) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/60">
        설치 안 됨
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        활성
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-ink-soft">
      <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
      대기
    </span>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { SAVED_RECIPES } from "@/lib/dots-data";
import {
  useMemoryStore,
  type ArchiveEntry,
  type ArchiveGranularity,
  type MemoryRecord,
} from "@/lib/memory";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "기억 — DOTS" },
      {
        name: "description",
        content:
          "DOTS의 기억은 임시·자주 나온 것·저장된 것·아카이브로 나뉩니다. 모두 이 기기 안에서.",
      },
    ],
  }),
  component: MemoryPage,
});

type ShelfItem = { t: string; meta: string };

type Shelf = {
  key: string;
  name: string;
  desc: string;
  badge: string;
  items: ShelfItem[];
  empty: string;
};

const DAY_MS = 86_400_000;
const SEASONS = ["겨울", "봄", "여름", "가을"] as const;
const GRANULARITY_ORDER: Record<ArchiveGranularity, number> = {
  day: 0,
  week: 1,
  month: 2,
  quarter: 3,
  year: 4,
};

function relTime(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return "방금";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(diff / DAY_MS);
  if (d < 7) return `${d}일 전`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}주 전`;
  const date = new Date(ts);
  const nowDate = new Date(now);
  const sameYear = date.getFullYear() === nowDate.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}월 ${date.getDate()}일`
    : `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

function formatArchiveWindow(g: ArchiveGranularity, windowStart: number, now: number): string {
  const ws = new Date(windowStart);
  const n = new Date(now);

  if (g === "day") {
    const todayStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    if (windowStart === todayStart) return "오늘";
    if (windowStart === todayStart - DAY_MS) return "어제";
    const daysAgo = Math.floor((todayStart - windowStart) / DAY_MS);
    if (daysAgo > 0 && daysAgo < 7) return `${daysAgo}일 전`;
    const sameYear = ws.getUTCFullYear() === n.getUTCFullYear();
    return sameYear
      ? `${ws.getUTCMonth() + 1}월 ${ws.getUTCDate()}일`
      : `${ws.getUTCFullYear()}.${ws.getUTCMonth() + 1}.${ws.getUTCDate()}`;
  }

  if (g === "week") {
    const dow = (n.getUTCDay() || 7) - 1;
    const thisWeekStart = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - dow);
    if (windowStart === thisWeekStart) return "이번 주";
    if (windowStart === thisWeekStart - 7 * DAY_MS) return "지난주";
    const weeksAgo = Math.round((thisWeekStart - windowStart) / (7 * DAY_MS));
    if (weeksAgo > 0 && weeksAgo < 5) return `${weeksAgo}주 전`;
    const sameYear = ws.getUTCFullYear() === n.getUTCFullYear();
    return sameYear
      ? `${ws.getUTCMonth() + 1}월 ${ws.getUTCDate()}일 주`
      : `${ws.getUTCFullYear()}.${ws.getUTCMonth() + 1}.${ws.getUTCDate()} 주`;
  }

  if (g === "month") {
    const thisMonth = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1);
    const lastMonth = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1);
    if (windowStart === thisMonth) return "이번 달";
    if (windowStart === lastMonth) return "지난달";
    const sameYear = ws.getUTCFullYear() === n.getUTCFullYear();
    return sameYear
      ? `${ws.getUTCMonth() + 1}월`
      : `${ws.getUTCFullYear()}년 ${ws.getUTCMonth() + 1}월`;
  }

  if (g === "quarter") {
    const thisQStart = Date.UTC(n.getUTCFullYear(), Math.floor(n.getUTCMonth() / 3) * 3, 1);
    if (windowStart === thisQStart) return "이번 분기";
    const sameYear = ws.getUTCFullYear() === n.getUTCFullYear();
    const season = SEASONS[Math.floor(ws.getUTCMonth() / 3)];
    return sameYear ? `올해 ${season}` : `${ws.getUTCFullYear()}년 ${season}`;
  }

  // year
  const thisY = n.getUTCFullYear();
  const wsY = ws.getUTCFullYear();
  if (wsY === thisY) return "올해";
  if (wsY === thisY - 1) return "작년";
  if (wsY === thisY - 2) return "재작년";
  return `${wsY}년`;
}

function temporaryShelf(memories: MemoryRecord[], now: number): ShelfItem[] {
  return memories
    .filter((m) => m.state === "temporary")
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .map((m) => ({ t: m.topic, meta: relTime(m.lastAccessedAt, now) }));
}

function frequentShelf(memories: MemoryRecord[], now: number): ShelfItem[] {
  return memories
    .filter((m) => m.state === "active")
    .sort((a, b) => {
      if (b.accessCount !== a.accessCount) return b.accessCount - a.accessCount;
      return b.lastAccessedAt - a.lastAccessedAt;
    })
    .map((m) => ({
      t: `${m.topic} — ${m.accessCount}번 등장`,
      meta: relTime(m.lastAccessedAt, now),
    }));
}

function archiveShelf(archives: ArchiveEntry[], now: number): ShelfItem[] {
  return [...archives]
    .sort((a, b) => {
      const oa = GRANULARITY_ORDER[a.granularity];
      const ob = GRANULARITY_ORDER[b.granularity];
      if (oa !== ob) return oa - ob;
      return b.windowStart - a.windowStart;
    })
    .map((e) => {
      const top = e.topics
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((t) => t.topic)
        .join(", ");
      const label = top || `${e.sourceMemoryIds.length}개 항목`;
      return {
        t: label,
        meta: formatArchiveWindow(e.granularity, e.windowStart, now),
      };
    });
}

function MemoryPage() {
  const { memories, archives } = useMemoryStore();
  const now = Date.now();

  const shelves: Shelf[] = [
    {
      key: "temp",
      name: "임시 기억",
      desc: "지금 대화 안에서만 살아 있어. 따로 저장하지 않으면 곧 잊어.",
      badge: "휘발",
      items: temporaryShelf(memories, now),
      empty: "지금은 비어 있어. 새 대화에서 잠깐 머무는 정보가 여기 들어와.",
    },
    {
      key: "frequent",
      name: "자주 나온 것",
      desc: "여러 대화에 반복해서 등장한 주제. 가까이에 두고 바로 꺼내.",
      badge: "근접",
      items: frequentShelf(memories, now),
      empty: "아직 자주 등장한 게 없어. 같은 주제가 반복되면 여기로 올라와.",
    },
    {
      key: "saved",
      name: "저장된 것",
      desc: "내가 직접 보관한 것. 팩이 필요할 때 먼저 여기서 찾아.",
      badge: "고정",
      items: SAVED_RECIPES.map((r) => ({ t: r.title, meta: r.mentioned })),
      empty: "저장된 게 아직 없어.",
    },
    {
      key: "archive",
      name: "아카이브",
      desc: "지난 대화 기록. 추론에는 쓰이지 않고, 필요할 때 들춰볼 수 있어.",
      badge: "보관만",
      items: archiveShelf(archives, now),
      empty: "아카이브가 비어 있어. 오래된 대화가 쌓이면 여기로 모여.",
    },
  ];

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            개인 레이어
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">기억</h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
            한 통이 아니라 네 칸이야. 각자 역할이 달라서, 무엇을 가까이 둘지는 네가 정해.
          </p>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-3xl space-y-3">
          {shelves.map((shelf) => (
            <section
              key={shelf.key}
              className="rounded-xl border border-border bg-card overflow-hidden slide-in"
            >
              <div className="px-5 py-4 flex items-baseline justify-between border-b border-border">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                    {shelf.name}
                  </h2>
                  <p className="text-[12px] text-ink-soft mt-0.5">{shelf.desc}</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft shrink-0 ml-3">
                  {shelf.badge}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {shelf.items.length === 0 ? (
                  <li className="px-5 py-4 text-[13px] text-ink-soft/80 italic">{shelf.empty}</li>
                ) : (
                  shelf.items.map((item, i) => (
                    <li key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className="text-[13.5px] text-ink min-w-0 truncate">{item.t}</span>
                      <span className="font-mono text-[10.5px] text-ink-soft shrink-0">
                        {item.meta}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}

          <div className="mt-8 p-4 rounded-lg bg-surface-2 border border-border">
            <p className="text-[12.5px] text-ink-soft leading-relaxed">
              <span className="text-ink font-medium">기기 밖으로 안 나가.</span> 기억은 이 기기 안에
              머물러. 아카이브는 언제든 설정에서 내보낼 수 있어.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

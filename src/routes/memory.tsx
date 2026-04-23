import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";

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

type Shelf = {
  key: string;
  name: string;
  desc: string;
  badge: string;
  items: { t: string; meta: string }[];
};

const SHELVES: Shelf[] = [
  {
    key: "temp",
    name: "임시 기억",
    desc: "지금 대화 안에서만 살아 있어. 따로 저장하지 않으면 곧 잊어.",
    badge: "휘발",
    items: [
      { t: "오늘은 김치찌개 얘기로 시작했어", meta: "방금" },
      { t: "두 명분으로 끓일 거라고 했어", meta: "2분 전" },
      { t: "참치캔 있다고 한 번 언급", meta: "3분 전" },
    ],
  },
  {
    key: "frequent",
    name: "자주 나온 것",
    desc: "여러 대화에 반복해서 등장한 주제. 가까이에 두고 바로 꺼내.",
    badge: "근접",
    items: [
      { t: "김치찌개 — 8번 대화에 등장", meta: "이번 달" },
      { t: "어텐션 / 트랜스포머", meta: "최근 6번" },
      { t: "점심 메뉴 정하기", meta: "꾸준히" },
    ],
  },
  {
    key: "saved",
    name: "저장된 것",
    desc: "내가 직접 보관한 것. 팩이 필요할 때 먼저 여기서 찾아.",
    badge: "고정",
    items: [
      { t: "백종원식 김치찌개", meta: "2주 전 저장" },
      { t: "참치김치찌개", meta: "지난주 저장" },
      { t: "된장찌개 기본 비율", meta: "지난달 저장" },
    ],
  },
  {
    key: "archive",
    name: "아카이브",
    desc: "지난 대화 기록. 추론에는 쓰이지 않고, 필요할 때 들춰볼 수 있어.",
    badge: "보관만",
    items: [
      { t: "542개 대화", meta: "내보내기 가능" },
      { t: "은퇴한 팩 31개", meta: "내보내기 가능" },
    ],
  },
];

function MemoryPage() {
  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            개인 레이어
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            기억
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
            한 통이 아니라 네 칸이야. 각자 역할이 달라서, 무엇을 가까이 둘지는
            네가 정해.
          </p>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-3xl space-y-3">
          {SHELVES.map((shelf) => (
            <section
              key={shelf.key}
              className="rounded-xl border border-border bg-card overflow-hidden slide-in"
            >
              <div className="px-5 py-4 flex items-baseline justify-between border-b border-border">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                    {shelf.name}
                  </h2>
                  <p className="text-[12px] text-ink-soft mt-0.5">
                    {shelf.desc}
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft shrink-0 ml-3">
                  {shelf.badge}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {shelf.items.map((item, i) => (
                  <li
                    key={i}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-[13.5px] text-ink min-w-0 truncate">
                      {item.t}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-soft shrink-0">
                      {item.meta}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="mt-8 p-4 rounded-lg bg-surface-2 border border-border">
            <p className="text-[12.5px] text-ink-soft leading-relaxed">
              <span className="text-ink font-medium">기기 밖으로 안 나가.</span>{" "}
              기억은 이 기기 안에 머물러. 아카이브는 언제든 설정에서
              내보낼 수 있어.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

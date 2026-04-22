import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Memory — DOTS" },
      {
        name: "description",
        content:
          "DOTS memory has structure: temporary, promoted, dormant, archive. Personal data stays on your device.",
      },
    ],
  }),
  component: MemoryPage,
});

type Tier = {
  key: string;
  name: string;
  desc: string;
  items: { t: string; meta: string }[];
};

const TIERS: Tier[] = [
  {
    key: "temp",
    name: "Temporary",
    desc: "Active in the current session. Forgotten unless promoted.",
    items: [
      { t: "Asked about kimchi stew", meta: "2 min ago" },
      { t: "Mentioned cooking for two tonight", meta: "2 min ago" },
    ],
  },
  {
    key: "promoted",
    name: "Promoted",
    desc: "Stable facts DOTS reuses across sessions.",
    items: [
      { t: "Cooks for a household of 2", meta: "kept · 12 sessions" },
      { t: "Prefers medium spice level", meta: "kept · 8 sessions" },
      { t: "Vegetarian on Mondays", meta: "kept · 4 sessions" },
    ],
  },
  {
    key: "dormant",
    name: "Dormant",
    desc: "Older context. Not actively used, but available if a pack pulls it back.",
    items: [
      { t: "Owned a sourdough starter for 3 months", meta: "last touched · Feb" },
      { t: "Prefers IPA over lager", meta: "last touched · Jan" },
    ],
  },
  {
    key: "archive",
    name: "Archive",
    desc: "Read-only history. Never used in inference.",
    items: [
      { t: "542 conversations", meta: "exportable" },
      { t: "31 retired packs", meta: "exportable" },
    ],
  },
];

function MemoryPage() {
  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            Personal layer
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            Memory
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
            Memory in DOTS isn't a single bucket. Each tier serves a different
            purpose, and you stay in charge of what gets promoted.
          </p>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-3xl space-y-3">
          {TIERS.map((tier) => (
            <section
              key={tier.key}
              className="rounded-xl border border-border bg-card overflow-hidden slide-in"
            >
              <div className="px-5 py-4 flex items-baseline justify-between border-b border-border">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                    {tier.name}
                  </h2>
                  <p className="text-[12px] text-ink-soft mt-0.5">{tier.desc}</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  {tier.items.length} entries
                </span>
              </div>
              <ul className="divide-y divide-border">
                {tier.items.map((item, i) => (
                  <li
                    key={i}
                    className="px-5 py-3 flex items-center justify-between"
                  >
                    <span className="text-[13.5px] text-ink">{item.t}</span>
                    <span className="font-mono text-[10.5px] text-ink-soft">
                      {item.meta}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="mt-8 p-4 rounded-lg bg-surface-2 border border-border">
            <p className="text-[12.5px] text-ink-soft leading-relaxed">
              <span className="text-ink font-medium">On-device only.</span> Memory
              never leaves this device. You can export the archive at any time
              from Settings.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

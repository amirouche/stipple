import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { RecipeCard, KIMCHI_STEW } from "@/components/RecipeCard";
import {
  PACKS,
  SAVED_RECIPES,
  type SavedRecipe,
} from "@/lib/dots-data";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Local-first demo — DOTS" },
      {
        name: "description",
        content:
          "Three cases that show how DOTS handles the same question depending on packs and local memory.",
      },
    ],
  }),
  component: DemoFlow,
});

type CaseId = "pack" | "nopack" | "memory";

const CASES: {
  id: CaseId;
  label: string;
  kicker: string;
  setup: string;
}[] = [
  {
    id: "pack",
    label: "Cooking pack installed",
    kicker: "Case 01",
    setup: "The pack fits the question, so the answer comes back ready to use.",
  },
  {
    id: "nopack",
    label: "No cooking pack",
    kicker: "Case 02",
    setup: "Nothing personal to lean on — DOTS keeps it general.",
  },
  {
    id: "memory",
    label: "Recipe you mentioned before",
    kicker: "Case 03",
    setup: "DOTS remembers it, so it just brings it back.",
  },
];

const QUESTION: Record<CaseId, string> = {
  pack: "How do I make kimchi stew?",
  nopack: "How do I make kimchi stew?",
  memory: "Pull up that kimchi stew recipe I mentioned.",
};

type Step =
  | { kind: "user"; text: string }
  | { kind: "status"; tone: "local" | "memory" | "deep"; text: string }
  | { kind: "context"; text: string }
  | { kind: "memory-results"; items: SavedRecipe[] }
  | { kind: "answer-prose"; text: string }
  | { kind: "answer-recipe" }
  | { kind: "answer-memory"; item: SavedRecipe }
  | { kind: "footer"; text: string };

const SCRIPTS: Record<CaseId, { delay: number; step: Step }[]> = {
  pack: [
    { delay: 0, step: { kind: "user", text: QUESTION.pack } },
    {
      delay: 350,
      step: {
        kind: "status",
        tone: "local",
        text: "One sec.",
      },
    },
    { delay: 900, step: { kind: "answer-recipe" } },
    {
      delay: 1100,
      step: {
        kind: "footer",
        text: "Set up the way you usually like it.",
      },
    },
  ],
  nopack: [
    { delay: 0, step: { kind: "user", text: QUESTION.nopack } },
    {
      delay: 400,
      step: {
        kind: "status",
        tone: "deep",
        text: "Give me a moment with this one.",
      },
    },
    {
      delay: 1300,
      step: {
        kind: "context",
        text: "I don't have anything personal on this yet — keeping it general.",
      },
    },
    {
      delay: 2400,
      step: {
        kind: "answer-prose",
        text: "Kimchi stew is a Korean dish. You'd typically use aged kimchi, pork or tuna, tofu, onion, and stock. Sear the protein, add kimchi, pour in stock, simmer for around twenty minutes, then add tofu near the end. Adjust spice and salt to taste.",
      },
    },
    {
      delay: 2600,
      step: {
        kind: "footer",
        text: "Want this laid out as a recipe? Add the cooking pack.",
      },
    },
  ],
  memory: [
    { delay: 0, step: { kind: "user", text: QUESTION.memory } },
    {
      delay: 350,
      step: {
        kind: "status",
        tone: "memory",
        text: "Hold on, I remember this.",
      },
    },
    {
      delay: 1000,
      step: {
        kind: "status",
        tone: "memory",
        text: "There are two you've mentioned. Which one?",
      },
    },
    { delay: 1300, step: { kind: "memory-results", items: SAVED_RECIPES } },
    {
      delay: 1500,
      step: {
        kind: "footer",
        text: "Pulled straight from what you've saved.",
      },
    },
  ],
};

function DemoFlow() {
  const [activeCase, setActiveCase] = useState<CaseId>("pack");
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState<SavedRecipe | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function play(id: CaseId) {
    clearTimers();
    setSelectedSaved(null);
    setSteps([]);
    setRunning(true);
    SCRIPTS[id].forEach(({ delay, step }) => {
      const t = setTimeout(() => {
        setSteps((prev) => [...prev, step]);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        });
      }, delay);
      timers.current.push(t);
    });
    const last = SCRIPTS[id][SCRIPTS[id].length - 1].delay;
    timers.current.push(setTimeout(() => setRunning(false), last + 300));
  }

  // Auto-play whenever the case changes
  useEffect(() => {
    play(activeCase);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase]);

  const cookingPack = PACKS.find((p) => p.id === "cooking-essentials")!;

  return (
    <Shell>
      <div className="flex flex-col">
        {/* Header */}
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <h1 className="text-[32px] font-semibold tracking-tight text-ink">
            One question, three ways.
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            Same wording each time. What changes is what DOTS already knows
            about you. Pick a case to watch.
          </p>
        </header>

        {/* Case picker */}
        <div className="px-8 md:px-12 pt-6">
          <div className="grid sm:grid-cols-3 gap-2">
            {CASES.map((c) => {
              const active = c.id === activeCase;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCase(c.id)}
                  className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                    active
                      ? "border-strong bg-card"
                      : "border-border bg-surface hover:border-strong"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                        active ? "text-primary" : "text-ink-soft"
                      }`}
                    >
                      {c.kicker}
                    </span>
                    {active && (
                      <span className="h-1 w-1 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-1 text-[13.5px] font-medium text-ink">
                    {c.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-soft leading-snug">
                    {c.setup}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stage */}
        <div className="px-8 md:px-12 py-8 grid lg:grid-cols-[1fr_280px] gap-6 max-w-6xl">
          {/* Conversation */}
          <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-[480px]">
            <div className="px-5 py-3 border-b border-border flex items-center justify-end">
              <button
                onClick={() => play(activeCase)}
                disabled={running}
                className="text-[11.5px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
              >
                ↻ replay
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
            >
              {steps.map((s, i) => (
                <StepView
                  key={i}
                  step={s}
                  onPickSaved={(r) => setSelectedSaved(r)}
                  selectedSaved={selectedSaved}
                />
              ))}
              {selectedSaved && (
                <div className="fade-in pt-2">
                  <p className="text-[12px] text-ink-soft mb-2">
                    {selectedSaved.title}
                  </p>
                  <RecipeCard recipe={KIMCHI_STEW} />
                  <p className="mt-2 text-[11.5px] text-ink-soft">
                    {selectedSaved.note}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right rail — context for the active case */}
          <aside className="space-y-3">
            <SidePanel
              title="Personal layer"
              items={[
                {
                  label: "Cooking Essentials",
                  value:
                    activeCase === "nopack" ? "not installed" : "installed",
                  on: activeCase !== "nopack",
                },
                {
                  label: "Saved recipes",
                  value:
                    activeCase === "memory"
                      ? `${SAVED_RECIPES.length} matched`
                      : `${SAVED_RECIPES.length} stored`,
                  on: activeCase === "memory",
                },
                {
                  label: "Memory access",
                  value: "on-device",
                  on: true,
                },
              ]}
            />
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-[12.5px] text-ink leading-relaxed">
                {activeCase === "pack" &&
                  `${cookingPack.name} fits the question, so the answer comes back ready to use.`}
                {activeCase === "nopack" &&
                  "Nothing personal to lean on yet. DOTS keeps the answer general instead of guessing."}
                {activeCase === "memory" &&
                  "It already lives in your saved things, so DOTS just brings it back."}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function StepView({
  step,
  onPickSaved,
  selectedSaved,
}: {
  step: Step;
  onPickSaved: (r: SavedRecipe) => void;
  selectedSaved: SavedRecipe | null;
}) {
  if (step.kind === "user") {
    return (
      <div className="flex justify-end fade-in">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px] leading-relaxed">
          {step.text}
        </div>
      </div>
    );
  }

  if (step.kind === "status") {
    const dotClass =
      step.tone === "local"
        ? "dot-local"
        : step.tone === "memory"
        ? "dot-local"
        : "dot-deep";
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft fade-in">
        <span className={dotClass} />
        <span className="leading-snug">{step.text}</span>
      </div>
    );
  }

  if (step.kind === "context") {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-3 fade-in">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1">
          While you wait
        </p>
        <p className="text-[12.5px] text-ink leading-relaxed">{step.text}</p>
      </div>
    );
  }

  if (step.kind === "memory-results") {
    return (
      <div className="space-y-2 fade-in">
        {step.items.map((r) => {
          const active = selectedSaved?.id === r.id;
          return (
            <button
              key={r.id}
              onClick={() => onPickSaved(r)}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                active
                  ? "border-strong bg-surface"
                  : "border-border bg-card hover:border-strong"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-medium text-ink">
                  {r.title}
                </p>
                <span className="font-mono text-[10px] text-ink-soft shrink-0">
                  {r.mentioned}
                </span>
              </div>
              <p className="text-[12px] text-ink-soft mt-0.5 leading-snug">
                {r.note}
              </p>
            </button>
          );
        })}
        {!selectedSaved && (
          <p className="text-[11.5px] text-ink-soft pl-1">
            Tap one to open. DOTS won't run inference unless you ask for
            something it doesn't already have.
          </p>
        )}
      </div>
    );
  }

  if (step.kind === "answer-prose") {
    return (
      <div className="rounded-xl border border-border bg-card p-4 fade-in">
        <p className="text-[14px] leading-[1.65] text-ink">{step.text}</p>
      </div>
    );
  }

  if (step.kind === "answer-recipe") {
    return (
      <div className="fade-in">
        <RecipeCard recipe={KIMCHI_STEW} />
      </div>
    );
  }

  if (step.kind === "footer") {
    return (
      <div className="flex items-center gap-2 pt-1 fade-in">
        <span className="h-1 w-1 rounded-full bg-ink-soft" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {step.text}
        </span>
      </div>
    );
  }

  return null;
}

function SidePanel({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string; on: boolean }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {title}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li
            key={it.label}
            className="px-4 py-2.5 flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  it.on ? "bg-primary" : "bg-border-strong"
                }`}
              />
              <span className="text-[12.5px] text-ink">{it.label}</span>
            </span>
            <span className="font-mono text-[10.5px] text-ink-soft">
              {it.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

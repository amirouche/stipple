import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { RecipeCard, KIMCHI_STEW } from "@/components/RecipeCard";

export const Route = createFileRoute("/cooking")({
  head: () => ({
    meta: [
      { title: "Cooking pack — DOTS" },
      {
        name: "description",
        content:
          "See the same question answered two ways: a generic AI reply, and a structured DOTS Cooking pack response.",
      },
    ],
  }),
  component: CookingDemo,
});

const QUESTION = "How do I make kimchi stew?";

function CookingDemo() {
  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            Demo · Cooking pack
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">
            One question. Two shapes.
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft max-w-2xl">
            Same base model, same prompt. On the left, a generic AI reply. On
            the right, the answer reshaped by the Cooking pack into something
            you can actually cook from.
          </p>
        </header>

        <div className="px-8 md:px-12 py-10">
          {/* The question — shown once, above both answers */}
          <div className="mb-8 flex justify-center">
            <div className="max-w-md w-full px-4 py-2.5 rounded-2xl bg-ink text-background text-[14px] text-center">
              {QUESTION}
            </div>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Without pack */}
            <Column
              tone="muted"
              kicker="Without DOTS"
              title="Generic AI answer"
              note="A paragraph. Reads fine. Hard to actually cook from."
            >
              <div className="rounded-xl border border-border bg-card p-5 min-h-[420px]">
                <p className="text-[14.5px] leading-[1.7] text-ink">
                  Kimchi stew is a popular Korean dish. To make it, you generally
                  need aged kimchi, some pork or tuna, tofu, onion, and a flavorful
                  stock. The basic process involves searing the protein, adding
                  kimchi to soften, pouring in stock, simmering for around twenty
                  minutes, and then adding tofu near the end. You can adjust
                  spice and salt to taste, and finish with sesame oil if you like.
                </p>
                <p className="mt-4 text-[13px] text-ink-soft">
                  There are many variations depending on the region and family
                  preference, so feel free to experiment.
                </p>
              </div>
              <DiffList
                tone="muted"
                items={[
                  "No exact amounts",
                  "No timing per step",
                  "No reuse — it's just text",
                  "Doesn't know your kitchen",
                ]}
              />
            </Column>

            {/* With pack */}
            <Column
              tone="primary"
              kicker="With Cooking pack"
              title="Structured execution unit"
              note="Same model. Reshaped into something you can run."
            >
              <div className="min-h-[420px]">
                <RecipeCard recipe={KIMCHI_STEW} />
              </div>
              <DiffList
                tone="primary"
                items={[
                  "Exact ingredients & amounts",
                  "Per-step timing",
                  "Reusable — saves to your packs",
                  "Adapts to your spice tolerance",
                ]}
              />
            </Column>
          </div>

          {/* Closing note */}
          <p className="mt-10 text-center text-[12.5px] text-ink-soft max-w-xl mx-auto">
            The pack doesn't replace the model. It tells DOTS what shape this
            kind of answer should take — and remembers it for next time.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Column({
  tone,
  kicker,
  title,
  note,
  children,
}: {
  tone: "muted" | "primary";
  kicker: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tone === "primary" ? "bg-primary" : "bg-ink-soft/60"
          }`}
        />
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
            tone === "primary" ? "text-primary" : "text-ink-soft"
          }`}
        >
          {kicker}
        </span>
      </div>
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="text-[12.5px] text-ink-soft mt-0.5">{note}</p>
      </div>
      {children}
    </section>
  );
}

function DiffList({
  tone,
  items,
}: {
  tone: "muted" | "primary";
  items: string[];
}) {
  return (
    <ul className="space-y-1.5 pt-1">
      {items.map((it) => (
        <li
          key={it}
          className="flex items-start gap-2.5 text-[12.5px] text-ink-soft"
        >
          <span
            className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${
              tone === "primary" ? "bg-primary" : "bg-border-strong"
            }`}
          />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

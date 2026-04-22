import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { RecipeCard, KIMCHI_STEW } from "@/components/RecipeCard";

export const Route = createFileRoute("/cooking")({
  head: () => ({
    meta: [
      { title: "Cooking pack — DOTS" },
      {
        name: "description",
        content:
          "Compare a generic AI answer with a DOTS Cooking pack response. The same question, two different shapes.",
      },
    ],
  }),
  component: CookingDemo,
});

function CookingDemo() {
  const [withPack, setWithPack] = useState(true);
  const question = "How do I make kimchi stew?";

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
            Toggle the Cooking pack on and off. The base model is identical —
            DOTS only changes how the answer is structured and remembered.
          </p>

          <div className="mt-6 inline-flex rounded-md border border-border bg-card p-1">
            <button
              onClick={() => setWithPack(false)}
              className={`px-4 py-1.5 rounded text-[12.5px] transition-colors ${
                !withPack
                  ? "bg-ink text-background"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              Without pack
            </button>
            <button
              onClick={() => setWithPack(true)}
              className={`px-4 py-1.5 rounded text-[12.5px] transition-colors ${
                withPack
                  ? "bg-ink text-background"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              With Cooking pack
            </button>
          </div>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-4xl w-full">
          {/* User question */}
          <div className="flex justify-end mb-6">
            <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-background text-[14px]">
              {question}
            </div>
          </div>

          {/* Answer */}
          <div className="space-y-3 fade-in" key={String(withPack)}>
            <div className="flex items-center gap-2">
              <span
                className={`h-1 w-1 rounded-full ${
                  withPack ? "bg-primary" : "bg-ink-soft"
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {withPack
                  ? "Cooking Essentials · execution unit returned"
                  : "Base model · prose response"}
              </span>
            </div>

            {withPack ? (
              <RecipeCard recipe={KIMCHI_STEW} />
            ) : (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-[14.5px] leading-[1.7] text-ink">
                  Kimchi stew is a popular Korean dish. To make it, you generally
                  need aged kimchi, some pork or tuna, tofu, onion, and a flavorful
                  stock. The basic process involves searing the protein, adding
                  kimchi to soften, pouring in stock, simmering for around twenty
                  minutes, and then adding tofu near the end. You can adjust spice
                  and salt to taste, and finish with sesame oil if you like.
                </p>
                <p className="mt-4 text-[13px] text-ink-soft">
                  There are many variations depending on the region and family
                  preference, so feel free to experiment.
                </p>
              </div>
            )}

            <div className="mt-6 grid md:grid-cols-3 gap-3">
              <Stat label="Reusability" value={withPack ? "High" : "—"} />
              <Stat
                label="Local handling"
                value={withPack ? "Yes" : "No"}
              />
              <Stat
                label="Adapts to your kitchen"
                value={withPack ? "Yes" : "No"}
              />
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-semibold tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}

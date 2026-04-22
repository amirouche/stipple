type Step = { t: string; minutes?: number };

export type Recipe = {
  title: string;
  serves: string;
  total: string;
  ingredients: { item: string; amount: string }[];
  steps: Step[];
  tips: string[];
};

export const KIMCHI_STEW: Recipe = {
  title: "Kimchi Stew",
  serves: "Serves 2",
  total: "≈ 35 min",
  ingredients: [
    { item: "Aged kimchi", amount: "1½ cups, roughly chopped" },
    { item: "Pork belly", amount: "150 g, sliced" },
    { item: "Firm tofu", amount: "½ block, cubed" },
    { item: "Onion", amount: "½, sliced" },
    { item: "Spring onion", amount: "2 stalks" },
    { item: "Gochugaru", amount: "1 tsp (optional, for color)" },
    { item: "Anchovy stock", amount: "2½ cups" },
    { item: "Sesame oil", amount: "1 tsp, to finish" },
  ],
  steps: [
    { t: "Sear pork belly in a dry pot until edges crisp.", minutes: 4 },
    { t: "Add kimchi and onion. Stir-fry until kimchi softens and the pot smells sweet.", minutes: 6 },
    { t: "Pour in stock. Bring to a steady simmer.", minutes: 2 },
    { t: "Lower heat. Cover and let it deepen.", minutes: 15 },
    { t: "Add tofu. Simmer gently — do not stir hard.", minutes: 5 },
    { t: "Finish with sesame oil and spring onion off the heat.", minutes: 1 },
  ],
  tips: [
    "Use kimchi that's at least 3 weeks old — young kimchi tastes flat in stew.",
    "If it's too sharp, a pinch of sugar rounds it out faster than more stock.",
    "Leftovers improve overnight. Reheat slowly.",
  ],
};

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-ink">
            {recipe.title}
          </h3>
          <p className="text-[12px] text-ink-soft mt-0.5">
            {recipe.serves} · {recipe.total}
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          execution unit
        </span>
      </div>

      <div className="grid md:grid-cols-[200px_1fr] gap-x-8 gap-y-6 px-5 py-5">
        <section>
          <h4 className="text-[11px] uppercase tracking-[0.14em] text-ink-soft mb-3">
            Ingredients
          </h4>
          <ul className="space-y-2">
            {recipe.ingredients.map((i) => (
              <li key={i.item} className="text-[13px] leading-snug">
                <div className="text-ink">{i.item}</div>
                <div className="text-ink-soft text-[12px]">{i.amount}</div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-[11px] uppercase tracking-[0.14em] text-ink-soft mb-3">
            Steps
          </h4>
          <ol className="space-y-3">
            {recipe.steps.map((s, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="font-mono text-[11px] text-ink-soft pt-[3px] w-5 shrink-0">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="text-[13.5px] text-ink leading-relaxed">{s.t}</p>
                  {s.minutes && (
                    <p className="font-mono text-[10.5px] text-ink-soft mt-0.5">
                      {s.minutes} min
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 pt-5 border-t border-border">
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-ink-soft mb-2">
              Tips
            </h4>
            <ul className="space-y-1.5">
              {recipe.tips.map((t) => (
                <li
                  key={t}
                  className="text-[12.5px] text-ink-soft leading-relaxed pl-3 border-l border-border"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

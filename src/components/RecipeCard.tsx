import type { PackRecipe } from "@/lib/dots-data";

export type Recipe = PackRecipe;

// Kept as a default export for any legacy imports.
export const KIMCHI_STEW: Recipe = {
  id: "baek-kimchi-jjigae",
  title: "백종원식 김치찌개",
  serves: "2인분",
  total: "약 30분",
  ingredients: [
    { item: "묵은지", amount: "1/4포기" },
    { item: "돼지고기 앞다리살", amount: "200g" },
    { item: "두부", amount: "1/2모" },
    { item: "대파", amount: "1대" },
  ],
  steps: [
    { t: "고기를 먼저 볶는다.", minutes: 4 },
    { t: "김치를 넣고 같이 볶는다.", minutes: 5 },
    { t: "물을 붓고 끓인다.", minutes: 15 },
    { t: "두부와 대파를 올려 마무리.", minutes: 5 },
  ],
  tip: "설탕 한 꼬집이 신맛을 잡아줘.",
};

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-2xl">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">
          {recipe.title}
        </h3>
        <p className="text-[12px] text-ink-soft mt-0.5">
          {recipe.serves} · {recipe.total}
        </p>
      </div>

      <div className="grid md:grid-cols-[180px_1fr] gap-x-8 gap-y-6 px-5 py-5">
        <section>
          <h4 className="text-[10.5px] uppercase tracking-[0.14em] text-ink-soft mb-3">
            재료
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
          <h4 className="text-[10.5px] uppercase tracking-[0.14em] text-ink-soft mb-3">
            순서
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
                      {s.minutes}분
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 pt-5 border-t border-border">
            <h4 className="text-[10.5px] uppercase tracking-[0.14em] text-ink-soft mb-2">
              팁
            </h4>
            <p className="text-[12.5px] text-ink-soft leading-relaxed pl-3 border-l border-border">
              {recipe.tip}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

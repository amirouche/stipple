// Phase M0-4: dislike memory filter.
//
// Tei 브라우저 검증 (2026-05-29):
//   "고기 싫어해" 박힌 사용자에게 "김치찌개 레시피" → 백종원식 (돼지고기) 노출.
//   Memory store 에 박힌 dislike 가 Pack 매칭 결과에 반영되지 X — 진짜 자산
//   답기로 X.
//
// 해결: matchPackContent 결과 (ContentMatch[]) 에 dislike subject 박힌 entry
// 측면 떨굼. send() 측면 filter 박혀 builder 전에 작동.
//
// 검사 텍스트 (2026-05-30 정정): **ingredients item 측면만** 검사. 이전 (title +
// ingredients + how_to + definition) 측면 합본 측면 박음 → 회귀:
//   tuna.definition = "...돼지고기 대신 참치캔..." → "고기" substring → 오제거.
// Tei 본질: 음식 측면 재료 측면 근본. how_to/definition 측면 "고기" 언급 ≠ 재료
// 측면 고기 박혔다 → ingredients item 측면만 검사 박혀야 정확.
//
// 매칭 정책: substring match (dislike.subject 가 ingredient text 측면 박혀 박힌
// 자연 케이스 잡아야 — "고기" ⊂ "돼지고기 앞다리살").

import { COOKING_RECIPES, type Pack } from "@/lib/dots-data";
import type { ContentMatch } from "@/lib/packs/match";

import { listByType } from "./preferences-store";

export interface DislikeFilterResult {
  filtered: ContentMatch[];
  removed: ContentMatch[];
  dislikes: string[]; // 적용된 dislike subjects (모든 저장된 dislike, hit 여부 무관)
}

// 검사 텍스트 = ingredients item 측면만 (lowercase). how_to/definition 측면
// "X 대신 Y" / "X 들어가는" 같은 비-재료 언급 측면 false-positive 차단.
// sat-math 측면 dislike 영역 X → 빈 문자열 (caller 측면 자동 kept).
function matchIngredients(m: ContentMatch): string {
  if (m.kind === "cooking-recipe") {
    return m.recipe.ingredients
      .map((i) => i.item)
      .join(" ")
      .toLowerCase();
  }
  return "";
}

// M0-4 fix: matched 직후 filter 가 모두 떨굼 (filtered.length === 0) 일 때,
// 매처가 안 박은 다른 pack entry 도 후보로 박음 — fallback recommendation 의
// "비슷한 건" 응답이 dislike 무시한 채로 박히는 회귀 차단.
// SAT 측면 entry 는 dislike 영역 X — cooking-recipe 만 박음.
export function collectPackMatches(pack: Pack): ContentMatch[] {
  if (!pack.contents) return [];
  const out: ContentMatch[] = [];
  for (const ref of pack.contents) {
    if (ref.kind === "cooking-recipe") {
      const recipe = COOKING_RECIPES.find((r) => r.id === ref.recipeId);
      if (recipe) out.push({ kind: "cooking-recipe", recipe, score: 100 });
    }
  }
  return out;
}

export function filterMatchesByDislikes(matches: ContentMatch[]): DislikeFilterResult {
  const dislikes = listByType("dislike")
    .map((d) => d.subject.trim())
    .filter(Boolean);
  if (dislikes.length === 0) {
    return { filtered: matches, removed: [], dislikes: [] };
  }
  const dislikesLower = dislikes.map((d) => d.toLowerCase());
  const filtered: ContentMatch[] = [];
  const removed: ContentMatch[] = [];
  for (const m of matches) {
    const text = matchIngredients(m);
    // text 빈 (sat-math 또는 cooking 측면 ingredients X) → 자동 kept.
    const hasDislike = text.length > 0 && dislikesLower.some((d) => text.includes(d));
    if (hasDislike) removed.push(m);
    else filtered.push(m);
  }
  return { filtered, removed, dislikes };
}

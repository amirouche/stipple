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
  dislikes: string[]; // 저장된 dislike subjects 전체 (hit 여부 무관, 기존 호환)
  // Phase EN-fix A: 실제 매칭 hit 한 원본 subject 만 — 누적 garbage 차단.
  // 응답 텍스트 ("X 싫어한다고 했어서...") 에 이쪽을 사용 — dislikes 전체
  // 박히던 회귀 차단 + 영어/한국어 응답 깔끔.
  appliedDislikes: string[];
}

// Phase EN-fix B: 영어↔한국어 식문화 vocab. 한 row = 동의어 그룹. 사용자
// dislike subject 가 row 내 어느 토큰과 substring 매칭이면 그룹 전체를
// 매칭용으로 확장. 표시는 원본 subject 만 사용 (영어 응답엔 "meat", 한국어
// 응답엔 "고기" — 사용자 입력 언어 보존).
//
// Seed 보수적 — meat / fish 두 row 만. 짧은 영어 (egg/ham 등) 는 비음식
// 단어 substring 충돌 (eggplant/hamburger) 위험으로 제외. 모든 영어 토큰
// 4+ 자, 한국어 토큰은 식문화 specific. 새 row 추가는 한 줄 — 안전한 토큰
// 기준으로 확장.
const FOOD_VOCAB: ReadonlyArray<ReadonlyArray<string>> = [
  ["meat", "beef", "pork", "chicken", "고기", "돼지고기", "소고기", "닭고기"],
  ["fish", "tuna", "salmon", "생선", "참치", "연어"],
];

function expandDislike(subject: string): string[] {
  const lower = subject.toLowerCase().trim();
  const tokens = new Set<string>([lower]); // 원본 always 포함
  for (const group of FOOD_VOCAB) {
    const hit = group.some((t) => {
      const tl = t.toLowerCase();
      return lower.includes(tl) || tl.includes(lower);
    });
    if (hit) {
      for (const t of group) tokens.add(t.toLowerCase());
    }
  }
  return Array.from(tokens);
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
  // listByType("dislike") 만 봄 — like 와 분리 (preferences-store 측면 type
  // 필드 박혀 갈림). "I like spicy" 류 입력은 like store 측면 박혀 본 매처
  // 측면 안 들어옴.
  const dislikes = listByType("dislike")
    .map((d) => d.subject.trim())
    .filter(Boolean);
  if (dislikes.length === 0) {
    return { filtered: matches, removed: [], dislikes: [], appliedDislikes: [] };
  }
  // Phase EN-fix B: 사용자 입력 subject + 매칭용 확장 토큰 페어. 영어 "meat"
  // → tokens 측면 "meat,beef,pork,chicken,고기,돼지고기,..." 박혀 한국어
  // ingredient "돼지고기" 매칭. 표시 측면 subject 만 박혀 사용자가 본 입력
  // 그대로 (영어 → "meat", 한국어 → "고기").
  const expansions = dislikes.map((d) => ({ subject: d, tokens: expandDislike(d) }));
  const filtered: ContentMatch[] = [];
  const removed: ContentMatch[] = [];
  // Phase EN-fix A: 실제 hit 한 원본 subject 만 set 측면 박음 — 응답 라벨에
  // 누적 garbage (모든 저장된 dislike) 박히던 회귀 차단.
  const appliedSet = new Set<string>();
  for (const m of matches) {
    const text = matchIngredients(m);
    if (text.length === 0) {
      filtered.push(m);
      continue;
    }
    let hit = false;
    for (const { subject, tokens } of expansions) {
      if (tokens.some((t) => text.includes(t))) {
        hit = true;
        appliedSet.add(subject); // 원본 사용자 입력 — 확장 토큰 안 박음
      }
    }
    if (hit) removed.push(m);
    else filtered.push(m);
  }
  return {
    filtered,
    removed,
    dislikes,
    appliedDislikes: Array.from(appliedSet),
  };
}

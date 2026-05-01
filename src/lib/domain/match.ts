// V5.0 lite Phase I-4 — 도메인 매칭 layer.
//
// 입력 발화를 토큰화 → dictionary.json 의 도메인별 단어 리스트와 매칭 →
// 도메인 점수 산출. 라우팅 (routes/index.tsx) 이 결과를 받아 매처 본체 호출
// 여부 결정.
//
// 매칭 알고리즘 (word-level MVP):
//   - 입력을 공백·쉼표·구두점 기준 split (간단). 한글 조사 제거는 매처 본체의
//     extractNouns 가 하지만 도메인 매칭은 토큰 substring 매칭이라 조사 영향
//     적음.
//   - 각 도메인 단어 리스트에 대해, 단어가 입력 어딘가에 substring 으로 박혀
//     있으면 hit. 한 도메인에서 여러 단어 hit이면 hit 목록에 모두 추가.
//   - score = hits.length (단어 수, 의미 가중치 X).
//
// I-4b (브라우저 세션) 임베딩 hook:
//   매칭 layer 시그니처는 그대로 유지. 내부에서 word-level hit count 외에
//   임베딩 cos 유사도 임계점 (예: 0.6) 도 hit count에 합산. dictionary.json
//   의 단어 임베딩은 빌드 시점 EmbeddingGemma 로 사전 계산해 별도 파일로
//   ship (수십 KB) 또는 첫 사용 시 lazy 계산 + IDB 캐시.
//
// CONSTITUTION:
//   - 매처 본체 (matchPackContent) 변경 X. 도메인 layer는 매처 *전* 게이트.
//   - 도메인 score 0이면 라우팅 결정 미박힘 → 기존 흐름 (intent classify →
//     pack match) 그대로.

import dictRaw from "./dictionary.json" with { type: "json" };
import type { DomainDict, DomainMatch, DomainScore } from "./types";

// dictionary.json 의 _meta 키 제외하고 도메인 → 단어 리스트만 추출.
const DICT: DomainDict = (() => {
  const out: DomainDict = {};
  const obj = dictRaw as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_meta") continue;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v as string[];
    }
  }
  return out;
})();

// dictionary.json 의 모든 도메인 키.
export function listDomains(): string[] {
  return Object.keys(DICT);
}

// dictionary.json 본체 export (테스트·디버그용).
export function getDict(): DomainDict {
  return DICT;
}

// 입력 정규화 + 간단 토큰화. 한글 조사·어미는 substring 매칭으로 흡수되므로
// 조사 제거 안 함 (예: "짜장면이" 안에서 dictionary 단어 "짜장면" hit).
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,.!?·、，。！？]+/u)
    .filter((t) => t.length > 0);
}

// 한 도메인에 대해 사전의 단어가 입력 어딘가에 substring 으로 박혀 있으면
// hit 추가. 한 단어가 여러 토큰에 걸쳐 박혀도 substring 검사라 정상 hit.
function scoreDomain(input: string, domain: string, words: string[]): DomainScore {
  const lower = input.toLowerCase();
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const lw = w.toLowerCase();
    if (seen.has(lw)) continue;
    if (lower.includes(lw)) {
      hits.push(w);
      seen.add(lw);
    }
  }
  return { domain, hits, score: hits.length };
}

// 메인 엔트리. routes/index.tsx send() 에서 matchPackContent 호출 전에 부른다.
//
// 반환값:
//   - tokens: 디버그 (extractNouns 와 분리된 단순 split)
//   - scores: score > 0 인 도메인만, descending. ties는 alphabetical 안정.
//   - top: scores[0] (없으면 undefined)
//
// V5.0 lite Phase I-4b (임베딩) 진입 시 본 함수 시그니처 유지 — score 계산
// 내부만 word-level + semantic hybrid 로 확장.
export function matchDomain(input: string): DomainMatch {
  const tokens = tokenize(input);
  const all: DomainScore[] = [];
  for (const [domain, words] of Object.entries(DICT)) {
    const s = scoreDomain(input, domain, words);
    if (s.score > 0) all.push(s);
  }
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.domain.localeCompare(b.domain);
  });
  return { tokens, scores: all, top: all[0] };
}

// V5.0 lite Phase I-4: 라우팅 결정 helper. Pack 의 domain / excluded_domains
// 와 매칭 결과를 비교해 "이 pack 으로 진입할지 / cloud 직행할지" 결정.
//
//   - excluded_domains 에 해당하는 도메인이 score 0 보다 크면 → cloud 직행.
//     (Tei 박은 "짜장면 ... 맛집 ... 배달" 누수 차단의 핵심.)
//   - domain 에 해당하는 도메인이 score 0 보다 크면 → pack 매칭 진행.
//   - 둘 다 0 / 둘 다 hit 이면 → 매처 본체에 위임 (기존 흐름 유지).
//
// 한 입력이 cooking domain hit + cooking excluded hit 동시일 때 → excluded
// 우선 (cloud). "음식 짜장면 + 맛집 + 배달" 같이 cooking score 1, excluded
// score 2 케이스 — Tei 누수 해결.
export type RoutingDecision =
  | { kind: "skip"; reason: string; matchedExcluded: string[] }
  | { kind: "match"; matchedDomain: string[] }
  | { kind: "neutral" };

export function decideRouting(
  match: DomainMatch,
  pack: { domain?: string[]; excluded_domains?: string[] },
): RoutingDecision {
  const excludedSet = new Set(pack.excluded_domains ?? []);
  const domainSet = new Set(pack.domain ?? []);
  const matchedExcluded = match.scores.filter((s) => excludedSet.has(s.domain));
  const matchedDomain = match.scores.filter((s) => domainSet.has(s.domain));

  // excluded hit 이 강하면 (또는 domain hit 보다 score 합 ≥) cloud 직행.
  // Tei 케이스: cooking pack 입력에 "맛집 + 배달" hit, "짜장면" cooking
  // domain hit. excluded score (2+) > domain score (1) → cloud.
  const exSum = matchedExcluded.reduce((s, x) => s + x.score, 0);
  const domSum = matchedDomain.reduce((s, x) => s + x.score, 0);
  if (matchedExcluded.length > 0 && exSum >= domSum) {
    return {
      kind: "skip",
      reason: `domain-excluded (${matchedExcluded.map((x) => x.domain).join(", ")})`,
      matchedExcluded: matchedExcluded.map((x) => x.domain),
    };
  }
  if (matchedDomain.length > 0) {
    return {
      kind: "match",
      matchedDomain: matchedDomain.map((x) => x.domain),
    };
  }
  return { kind: "neutral" };
}

// V5.0 Phase I-4: top-level domain exclusion. installed pack 전체를 보고
// excludedIds 결정.
//
//   1. 각 pack 별 decideRouting "skip" → excluded.
//   2. top 도메인이 어느 pack 의 positive domain 에 박혔으면 그 pack 외 모두
//      excluded — "Cooking Essentials에 운동 루틴" 케이스에서 cooking 의
//      fuzzy "cook" trigger 가 매칭 부르는 누수 차단. top 도메인 (루틴) 은
//      routine pack 소유라 cooking 은 매칭 후보 외.
//
// 매처 본체 (matchPackContent body) 흐름은 그대로 — 입력 installed 리스트만
// 좁힌다. top 도메인이 어느 pack 의 domain 에도 없으면 (예: "맛집" 은 어느
// pack 의 positive 도 아님) 2번 룰 미적용.
export function computeDomainExclusions(
  match: DomainMatch,
  installed: { id: string; domain?: string[]; excluded_domains?: string[] }[],
): string[] {
  const excluded = new Set<string>();
  for (const p of installed) {
    if (decideRouting(match, p).kind === "skip") excluded.add(p.id);
  }
  if (match.top) {
    const owners = installed.filter((p) => p.domain?.includes(match.top!.domain));
    if (owners.length > 0) {
      const ownerIds = new Set(owners.map((p) => p.id));
      for (const p of installed) {
        if (!ownerIds.has(p.id)) excluded.add(p.id);
      }
    }
  }
  return Array.from(excluded);
}

// 한국어 명사구 추출 — V5.0 lite Phase B1의 partial entry name match 용.
//
// 단순 구현 (정교한 형태소 분석 X):
//   1. 공백 split
//   2. 끝의 조사 제거 (는, 은, 이, 가, …)
//   3. 끝의 어미 제거 (다, 어, 야, 까, …)
//   4. 1자 토큰 제외 (V3.5 1-char 누수 방지 정책 일관)
//
// V5.0 Phase B1은 entry name 부분 매칭 (text의 명사 ↔ entry.title)에 이걸
// 그대로 사용. 정교한 한국어 처리는 Phase B3+에서.

const PARTICLES = [
  "에서",
  "까지",
  "부터",
  "보다",
  "처럼",
  "이나",
  "하고",
  "는",
  "은",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "도",
  "만",
  "랑",
  "와",
  "과",
];

const ENDINGS = [
  "까요",
  "네요",
  "지요",
  "다",
  "어",
  "야",
  "까",
  "네",
  "지",
  "고",
  "면",
  "지만",
  "어서",
  "아서",
  "ㄴ가",
  "는가",
];

// V5.0 Phase 2: 수식어 stem 제거. Verbal participle 형식 ("만들다" 의 "만든",
// "하다" 의 "한") 이 nouns 목록에 박혀 partial 매칭 노이즈 박지 X. exact-alias
// 매칭은 isExactBoundary 가 처리하므로 영향 X — partial 분기에만 의미.
//
// 안전 박음: 진짜 noun 으로 의미 박힌 단어는 X (예: "오늘", "맛있", "이름").
// verbal participle stem 만 (일반 noun 으로 등장 X 한 단어).
const COMMON_MODIFIERS = ["만든", "한", "할", "시킨", "사온", "먹은", "끓인", "구운"];

export function extractNouns(text: string): string[] {
  const tokens = text.trim().split(/\s+/);
  const result: string[] = [];

  for (const tok of tokens) {
    let cleaned = tok;
    // 긴 조사 먼저 — 짧은 게 prefix-match로 잘못 잡히지 않게.
    const sortedParticles = [...PARTICLES].sort((a, b) => b.length - a.length);
    for (const p of sortedParticles) {
      if (cleaned.endsWith(p) && cleaned.length > p.length) {
        cleaned = cleaned.slice(0, -p.length);
        break;
      }
    }
    const sortedEndings = [...ENDINGS].sort((a, b) => b.length - a.length);
    for (const e of sortedEndings) {
      if (cleaned.endsWith(e) && cleaned.length > e.length) {
        cleaned = cleaned.slice(0, -e.length);
        break;
      }
    }
    if (cleaned.length >= 2 && !COMMON_MODIFIERS.includes(cleaned)) {
      result.push(cleaned);
    }
  }

  return result;
}

// Phase EN-3: 영어 명사 추출. 공백 split + stopword 필터로 단순화 — partial
// step 의 entry name 부분 매칭에 사용. 형태소 분석 없이도 데모 흐름 충분.
const STOPWORDS_EN = new Set([
  "a",
  "an",
  "the",
  "i",
  "is",
  "are",
  "am",
  "was",
  "were",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "you",
  "he",
  "she",
  "we",
  "they",
  "it",
  "this",
  "that",
  "these",
  "those",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "and",
  "or",
  "but",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "can",
  "could",
  "would",
  "should",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "not",
  "no",
  "so",
  "as",
  "if",
  "when",
  "what",
  "which",
  "who",
  "how",
  "why",
  "me",
  "us",
  "them",
  "him",
  "be",
  "been",
  "being",
]);

export function extractNounsEn(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ") // 구두점 제거 (apostrophe·하이픈은 토큰 일부로 살림)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS_EN.has(t));
}

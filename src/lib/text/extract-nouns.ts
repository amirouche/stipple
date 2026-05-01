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
    if (cleaned.length >= 2) {
      result.push(cleaned);
    }
  }

  return result;
}

// Phase M0: 선호 표현 (preference) 파서.
//
// Tei 브라우저 검증 발견 (2026-05-29):
//   "나는 매운 음식을 좋아해" → Cooking Essentials Pack 매칭 → "정확한 레시피
//   로는 없어. cloud로 찾아볼까?" 응답. 선호 표현인데 요청으로 인식.
//
// 해결: send() 진입 직후 parsePreference 로 "X 좋아해 / 싫어해" 류 발화를
// 잡아 Memory 에 저장 → Pack 매처 흐름 진입 X.
//
// null = 선호 표현 X (기존 흐름 그대로). PreferenceResult = 선호 인지 → store.

export interface PreferenceResult {
  type: "like" | "dislike";
  // 사용자가 좋아/싫어한다고 말한 대상. "매운 음식" / "고기" 등.
  // 앞에 "나는 " 같은 주어가 박혀 있으면 제거된 형태.
  subject: string;
}

// 주어 prefix (있으면 떼어냄). 한국어 1인칭 변형 위주.
const SUBJECT_PREFIXES = ["나는 ", "난 ", "저는 ", "전 ", "내가 ", "제가 "];

// dislike 패턴이 like 패턴보다 먼저 검사돼야 함 — "안 좋아해" 가 "좋아해" 정규식
// 에 먼저 잡히면 like 로 오분류. 순서 의존.
//
// subject 그룹은 가장 짧게 매칭 (lazy `+?`) — 끝의 조사/어미 (을/를/이/가/은/는)
// 를 흡수하지 않게. 후처리에서 조사 제거.
const DISLIKE_PATTERNS: RegExp[] = [
  /^(.+?)\s*(?:은|는|이|가|을|를)?\s*(?:안|별로)\s*좋아(?:해|함)$/,
  /^(.+?)\s*(?:은|는|이|가|을|를)?\s*별로(?:야|이야)?$/,
  /^(.+?)\s*(?:은|는|이|가|을|를)?\s*싫어(?:해|함)$/,
];

const LIKE_PATTERNS: RegExp[] = [/^(.+?)\s*(?:은|는|이|가|을|를)?\s*좋아(?:해|함)$/];

// 끝에 남은 한국어 조사 한 글자 떨굼. "매운 음식을" → "매운 음식".
function stripTrailingParticle(s: string): string {
  return s.replace(/\s*(?:은|는|이|가|을|를)$/, "").trim();
}

function stripSubjectPrefix(s: string): string {
  for (const p of SUBJECT_PREFIXES) {
    if (s.startsWith(p)) return s.slice(p.length);
  }
  return s;
}

export function parsePreference(input: string): PreferenceResult | null {
  const text = input.trim();
  if (!text) return null;
  // 빠른 path — "좋아"/"싫어"/"별로" 어느 키워드도 박혀 있지 않으면 즉시 통과.
  // 일반 발화 ("스트레스 받아", "오늘 뭐 먹지") 가 정규식 비용 안 치르도록.
  if (!/(좋아|싫어|별로)/.test(text)) return null;

  const body = stripSubjectPrefix(text);

  for (const re of DISLIKE_PATTERNS) {
    const m = re.exec(body);
    if (m) {
      const subject = stripTrailingParticle(m[1]);
      if (subject) return { type: "dislike", subject };
    }
  }
  for (const re of LIKE_PATTERNS) {
    const m = re.exec(body);
    if (m) {
      const subject = stripTrailingParticle(m[1]);
      if (subject) return { type: "like", subject };
    }
  }
  return null;
}

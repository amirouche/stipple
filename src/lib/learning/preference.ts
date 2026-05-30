// Phase M0: 선호 표현 (preference) 파서 + 회상 (recall) 파서.
//
// Tei 브라우저 검증 발견 (2026-05-29):
//   M0-1: "나는 매운 음식을 좋아해" → Cooking Essentials Pack 매칭 (잘못)
//   M0-3: "내가 뭘 좋아한다고 했지?" → Cloud (Gemini) 호출 (불필요 비용)
//
// 해결:
//   parsePreference — "X 좋아해 / 싫어해" 류 statement → store 에 저장.
//   parseRecall     — "내가 뭘 좋아해?" 류 question → store 에서 회상 응답.
// 둘 다 send() 진입 직후에 박혀 Pack/Store/Learned/Cloud 흐름 우회.
//
// 두 함수 다 null 반환 = 일반 입력 (기존 흐름 그대로).

export interface PreferenceResult {
  type: "like" | "dislike";
  // 사용자가 좋아/싫어한다고 말한 대상. "매운 음식" / "고기" 등.
  // 앞에 "나는 " 같은 주어가 박혀 있으면 제거된 형태.
  subject: string;
}

export interface RecallResult {
  // all = like + dislike 둘 다 회상. "선호" 키워드 또는 좋아·싫어 둘 다
  // 박힌 경우. like / dislike 는 한쪽만 회상.
  type: "like" | "dislike" | "all";
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
  // M0-3: 질문 (의문사 박힘) 은 statement 가 아니라 recall — parseRecall 이
  // 따로 처리. 가드 없으면 "내가 뭐 좋아해" 가 subject="뭐" 인 like 로 박혀
  // store 에 garbage 가 들어감. 의문사 좌측 모든 입력은 statement 후보 X.
  if (/(뭐|뭘)/.test(text)) return null;

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

// M0-3: 선호 회상 (recall) 파서.
//
// 인지 조건 (둘 다 박혀야 recall):
//   1) preference verb — 좋아 / 싫어 / 선호 중 하나
//   2) interrogative or recall verb — 뭐 / 뭘 / 알려줘
//
// type 결정:
//   - 선호 박힘 → all (사용자가 "선호 알려줘" 처럼 종합 회상 요청)
//   - 좋아 + 싫어 둘 다 박힘 → all
//   - 좋아만 → like
//   - 싫어만 → dislike
//
// "오늘 뭐 먹지" (preference verb X) / "매운 음식 좋아해" (interrogative X)
// 둘 다 통과 — recall 아님.
export function parseRecall(input: string): RecallResult | null {
  const text = input.trim();
  if (!text) return null;
  // 빠른 path — preference verb 미박힘 → 즉시 통과.
  if (!/(좋아|싫어|선호)/.test(text)) return null;
  // interrogative or "알려줘" 미박힘 → statement 후보 (parsePreference 영역).
  if (!/(뭐|뭘|알려\s*줘)/.test(text)) return null;

  const hasLike = /좋아/.test(text);
  const hasDislike = /싫어/.test(text);
  const hasPref = /선호/.test(text);

  if (hasPref) return { type: "all" };
  if (hasLike && hasDislike) return { type: "all" };
  if (hasLike) return { type: "like" };
  if (hasDislike) return { type: "dislike" };
  return null;
}

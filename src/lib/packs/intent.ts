// V3 라우터 — 의도 분류. send()가 입력을 받자마자 가장 먼저 호출.
//
// V2 한계 (commit 26f4916까지): 키워드 list 무한 확장으로 의도 추정.
// "찜부추국수는 뭐야?"에서 음식 키워드 hit으로 카드 띄우던 충돌은 결국
// 의도(definition)를 인지 못 해서 생긴 회귀. V3는 본질적으로 의도부터
// 분리한다.
//
// 흐름:
//   1. 같은 입력 cache hit → 즉시 반환 (in-memory, 세션 한정)
//   2. WebLLM ready → JSON 분류 호출 (목표 50-100ms, 실제 500ms~1s)
//   3. WebLLM 미사용/실패 → 규칙 fallback (정규식)
//
// fallback은 demo 시연 안전망. 모델 다운로드 안 된 시점 / classify 실패 /
// JSON 파싱 실패 모두 같은 자리에서 처리.

import { generateWithWebLLM, getWebLLMStatus } from "@/lib/webllm";

export type Intent =
  | "definition" // "X가 뭐야?", "X 설명해줘", "처음 들어"
  | "search" // "X 만드는 법", "X 레시피"
  | "recommend" // "추천", "뭐 먹지", "고민"
  | "follow-up" // "더 자세히", "그래서?", "또?"
  | "casual" // "안녕", "고마워"
  | "unknown"; // 위에 안 맞으면 (기존 라우팅으로 흘림)

export type IntentResult = {
  intent: Intent;
  confidence: number; // 0-1
  reason?: string; // 디버깅용
};

// Module-level 캐시. 세션 끝나면 사라진다 (V2 헌법: 학습 캐시는
// localStorage에 따로, 의도 분류는 in-memory만 — 사용자 정정 가능).
const cache = new Map<string, IntentResult>();
// 동시 분류 호출 합치기. 같은 입력이 짧은 간격으로 여러 번 들어오면
// 두 번째부터는 첫 번째 promise를 그대로 받는다 — WebLLM 호출 1회로 끝.
const inflight = new Map<string, Promise<IntentResult>>();

const VALID_INTENTS: ReadonlyArray<Intent> = [
  "definition",
  "search",
  "recommend",
  "follow-up",
  "casual",
  "unknown",
];

const SYSTEM_PROMPT = [
  "사용자 입력의 의도를 분류해. JSON으로만 답변, 다른 텍스트 X.",
  "",
  "의도:",
  "- definition: '뭐야', '설명해', '어떤 거', '처음 들어' 같은 정의 요청",
  "- search: '만들기', '레시피', '방법' 같은 검색 요청",
  "- recommend: '추천', '뭐 먹지', '고민' 같은 추천 요청",
  "- follow-up: '더 자세히', '그래서', '또?' 같은 follow-up",
  "- casual: '안녕', '고마워' 같은 일상 인사",
  "- unknown: 위에 안 맞으면",
  "",
  '형식: {"intent":"...","confidence":0.X,"reason":"간단 설명"}',
].join("\n");

// 규칙 fallback. WebLLM 미사용 시 또는 classify 실패 시 호출.
// 순서가 정확도를 결정한다:
//   1. casual (앵커드, 시작 부분만 매칭 — "안녕히 가세요"의 "안녕"도 OK)
//   2. definition (특정 WHAT-IS — "뭐야" 등. "뭐 먹"과 충돌 X: 스페이스 차이)
//   3. follow-up (앞 카드 받은 뒤 행동)
//   4. search (조리 / 레시피 / 방법)
//   5. recommend (가장 broad, 마지막)
// Phase EN-3: 영어 패턴은 한국어 패턴과 같은 우선순위 자리(casual→definition→
// follow-up→search→recommend)에 append. 정규식 의도적으로 분리 — 한국어 회귀 0.
// "I had a rough day" / "I'm so tired" 같은 일상 영어는 어느 패턴에도 매칭 X
// → unknown 으로 떨어져 일반 라우팅.
const PATTERNS: Array<{ intent: Intent; re: RegExp }> = [
  {
    intent: "casual",
    re: /^(안녕|하이|반가워|고마|감사|수고|잘 ?했|hello|hi|hey|good (?:morning|evening|afternoon)|thanks|thank you)/i,
  },
  {
    intent: "definition",
    re: /뭐(야|지|예요|에요|냐)|뭔(가|지|데)|설명|어떤 (거|것|음식|건)|처음 들어|모르(는데|겠어)|잘 모르|무엇|what['\s]+is|what's|what does|what are|explain|never heard|don't know/i,
  },
  {
    intent: "follow-up",
    re: /더 자세|더 알려|더 줘|또\?|또요|또 해|새 ?(문제|거)|다른 ?(거|음식)|다음 ?(거|문제)|받아 ?줘|부탁|\b(?:another|next|else|one more|something else)\b/i,
  },
  {
    intent: "search",
    re: /만들(기|어|까)?|레시피|조리법?|어떻게 (만|해)|방법|how (?:do i|to) (?:make|cook|do)|recipe for|how about/i,
  },
  {
    intent: "recommend",
    re: /추천|뭐 (먹|마|좋|할까)|고민|메뉴|뭘 (먹|할)|\b(?:recommend|suggest)\b|what should i (?:eat|try|do)|any (?:good|nice)\b/i,
  },
];

export function classifyIntentByRules(text: string): IntentResult {
  const q = text.toLowerCase().trim();
  if (!q) return { intent: "unknown", confidence: 0, reason: "빈 입력" };
  for (const { intent, re } of PATTERNS) {
    if (re.test(q)) {
      return { intent, confidence: 0.7, reason: "규칙 매칭" };
    }
  }
  return { intent: "unknown", confidence: 0.3, reason: "규칙 매칭 X" };
}

function isValidIntent(s: unknown): s is Intent {
  return typeof s === "string" && (VALID_INTENTS as ReadonlyArray<string>).includes(s);
}

// WebLLM 응답에서 JSON 파싱. 모델이 ```json``` 펜스로 감싸거나 앞뒤에
// 부연 설명 붙여도 첫 {...} 블록만 뽑아 파싱.
function parseClassification(raw: string): IntentResult {
  const stripped = raw.replace(/```(?:json)?\s*|\s*```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("WebLLM 응답에 JSON 객체 없음");
  }
  const json = stripped.slice(start, end + 1);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (!isValidIntent(parsed.intent)) {
    throw new Error(`유효하지 않은 intent: ${String(parsed.intent)}`);
  }
  return {
    intent: parsed.intent,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
    reason: typeof parsed.reason === "string" ? parsed.reason : "WebLLM 분류",
  };
}

async function classifyWithWebLLM(text: string): Promise<IntentResult> {
  const raw = await generateWithWebLLM([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ]);
  return parseClassification(raw);
}

function isWebLLMReady(): boolean {
  return getWebLLMStatus().state === "ready";
}

export async function classifyIntent(text: string): Promise<IntentResult> {
  const key = text.toLowerCase().trim();
  if (!key) return { intent: "unknown", confidence: 0, reason: "빈 입력" };

  const cached = cache.get(key);
  if (cached) return cached;

  // 같은 입력으로 동시 호출 — 첫 promise를 공유.
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (isWebLLMReady()) {
      try {
        const result = await classifyWithWebLLM(text);
        cache.set(key, result);
        return result;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[intent] WebLLM 분류 실패, 규칙 fallback:", err);
        }
        // fall through
      }
    }
    const fallback = classifyIntentByRules(text);
    cache.set(key, fallback);
    return fallback;
  })();

  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
  return promise;
}

// 디버그/시연용. 캐시를 비우면 다음 같은 입력은 다시 WebLLM 호출.
export function clearIntentCache(): void {
  cache.clear();
  inflight.clear();
}

// V3.5 게이트 보강 (2026-05-01): negation / trend 토큰. send()의 skipMatchStep
// 게이트 강화용. 이 토큰들이 입력에 있으면 specific pack target과 무관하게
// 무조건 Stage 1+2 skip → cloud로 흘림.
//   - negation: 사용자가 매칭 후보를 명시적으로 거부 ("레시피 말고")
//   - trend: 시점성·검색성 단어 ("요즘", "인기", "찾아봐"). 로컬 콘텐츠로
//            만족 안 되는 의도라 LLM 우선.
const NEGATION_TOKENS = ["말고", "아니고", "다른", "그거 말고"];
const TREND_TOKENS = ["요즘", "인기", "찾아봐", "알아봐", "순위", "비교"];

export function classifyNegationOrTrend(text: string): "negation" | "trend" | null {
  const q = text.toLowerCase();
  if (NEGATION_TOKENS.some((t) => q.includes(t.toLowerCase()))) return "negation";
  if (TREND_TOKENS.some((t) => q.includes(t.toLowerCase()))) return "trend";
  return null;
}

// V5.0 lite Phase B2: 직전 응답 부정 검출. 직전이 partial/fuzzy 매칭일 때
// 사용자가 "그게 아니라"·"무슨소리야" 같은 거부 신호 보내면 같은 entry 재
// 노출 X. negation 토큰 (말고/아니고/다른)과 별도로 분리한 이유: 사용자가
// 매칭 자체를 거부하는 강한 신호와, 입력 안에서 제외 조건 표시 (말고)는
// 다른 처리가 필요. negation은 매칭 진입을 막고, rejection은 직전 매칭을
// 무효화한다.
const REJECTION_TOKENS = [
  "없는데",
  "아니야",
  "아닌데",
  "그거 말고",
  "그게 아니라",
  "무슨소리",
  "엉뚱",
];

export function classifyRejection(text: string): boolean {
  const q = text.toLowerCase();
  return REJECTION_TOKENS.some((t) => q.includes(t.toLowerCase()));
}

// V5.0 lite Phase B3c: craving (식욕) 검출. intent 분류기 규칙은 craving을
// 별도 의도로 잡지 않으므로 (rule fallback에 craving 패턴 없음) — 보조 신호로
// 분리. selectFacet이 entry.contexts에 "craving"이 있으면 craving facet 반환.
//
// 토큰 선정:
//   "먹고싶" — "먹고싶다"/"먹고싶어"/"먹고싶네" 모두 prefix 일치
//   "먹고 싶" — 띄어쓰기 변형
//   "당기" — "당겨"/"당긴다" (감정 표현)
//   "먹으러" — "먹으러 가자"/"먹으러 갈까"
const CRAVING_TOKENS = ["먹고싶", "먹고 싶", "당기", "먹으러"];

// Phase EN-3: 영어 craving 보조 신호. 다어 토큰만 — 짧은 "want"/"hungry" 단독은
// 식욕 외 일상 발화 ("I'm hungry for knowledge") 충돌. 매칭 시 substring 검사.
const CRAVING_TOKENS_EN = ["want to eat", "craving", "hungry for"];

export function classifyCraving(text: string): boolean {
  const q = text.toLowerCase();
  if (CRAVING_TOKENS.some((t) => q.includes(t.toLowerCase()))) return true;
  return CRAVING_TOKENS_EN.some((t) => q.includes(t));
}

// V4.1 종합 의도 (memo summary). 사용자가 "지금까지 양자역학으로 모은
// 거 다 보여줘" 처럼 같은 주제에 쌓인 메모 자산을 *전부* 보고 싶다는
// 신호. learned cache 매처가 이 신호를 받으면 가장 풍부한 1개가 아니라
// 같은 topic 의 모든 entry 를 합쳐서 보여준다 (메모 전시 모드).
//
// Pack 매처에는 영향 X — Pack은 대화 진행용으로 entry 1개 깔끔이 그대로.
//
// 토큰: "정리"·"전부"·"다"·"모두"·"종합"·"지금까지". "다" 는 1 char 라
// false-positive 위험 (예: "달다" 의 "다") — 단독 "다 " (공백 뒤) 또는
// 문장 끝 "다" + 동사 ("다 보여줘", "다 알려줘") 형태로만 잡는다.
const SUMMARY_TOKENS = ["정리", "전부", "모두", "종합", "지금까지"];
const SUMMARY_DA_PATTERN = /(^|\s)다\s+(보여|알려|꺼내|모아|줘|줄래|정리|말해)/;

export function classifySummaryIntent(text: string): boolean {
  const q = text.toLowerCase();
  if (SUMMARY_TOKENS.some((t) => q.includes(t))) return true;
  if (SUMMARY_DA_PATTERN.test(q)) return true;
  return false;
}

// V5.0 Phase I-6: 행동 영역 (action area) 분류 박음. action_options 카드의
// kind 메타 (만들기 / 시켜먹기 / 찾기 / 정보) 와 매핑되는 사용자 발화 토큰.
//
// 배경: classifyNegationOrTrend 는 "negation 박힘 → 매처 우회" 까지만 박음.
// 매처 본체 진입 후 facet 박힌 carded 응답에서 사용자 부정 신호 무시 (Step 3
// 누수 — "만들고싶은게 아니라" 박혀도 [만들기] 카드 노출). I-6 가 negation
// 의 *영역* 까지 인지해 action_options 필터.
//
// 영역 정의:
//   만들기 — user 가 직접 행동 (요리, 풀이, 제조). 제외 시 [만들기/끓이기/풀이] 카드 차단.
//   시켜먹기 — user 가 외부에 주문 (배달, 시키기). 제외 시 [시켜먹기/배달] 카드 차단.
//   찾기 — 대안 / 추천 / 비슷한 거 (탐색). 제외 시 [다른 거/cloud로 찾기] 카드 차단.
//   정보 — passive viewing (정의/설명/보여주기). 제외 시 [레시피 보기/풀이 보기] 카드 차단.
export type ActionArea = "만들기" | "시켜먹기" | "찾기" | "정보";

const ACTION_AREA_TOKENS: Record<ActionArea, string[]> = {
  // 풀고 — "풀고싶다" / "풀고싶은게" 활용형. 풀어 (풀어보다) / 풀이 (명사) 와 함께
  만들기: ["만들", "끓이", "요리하", "조리", "제조", "굽", "볶", "찌", "풀이", "풀어", "풀고"],
  시켜먹기: ["시켜", "시키", "배달", "주문", "딜리버리", "테이크아웃"],
  찾기: ["찾기", "찾아", "검색", "추천", "비슷한", "다른 거", "다른거"],
  정보: ["알려", "보여", "설명", "정의"],
};

// Window-based negation 검출. action token 직후 N chars 내에 negation marker
// 박혀 있으면 그 영역 excluded. window 박힌 자리:
//   "만들고싶은게 아니라" — token "만들" 끝 + 8 chars 안에 "아니" 박힘.
//   "추천하지마" — token "추천" 끝 + 3 chars 안에 "하지" 박힘.
//   "시켜먹기 X" — token "시켜" 끝 + 5 chars 안에 "x"/"X" 박힘.
// 지마/지 마 prefix 다양 지원 ("하지마"/"보지마"/"주지마"/"먹지마") 위해
// `지\s*마` 단독 패턴 박음. "지" 단독은 "지요" 같은 어미와 충돌 가능 — 반드시
// "마" 가 뒤따르는 경우만.
const NEGATION_NEAR_PATTERN =
  /아니|싫|말고|별로|지\s*마|하지\s*않|않[아으을]|안\s|안하|그만|필요\s*없|원치\s*않|\s[xX]\b|\s[xX]\s|x$|X$/;

const NEGATION_WINDOW = 12; // 한국어 어미·조사 박힘 여유. "만들고싶은게 아니라" = 약 8 chars.

export function classifyActionNegation(text: string): ActionArea[] {
  const lower = text.toLowerCase();
  const excluded = new Set<ActionArea>();
  for (const [area, tokens] of Object.entries(ACTION_AREA_TOKENS) as [ActionArea, string[]][]) {
    for (const tok of tokens) {
      const idx = lower.indexOf(tok.toLowerCase());
      if (idx === -1) continue;
      const windowStart = idx + tok.length;
      const window = lower.slice(windowStart, windowStart + NEGATION_WINDOW);
      if (NEGATION_NEAR_PATTERN.test(window)) {
        excluded.add(area);
        break;
      }
    }
  }
  return Array.from(excluded);
}

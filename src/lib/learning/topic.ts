// V4.1 Topic consolidation — 캐시 entry 를 같은 주제로 묶기 위한 키.
//
// V4.1 초안 (2026-05-02 오전): extractNouns 의 *가장 긴 noun*. 자연 발화에서
// "양자역학에 대하알고싶어" → "대하알고싶" (틀림), "이걸 레포트 부족한데"
// → "부족한데" (틀림) 등 동사/부사 결합어가 더 길어 진짜 주제어가 묻힘.
//
// V4.1 정정 (2026-05-02 오후): *첫 번째 깨끗한 noun*. 한국어 발화는 보통
// 주제어가 앞에 등장 ("양자역학에 대해…"), 동사/부사는 뒤에 따라옴.
// 깨끗함 판정:
//   1. STOPWORDS 사전 (부사/지시어/시간/감정/의문어) 미포함
//   2. VERBAL_PATTERNS (싶/려/는데/줘 등 동사어간 잔여) 미포함
//   3. 정말 깨끗하지 못하면 다음 후보 시도. 끝까지 없으면 undefined →
//      matchLearnedResponse 가 V4 시맨틱 경로로 폴백.

import { extractNouns } from "@/lib/text/extract-nouns";

// 명백한 stopword. 이 단어가 nouns 목록에 있어도 topic 후보에서 제외.
//   - 부사 / 지시어: 의미가 발화 안에서만 정해지는 단어. 주제 키로 부적합.
//   - 시간 / 빈도: "오늘"/"요즘" 자체가 주제인 경우는 드물고, 진짜 주제는
//     보통 그 옆에 박힌 명사 ("오늘 운동" → 주제는 "운동").
//   - 감정 / 상태 stem: "배고프"/"졸리" 처럼 형용사 어간 (extractNouns 가
//     ENDING strip 후 남길 수 있는 형태). startsWith 매칭으로 활용형 흡수.
//   - 의문어: 그 자체가 정보 요청이지 주제는 아님.
const STOPWORDS = new Set<string>([
  // 부사 / 지시어
  "더",
  "좀",
  "조금",
  "너무",
  "매우",
  "그",
  "이",
  "저",
  "이걸",
  "그걸",
  "저걸",
  "이거",
  "그거",
  "저거",
  "여기",
  "거기",
  "저기",
  "자세히",
  "간단히",
  "빨리",
  "천천히",
  // 시간 / 빈도
  "요즘",
  "오늘",
  "내일",
  "어제",
  "지금",
  "방금",
  "아까",
  "나중",
  "지난번",
  "예전",
  "다음",
  "처음",
  // 감정 / 상태 stem (startsWith 로 활용형 흡수)
  "배고프",
  "졸리",
  "심심",
  "피곤",
  "지루",
  "재밌",
  "재미",
  // 의문어
  "왜",
  "어떻게",
  "뭐",
  "무슨",
  "어디",
  "언제",
  "누구",
  "얼마",
]);

// 동사 / 부사 어간 잔여 패턴. extractNouns 가 ENDING strip 후 noun 으로
// 분류했어도 이 substring 이 박혀 있으면 verb/adverb 잔여로 간주 → 제외.
//
// 채택 기준: 일반 명사 안에서 등장 가능성이 매우 낮은 동사 형태소만.
//   "싶"  — 알고싶다 / 먹고싶다 (desiderative)
//   "려"  — 알려/들려/보려 (intentional / causative)
//   "는데" — 부족한데 / 하는데 (connective)
//   "줘"  — 알려줘 / 보여줘 (request)
//   "해"  — 정리해 / 부탁해 (verbal)
//   "할래" — 할래 / 먹을래 (intentional question)
//   "잖" — 그렇잖아
const VERBAL_PATTERNS = ["싶", "려", "는데", "줘", "해", "할래", "잖", "려고", "려는"];

function isStopword(noun: string): boolean {
  if (STOPWORDS.has(noun)) return true;
  // 활용형 흡수 — "배고프" stopword 면 "배고픈"/"배고파" 도 같이 막음.
  // 짧은 stopword (≤2 chars) 는 prefix 매칭이 위험 ("이"/"그" 가 "이름"/"그릇"
  // 까지 막을 수 있음) — 정확 매칭만.
  for (const sw of STOPWORDS) {
    if (sw.length >= 3 && noun.startsWith(sw)) return true;
  }
  return false;
}

function isVerbalResidue(noun: string): boolean {
  return VERBAL_PATTERNS.some((p) => noun.includes(p));
}

export function extractTopic(input: string): string | undefined {
  const nouns = extractNouns(input);
  // 단일 발화 = 단일 명사면 그게 거의 확실히 주제 ("양자역학", "수학").
  // 다중 토큰이면 첫 번째 깨끗한 명사. 한국어는 주제가 보통 앞에 등장.
  for (const n of nouns) {
    if (isStopword(n)) continue;
    if (isVerbalResidue(n)) continue;
    return n;
  }
  return undefined;
}

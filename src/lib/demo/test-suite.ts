// 30개 고정 테스트셋 — 라우팅 결정 검증용. 시연 시 "DOTS가 의도한 대로
// 동작한다"를 증명하기 위한 가시화 도구.
//
// 카테고리:
//   - Cooking 6 — 팩 매칭 (Cooking Essentials)
//   - Study 8 — 팩 매칭 (Study Companion) + 일부 LLM
//   - General 6 — 의도 분류 (casual / definition / 추천)
//   - Routine 4 — Morning Routine 팩 + 학습 캐시
//   - Repeat 4 — 학습 캐시 hit (선행 cloud 응답이 있어야 hit)
//   - English 2 — 영어 입력 처리
//
// expectedRoute는 fresh state(학습 캐시 비어 있음, 모든 팩 설치됨) 기준.
// rep-N은 같은 입력을 채팅에서 한 번 cloud로 친 뒤에야 learned hit이라
// /demo UI에서 별도 안내 노출.

import type { DemoRoute } from "./trace";

export type TestCategory = "Cooking" | "Study" | "General" | "Routine" | "Repeat" | "English";

export type TestCase = {
  id: string;
  category: TestCategory;
  input: string;
  expectedRoute: DemoRoute;
  expectedExternalCall: boolean;
  description: string;
  // rep-* 처럼 사전 조건이 있는 테스트는 표시 — UI가 "선행 입력 필요" 노출.
  requiresPriorChat?: boolean;
};

export const TEST_SUITE: TestCase[] = [
  // ── Cooking 6 ──────────────────────────────────────────────────────
  {
    id: "cook-1",
    category: "Cooking",
    input: "김치찌개",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "팩 키워드 매칭 (specific hit)",
  },
  {
    id: "cook-2",
    category: "Cooking",
    input: "참치김치찌개",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "팩 콘텐츠 매칭 — 참치/두부",
  },
  {
    id: "cook-3",
    category: "Cooking",
    input: "메뉴 추천",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "추천 의도 — 단독 generic은 LLM",
  },
  {
    id: "cook-4",
    category: "Cooking",
    input: "오늘 저녁 뭐 먹지",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "상황 추천 — LLM",
  },
  {
    id: "cook-5",
    category: "Cooking",
    input: "김치찌개는 뭐야",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "definition 의도 — LLM (V2 헌법)",
  },
  {
    id: "cook-6",
    category: "Cooking",
    input: "백종원 김치찌개",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "팩 매칭 — 시그니처 키워드",
  },

  // ── Study 8 ────────────────────────────────────────────────────────
  {
    id: "study-1",
    category: "Study",
    input: "수학",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "Study 팩 — pack-level 매칭",
  },
  {
    id: "study-2",
    category: "Study",
    input: "삼각비",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "Study 콘텐츠 — sat-m-005",
  },
  {
    id: "study-3",
    category: "Study",
    input: "이차 방정식 꼭짓점",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "Study 콘텐츠 — sat-m-002",
  },
  {
    id: "study-4",
    category: "Study",
    input: "확률 주사위 문제",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "Study 콘텐츠 — sat-m-004",
  },
  {
    id: "study-5",
    category: "Study",
    input: "오답노트 만들어줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "복합 명령 — 팩 매칭 X, LLM",
  },
  {
    id: "study-6",
    category: "Study",
    input: "이 문제 힌트 줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "follow-up — LLM",
  },
  {
    id: "study-7",
    category: "Study",
    input: "왜 틀렸는지 알려줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "분석 요청 — LLM",
  },
  {
    id: "study-8",
    category: "Study",
    input: "2x+3=11 풀어줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "수학 풀이 — LLM",
  },

  // ── General 6 ──────────────────────────────────────────────────────
  {
    id: "gen-1",
    category: "General",
    input: "안녕",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "casual — LLM 짧은 응답 (V3 디시플린)",
  },
  {
    id: "gen-2",
    category: "General",
    input: "고마워",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "casual — LLM",
  },
  {
    id: "gen-3",
    category: "General",
    input: "양자역학은 뭐야",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "definition — LLM (off-topic)",
  },
  {
    id: "gen-4",
    category: "General",
    input: "내일 일정 잡아줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "복잡 명령 — LLM",
  },
  {
    id: "gen-5",
    category: "General",
    input: "2+2 계산해줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "계산 — LLM",
  },
  {
    id: "gen-6",
    category: "General",
    input: "DOTS는 뭐야",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "definition (자기 자신) — LLM",
  },

  // ── Routine 4 ──────────────────────────────────────────────────────
  {
    id: "rout-1",
    category: "Routine",
    input: "아침 루틴",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "Morning Routine 키워드 미설정 — LLM (현 라우터 한계 노출)",
  },
  {
    id: "rout-2",
    category: "Routine",
    input: "기상 후 뭐 하지",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "추천 — LLM (Morning Routine 팩 트리거 X)",
  },
  {
    id: "rout-3",
    category: "Routine",
    input: "오늘 집중 시간",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "Focus Writer 후보 — 트리거 미설정",
  },
  {
    id: "rout-4",
    category: "Routine",
    input: "와인 추천해줘",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "Wine Cellar 후보 — 트리거 미설정",
  },

  // ── Repeat 4 (학습 캐시 효과 증명) ──────────────────────────────────
  {
    id: "rep-1",
    category: "Repeat",
    input: "양자역학은 뭐야",
    expectedRoute: "learned",
    expectedExternalCall: false,
    description: "반복 — 학습 hit (gen-3 cloud 응답 후)",
    requiresPriorChat: true,
  },
  {
    id: "rep-2",
    category: "Repeat",
    input: "양자역학에 대해 알려줘",
    expectedRoute: "learned",
    expectedExternalCall: false,
    description: "변형 — V4 시맨틱 hit (gen-3 후, 임베딩 모델 ready 시)",
    requiresPriorChat: true,
  },
  {
    id: "rep-3",
    category: "Repeat",
    input: "안녕",
    expectedRoute: "learned",
    expectedExternalCall: false,
    description: "반복 인사 — 학습 hit (gen-1 후)",
    requiresPriorChat: true,
  },
  {
    id: "rep-4",
    category: "Repeat",
    input: "고마워",
    expectedRoute: "learned",
    expectedExternalCall: false,
    description: "반복 — 학습 hit (gen-2 후)",
    requiresPriorChat: true,
  },

  // ── English 2 (Tei 시연 한국어 우선이라 축소) ──────────────────────
  {
    id: "eng-1",
    category: "English",
    input: "what is quantum mechanics",
    expectedRoute: "cloud",
    expectedExternalCall: true,
    description: "영어 definition — LLM",
  },
  {
    id: "eng-2",
    category: "English",
    input: "kimchi jjigae recipe",
    expectedRoute: "pack",
    expectedExternalCall: false,
    description: "영어 키워드 — Cooking 팩 (kimchi 매칭)",
  },
];

export function testCasesByCategory(): Record<TestCategory, TestCase[]> {
  const groups = {} as Record<TestCategory, TestCase[]>;
  for (const c of TEST_SUITE) {
    if (!groups[c.category]) groups[c.category] = [];
    groups[c.category].push(c);
  }
  return groups;
}

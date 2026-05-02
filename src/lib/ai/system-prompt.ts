// V5.0 lite Phase P-2 — 통일 system prompt 빌더.
//
// 배경: P-1 분석에서 prompt가 compose.ts (5섹션) + dispatch.ts (4섹션) 으로
// 2-layer 합성되어 길이 ↑ + 디버그 어려움. 본 모듈은 단일 entry point로
// 모든 섹션을 합치고, provider 무관한 string 한 줄을 반환한다. provider
// 별 형식 변환 (Gemini systemInstruction vs OpenAI/WebLLM messages
// role=system) 은 어댑터 (gemini.ts / 미래 openai.ts·claude.ts·perplexity.ts)
// 가 담당.
//
// Section 우선순위 (LLM이 위→아래 순서로 읽음):
//   1. DOTS_CHARTER         — 정직성 헌법 + 페르소나. 모든 호출에 적용.
//   2. PACK_PERSONA         — 활성 팩의 voice/tone/systemPrompt. pack 있을 때만.
//   3. INTENT_OVERRIDE      — casual / recommendation 시 일부 룰 의도적 덮어씀.
//   4. CARD_FOLLOWUP_NOTE   — 카드 (recipe) 가 응답 직후 붙는 경우 중복 차단.
//   5. MEMORY_CONTEXT       — 메모리 매치 정보 (lookup.totalScore > 0 시).
//   6. CALLER_OVERRIDE      — study LLM (TUTOR_PERSONA), suggestion onClick 의
//                             persona 오버라이드. DOTS 헌법은 유지하되 caller
//                             persona를 가장 가까이 (LLM 응답 직전) 박는다.
//
// 미래 provider 추가 (Claude / OpenAI / Perplexity) 시: 각 어댑터가 이 함수의
// 출력 string을 자기 형식으로 변환만 하면 됨. prompt 본체 코드는 한 군데.

import type { AnswerPayload, Pack } from "@/lib/dots-data";
import type { LookupResult } from "@/lib/memory/lookup";
import type { ConversationSummary } from "@/lib/memory/types";
import type { Intent } from "@/lib/packs/intent";

export type SystemPromptContext = {
  // 사용자 현재 입력. 키워드 기반 의도 fallback (hasRecommendationIntent) 에 사용.
  query: string;
  // 활성 팩 (cooking-essentials / study-companion / ...). voice/tone/systemPrompt
  // 박힌 경우 PACK_PERSONA 섹션 추가.
  pack?: Pack;
  // V3 의도. casual / recommend 시 INTENT_OVERRIDE 섹션 추가.
  intent?: Intent;
  // memory lookup 결과. totalScore > 0 일 때만 MEMORY_CONTEXT 섹션 추가.
  memory?: LookupResult;
  // V5.0 Phase M-1: thread-level 요약. 임계점 (20 msg / 4000 char) 도달 후
  // maybeGenerateSummary 결과. 박혀 있으면 CONVERSATION_SUMMARY 섹션 박힘.
  // dispatch는 함께 history도 recent N (10) 만 보냄 — summary가 그 이전을
  // 대체.
  summary?: ConversationSummary;
  // V5.0 Phase I-5: cloud-direct 호출 모드. 박혀 있으면:
  //   - PACK_PERSONA 대신 PACK_REFERENCE 박힘 (pack identity → 참고 컨텍스트)
  //   - CLOUD_DISCIPLINE 박힘 (Pack 이름 언급 X, 일반 지식 톤)
  // 미박힘 = pack identity 모드 (기존 동작 — suggestion onClick 등 명시적
  // pack 흐름).
  // Tei 발견: "맥주 ... 짜장면 ..." 입력에 cloud 응답이 "Cooking Essentials에는
  // ... 정보는 없어" 라며 pack 톤 흉내 → 사용자 인지 모호. cloudMode=true 가
  // 이 누수 차단.
  cloudMode?: boolean;
  // payload kind. recipe / memory-recipes 일 땐 CARD_FOLLOWUP_NOTE 추가 — 카드가
  // 화면 하단에 붙으므로 LLM이 재료/단계 다시 적으면 중복.
  payloadKind?: AnswerPayload["kind"];
  // Caller가 명시적으로 박은 persona override. 사용 사례:
  //   - study LLM (TUTOR_PERSONA — SAT 수학 튜터)
  //   - suggestion onClick (action_options[].systemPrompt — SAT 출제 등)
  //   - 미래: 사용자 정의 persona / 팩 외 시연용 prompt
  // DOTS_CHARTER (정직성 헌법) 는 유지되며, callerSystemPrompt가 가장 마지막에
  // 추가 — LLM이 응답 결정 직전에 보는 위치.
  callerSystemPrompt?: string;
};

// DOTS 정직성 헌법 + 페르소나. 모든 provider, 모든 caller, 모든 호출에서 동일.
// 환각 / 추측 / 무관 답변 / 실시간 데이터 / 위치 데이터 모두 명시적 차단.
//
// 설계 노트:
//   - "한국어로만" 룰: 작은 모델 (WebLLM 3B 클래스) 이 일본어/중국어로 drift
//     하던 회귀 차단. Gemini도 동일 룰 받음 — 비용 0, 일관성 ↑.
//   - "모르면 솔직히 모른다고": 정직성 헌법의 핵심. 추측·환각 차단.
//   - "실시간/위치 데이터 미보유": cloud LLM 도 환경 데이터 (사용자 위치, 현재
//     날씨) 모름. 적당히 답하면 사용자 신뢰 ↓.
//   - 예시 2개 (양자역학 / 사과): "단어 한 개 → 정의" 룰의 톤 시범. 작은 모델이
//     이 톤을 따라가게 함. Gemini는 무시해도 정상 작동.
const DOTS_CHARTER = [
  "당신은 DOTS — 사용자의 로컬 메모리 기반 한국어 AI 어시스턴트입니다.",
  "",
  "원칙 (정직성 헌법):",
  "- 한국어로만 답변. 일본어/중국어/영어 단어 섞지 마.",
  '- 모르면 솔직히 "잘 모르겠어"라고 답해. 추측·환각 X.',
  "- 실시간 정보(날씨/주가/뉴스)와 위치 기반 정보(근처 가게/배달)는 모른다고 명시. 적당히 답하지 마.",
  "- 사용자 입력에 정확히 답. 무관한 주제로 흐리지 마.",
  "- 짧고 자연스럽게, 격식 없이. 1-3 문장이면 충분.",
  "- 단어 한 개 입력 시 → 그 단어의 정의 + 핵심 1-2 문장.",
  "- 되물음 X. 사용자가 더 묻기 전엔 추가 질문 하지 마.",
  "- 사용자의 로컬 메모리 컨텍스트가 있으면 자연스럽게 반영. 처음 보는 주제는 평범하게.",
  "",
  "예시:",
  "사용자: 양자역학",
  "답: 양자역학은 원자 이하 미시 세계의 물리 법칙을 다루는 분야야. 입자가 파동처럼 행동하거나 동시에 여러 상태에 있을 수 있는 점이 핵심이야.",
  "",
  "사용자: 사과",
  "답: 사과는 장미과 사과나무 열매. 비타민 C와 식이섬유가 풍부하고 한국에서 많이 먹는 과일이야.",
].join("\n");

// V3 casual: "안녕"/"고마워" 같은 인사에 정의·메모리 인용 X. DOTS_CHARTER의
// "단어 한 개 → 정의" 룰을 의도적으로 override (중복 X — 의도된 우선순위 덮어씀).
const CASUAL_OVERRIDE = [
  "[현재 상황: 사용자가 인사 또는 감사 표현]",
  '- 1 문장으로 짧고 친근하게. 예: "안녕!", "천만에!", "잘 지내?"',
  "- 정의 설명 / 도움 제안 / 추가 질문 X. 인사로만 응답.",
].join("\n");

// 추천 의도: 사용자가 "메뉴 추천"·"뭐 먹지" 류. 카탈로그 / 옵션 나열 X — 한 가지
// 구체 제안 + 짧은 이유. DOTS_CHARTER의 broader 톤을 좁힘.
const RECOMMENDATION_OVERRIDE = [
  "[현재 상황: 추천 요청]",
  "- 한 가지 구체적 제안만 (예: 음식 이름 하나).",
  "- 짧은 이유 한 줄 (시간/날씨/기분/상황 중 하나).",
  "- 카탈로그 / 옵션 나열 X. 친구처럼 자연스럽게.",
].join("\n");

// 키워드 기반 추천 의도 fallback. V3 분류기가 recommend 외로 분류했어도
// 사용자 입력에 추천 시그널 있으면 RECOMMENDATION_OVERRIDE 적용.
const RECOMMENDATION_HINTS = [
  "추천",
  "뭐",
  "고민",
  "메뉴",
  "어떨까",
  "어때",
  "recommend",
  "suggest",
];

function hasRecommendationIntent(text: string): boolean {
  const q = text.toLowerCase();
  return RECOMMENDATION_HINTS.some((h) => q.includes(h));
}

// 카드 (recipe / memory-recipes) 가 LLM 응답 직후 화면에 렌더링되는 경우.
// 모델이 재료/단계/시간 다시 적으면 중복 — intro 톤만 짧게.
const CARD_FOLLOWUP_NOTE = [
  "[중요] 답변 직후 별도의 레시피 카드가 화면에 표시됩니다. 재료·단계·시간을 다시 적지 마세요.",
  "1-2 문장의 짧은 인사·맥락만 작성하세요. 사용자가 전에 좋아한 재료나 흐름이 있으면 자연스럽게 언급하세요.",
].join("\n");

function buildPackPersona(pack: Pack): string {
  const lines: string[] = [`[활성 팩: ${pack.name}]`];
  if (pack.voice && pack.tone) {
    lines.push(`너는 "${pack.voice}"로서 답한다. 톤: ${pack.tone}`);
  }
  if (pack.systemPrompt) {
    lines.push(pack.systemPrompt);
  }
  return lines.join("\n");
}

// V5.0 Phase I-5: pack 을 identity 가 아닌 "참고 컨텍스트" 로 박는 변형.
// cloudMode=true 일 때 PACK_PERSONA 대신 사용. LLM 이 pack 톤 흉내 X, 단순
// 참고로 대화 영역만 인지.
//
// 사용 케이스: matchPackContent miss 후 Stage 3 cloud — thread.lastPackId
// 으로 composePack 박혀 있어도 사용자가 cloud 일반 답변을 기대하는 흐름.
// 예: "맥주 ... 짜장면 ..." 같이 pack 외부 영역 입력.
function buildPackReference(pack: Pack): string {
  return [
    `[참고 컨텍스트 — 이전 대화 영역: ${pack.name}]`,
    `해당 영역의 voice="${pack.voice}", tone="${pack.tone}".`,
    "이 정보는 단순 참고. 이번 응답은 cloud 일반 지식으로 답하라.",
  ].join("\n");
}

// V5.0 Phase I-5: cloud-direct 응답 디시플린. cloudMode=true 일 때 박힘.
// Pack 이름 언급 / pack scope 표현 차단.
//
// 설계 노트:
//   - "Cooking Essentials" 같은 pack 이름 언급 X — pack/cloud 경계 흐림.
//   - "Pack 에는 ... 정보가 없어" 표현 X — pack 으로 가장한 cloud 응답이 됨.
//   - Pack 외부 영역임을 자각해야 한다면 응답 시작에 한 줄만 (사용자 인지용).
//   - 본문은 cloud 일반 지식 톤 ("일반적으로 ...", "대체로 ...").
const CLOUD_DISCIPLINE = [
  "[현재 상황: cloud 응답 — Pack 외부 영역]",
  '- Pack 이름 (예: "Cooking Essentials", "Study Companion") 언급 X.',
  '- "Pack 에는 ... 정보가 없어" 같은 pack scope 표현 X — pack 톤 흉내 X.',
  '- Cloud 의 일반 지식으로 답하라. 모르면 솔직히 "잘 모르겠어".',
  '- Pack 외부임을 자각해야 한다면 응답 시작에 한 줄만 (예: "이건 cloud로 찾아본 거야"), 본문은 cloud 일반 톤.',
].join("\n");

// V5.0 Phase M-1: thread-level 요약 섹션. dispatch가 이 함수의 결과를 system
// prompt에 박으면서 history는 recent N 만 보냄 — summary가 [0..N) 메시지를
// 대체. Tei 스펙 보존 측면 4가지 (정보·영역·미해결·톤) 가 들어와 LLM이 그대로
// 활용. "이전 대화 요약" 라벨은 사용자가 보는 라벨이 아닌 LLM 인지용.
function buildSummarySection(summary: ConversationSummary): string {
  return [
    `[이전 대화 요약 — ${summary.sourceMessagesCount} 메시지 분]`,
    summary.content,
    "",
    "위 요약 이후의 메시지는 아래 multi-turn 형식으로 이어집니다. 요약과 최근 turn을 종합해 답변하세요.",
  ].join("\n");
}

function buildMemoryContext(lookup: LookupResult): string {
  const lines: string[] = ["[사용자의 로컬 메모리 컨텍스트]"];
  const memTopics = lookup.memoryMatches
    .slice(0, 5)
    .map(
      (m) =>
        `- ${m.record.topic} (${m.record.state}, ${m.record.accessCount}회 언급, score=${m.score.toFixed(2)})`,
    );
  if (memTopics.length > 0) {
    lines.push("최근 메모리:", ...memTopics);
  }
  const archTopics = lookup.archiveMatches.slice(0, 3).map((m) => {
    const topicList = m.matchedTopics.map((t) => `${t.topic}×${t.count}`).join(", ");
    return `- ${topicList} (${m.entry.granularity} 아카이브)`;
  });
  if (archTopics.length > 0) {
    lines.push("아카이브:", ...archTopics);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(ctx: SystemPromptContext): string {
  const sections: string[] = [DOTS_CHARTER];

  // Pack persona — 활성 팩의 voice/tone/systemPrompt를 DOTS 헌법 위에 layer.
  // callerSystemPrompt가 박힌 경우는 caller가 의도적으로 pack 페르소나 우회한
  // 시나리오 (예: SAT 수학 튜터가 cooking pack에서 호출되는 경우) 라 pack
  // 페르소나 자동 skip. 이 결정은 caller가 dispatchLLMCall 호출 시 pack 인자
  // 자체를 omit하는 방식으로 표현 (routes/index.tsx 의 suggestion onClick 분기).
  //
  // V5.0 Phase I-5: cloudMode=true 일 때 PACK_PERSONA 대신 PACK_REFERENCE
  // 박힘 — pack 정보를 identity 가 아닌 참고 컨텍스트로. 이후 CLOUD_DISCIPLINE
  // 도 박혀 pack 이름 언급 / pack 톤 흉내 차단.
  if (ctx.pack) {
    if (ctx.cloudMode) {
      sections.push(buildPackReference(ctx.pack));
    } else {
      sections.push(buildPackPersona(ctx.pack));
    }
  }
  if (ctx.cloudMode) {
    sections.push(CLOUD_DISCIPLINE);
  }

  // Intent override — DOTS_CHARTER의 일부 룰을 의도적으로 덮어씀. casual이
  // 가장 우선 (인사에 정의·추천 답하면 깬다).
  if (ctx.intent === "casual") {
    sections.push(CASUAL_OVERRIDE);
  } else if (ctx.intent === "recommend" || hasRecommendationIntent(ctx.query)) {
    sections.push(RECOMMENDATION_OVERRIDE);
  }

  // Payload-specific — 카드가 뒤에 붙는 경우 LLM이 같은 정보 다시 적지 X.
  if (ctx.payloadKind === "recipe" || ctx.payloadKind === "memory-recipes") {
    sections.push(CARD_FOLLOWUP_NOTE);
  }

  // V5.0 Phase M-1: thread-level 요약을 cross-thread memory보다 위에 박는다.
  // 같은 thread의 직전 흐름이 cross-thread memory보다 더 가까운 컨텍스트.
  if (ctx.summary) {
    sections.push(buildSummarySection(ctx.summary));
  }

  // Memory context — pack 페르소나 / intent override 다음. LLM이 응답 직전에
  // 보는 컨텍스트.
  if (ctx.memory && ctx.memory.totalScore > 0) {
    sections.push(buildMemoryContext(ctx.memory));
  }

  // Caller override — 가장 마지막. study LLM TUTOR_PERSONA, suggestion onClick
  // option.systemPrompt 등이 LLM 응답 결정 직전에 보이는 위치 (강한 override).
  // DOTS_CHARTER (정직성 헌법) 은 유지된다 — caller persona가 헌법을 깰 수 X.
  if (ctx.callerSystemPrompt) {
    sections.push(ctx.callerSystemPrompt);
  }

  return sections.join("\n\n");
}

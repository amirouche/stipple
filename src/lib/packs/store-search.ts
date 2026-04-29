// 팩스토어 검색 — 매칭 흐름의 2단계.
//
// 1단계: matchPackContent — 활성/설치 팩 contents 검색
// 2단계: searchStoreForQuery — 학습 도메인 키워드 감지 후 STORE_PACKS 검색
//   - 결과 있음 → "팩스토어에 ... 팩 있어" + [팩스토어 열기]
//   - 결과 없음 → "... 콘텐츠 아직 없어. 새로 만들어줄까?"
// 3단계 (1·2 모두 X): 기존 엔진 흐름 (LLM 일반 답변)
//
// 헌법: "모든 데이터는 팩 시스템 안에서 살아남." 매칭 실패가 곧장 LLM
// 일회성 답변으로 흐르지 않게, 마켓플레이스를 한 번 거치게 한다.

import type { AnswerPayload } from "@/lib/dots-data";
import { STORE_PACKS, type StorePack } from "@/lib/store-packs";

// 학습/콘텐츠 도메인 사전. 입력에 이 중 한 키워드가 있으면 그 도메인을
// 가지고 팩스토어를 검색한다. 키들(="수학", "영어" …)이 그대로 사용자에게
// 보이는 라벨이 된다.
const STUDY_DOMAINS: Record<string, string[]> = {
  수학: ["수학", "math", "방정식", "함수", "기하", "확률", "삼각", "통계", "대수"],
  영어: ["영어", "english", "단어", "문법", "회화", "토익", "토플", "토플스피킹"],
  국어: ["국어", "한국어", "korean", "독서", "문학", "맞춤법"],
  사회: ["사회", "social", "경제", "정치", "역사", "지리"],
  과학: ["과학", "science", "물리", "화학", "생물", "지구"],
  일본어: ["일본어", "japanese", "일어", "jlpt"],
  요리: ["요리", "레시피", "음식", "cook", "recipe"],
  와인: ["와인", "wine", "페어링"],
};

export type StoreSearchResult = {
  domain: string;
  found: StorePack[];
};

function lower(s: string): string {
  return s.toLowerCase();
}

export function detectStudyDomain(query: string): string | null {
  const q = lower(query);
  for (const [domain, keywords] of Object.entries(STUDY_DOMAINS)) {
    for (const k of keywords) {
      if (q.includes(lower(k))) return domain;
    }
  }
  return null;
}

export function searchStoreForQuery(query: string): StoreSearchResult | null {
  const domain = detectStudyDomain(query);
  if (!domain) return null;

  const q = lower(query);
  const dq = lower(domain);
  const found = STORE_PACKS.filter((p) => {
    const fields = [p.name, p.short, p.category].map(lower);
    return fields.some((f) => f.includes(dq) || f.includes(q));
  });

  return { domain, found };
}

export function buildStoreSuggestion(query: string, result: StoreSearchResult): AnswerPayload {
  const { domain, found } = result;

  if (found.length > 0) {
    const head = found[0];
    const tail = found.length > 1 ? ` 외 ${found.length - 1}개` : "";
    return {
      kind: "pack-suggestion",
      matchedPackName: "팩스토어",
      badge: "store",
      text: `팩스토어에 ${domain} 관련 팩이 ${found.length}개 있어 — ${head.name}${tail}. 보러 갈래?`,
      options: [
        { kind: "open-folder", label: "팩스토어 열기", target: "/store" },
        {
          kind: "llm-call",
          label: "그냥 답해줘",
          systemPrompt: `당신은 ${domain} 분야 친절한 튜터입니다. 한국어로 짧고 정확하게 답하세요.`,
          prompt: query,
        },
      ],
    };
  }

  // No store match — content-creation path. The LLM doesn't see the
  // suggestion bubble that triggered this click, so without an explicit
  // creator persona + original-query context it tends to drift into
  // dictionary mode ("국어 = 한국어"). The systemPrompt below pins the
  // role to "출제 전문가" and the prompt repeats the user's original
  // input so the model can pick a sub-topic.
  return {
    kind: "pack-suggestion",
    matchedPackName: "팩스토어",
    badge: "create",
    text: `${domain} 콘텐츠는 아직 팩스토어에도 없어. 새로 만들어줄까?`,
    options: [
      {
        kind: "llm-call",
        label: "만들어줘",
        systemPrompt: [
          `당신은 ${domain} 분야 학습 콘텐츠 출제 전문가입니다.`,
          `사용자가 ${domain} 영역의 새로운 객관식 문제를 만들어 달라고 요청했습니다.`,
          "다음 형식을 정확히 지켜 4지선다 문제 1개만 만들어 주세요. 한국어로 작성하세요.",
          "",
          `문제: [한 두 문장의 ${domain} 문제]`,
          "① [보기 1]",
          "② [보기 2]",
          "③ [보기 3]",
          "④ [보기 4]",
          "정답: [번호]",
          "풀이: [두세 줄의 짧은 풀이]",
        ].join("\n"),
        prompt: `${domain} 분야 객관식 문제 1개를 만들어 주세요. (사용자 원본 입력: "${query}")`,
      },
    ],
  };
}

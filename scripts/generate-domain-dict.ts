// V5.0 lite Phase I-4 — 도메인 사전 LLM 확장 스크립트.
//
// 실행: GEMINI_API_KEY 가 .env 에 박힌 상태에서
//   npx tsx scripts/generate-domain-dict.ts
// (또는 node --experimental-strip-types ... — bun run scripts/generate-domain-dict.ts)
//
// 동작:
//   1. 각 도메인별 prompt → Gemini 호출 → 단어/표현 리스트 파싱.
//   2. seed dictionary.json 와 union → 새 dictionary.json 으로 덮어씀.
//   3. 이미 있는 단어는 skip (de-dupe).
//
// 비용: Gemini 2.5 Flash 호출 14번 (도메인 수). 각 ~ 2-3KB output. 한 번 실행시
// 약 $0.01. 1500 RPD 한도 무관.
//
// Tei 검수 흐름:
//   1. 본 스크립트의 prompt 검토 (DOMAIN_PROMPTS) — 누락 도메인이나 추가 단어
//      방향 박을 도메인 있는지.
//   2. 실행 후 dictionary.json diff 검토.
//   3. 잘못된 단어는 수동 제거 (LLM 환각 일부 가능). 다음 commit에 정제 본
//      박음.
//
// 본 스크립트는 commit-time 호출 X — Tei가 명시 실행. 그 외에는 seed
// dictionary.json 그대로 사용.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICT_PATH = resolve(__dirname, "../src/lib/domain/dictionary.json");

// 도메인별 LLM prompt. 각 도메인의 의미·범위·용도 명시 → LLM이 정확한 단어
// 리스트 반환. JSON array 형식 강제.
const DOMAIN_PROMPTS: Record<string, string> = {
  레시피:
    "한국어 요리 레시피·조리법·재료 관련 단어와 표현을 100개 출력해. JSON array 형식 [\"...\"]. 음식 이름은 제외하고 조리 행위·재료·도구·양념에 집중. 예: '레시피', '조리법', '재료', '양념', '끓이다', '볶다'.",
  요리법:
    "한국어 요리 동사·조리 행위·요리 흐름 관련 표현을 50개. JSON array. 예: '끓이다', '볶다', '굽다', '데치다', '튀기다'.",
  음식: "한국·중·일·양식 음식 이름을 200개. JSON array. 일반 명사·고유 명사 모두 포함. 예: '김치찌개', '된장찌개', '짜장면', '파스타', '초밥'.",
  요리: "한국어에서 '요리하다'·'음식 만들기'·'주방' 관련 일반 표현 30개. JSON array. 동사·명사 모두.",
  학습: "한국어 학습·공부·이해 관련 단어 100개. JSON array. 학습 행위·학습 결과·학습 도구. 예: '공부', '복습', '이해', '암기', '필기'.",
  문제풀이:
    "한국어 문제풀이·시험·기출 관련 표현 50개. JSON array. 예: '문제', '풀다', '정답', '오답', '해설', '풀어볼래'.",
  수학: "한국어 수학 용어 100개. JSON array. 대수·기하·해석 기초·미적분·확률통계 모두 포함. 예: '방정식', '함수', '미분', '적분', '도함수'.",
  루틴: "한국어 루틴·습관·하루 일과 관련 표현 50개. JSON array. 예: '루틴', '습관', '아침 루틴', '기상', '운동 루틴'.",
  일상: "한국어 일상생활·하루·일정 관련 표현 50개. JSON array. 예: '오늘', '내일', '주말', '약속', '할 일'.",
  맛집: "한국어 맛집·식당·가게 추천 관련 표현 50개. JSON array. 예: '맛집', '맛있는 집', '식당', '레스토랑', '유명한'.",
  "지역 정보":
    "한국어 위치·근처·동네·지역 관련 표현 50개. JSON array. 예: '근처', '주변', '동네', '위치', '가까운'.",
  배달: "한국어 배달·배송·테이크아웃 관련 표현 30개. JSON array. 예: '배달', '배송', '포장', '딜리버리'.",
  "건강 정보":
    "한국어 건강·영양·다이어트·질환 관련 표현 70개. JSON array. 예: '칼로리', '단백질', '비타민', '당뇨'.",
  엔터테인먼트:
    "한국어 영화·드라마·음악·게임·콘텐츠 관련 표현 80개. JSON array. 예: '영화', '드라마', '예능', '게임', '유튜브'.",
};

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM = [
  "당신은 한국어 어휘 데이터 생성기입니다. 입력 prompt 의 도메인에 정확히 부합하는 단어/표현 리스트를 JSON array 형식 ['단어1', '단어2', ...] 로 반환.",
  "- 추측·환각 X. 일반적이지 않은 단어 X.",
  "- 활용형(어미 변형) 도 포함. 예: '풀다' 외에 '풀어', '풀고싶'.",
  "- 동의어·유사어 모두 포함.",
  "- JSON array 외 다른 텍스트 X.",
].join("\n");

async function callGemini(prompt: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in env");
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  // JSON array 파싱. ```json fence 박혀 있을 수 있어 strip 후 파싱.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

async function main() {
  const raw = await readFile(DICT_PATH, "utf-8");
  const dict = JSON.parse(raw) as Record<string, unknown>;

  for (const [domain, prompt] of Object.entries(DOMAIN_PROMPTS)) {
    console.log(`[generate] ${domain} ...`);
    try {
      const words = await callGemini(prompt);
      const existing = Array.isArray(dict[domain]) ? (dict[domain] as string[]) : [];
      const merged = Array.from(new Set([...existing, ...words]));
      dict[domain] = merged;
      console.log(`  + ${words.length} new (total ${merged.length})`);
    } catch (err) {
      console.error(`  ! failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // _meta.generated 갱신.
  const meta = (dict._meta as Record<string, unknown> | undefined) ?? {};
  meta.generated = `llm-expanded-${new Date().toISOString().slice(0, 10)}`;
  dict._meta = meta;

  await writeFile(DICT_PATH, JSON.stringify(dict, null, 2) + "\n", "utf-8");
  console.log(`[generate] dictionary.json updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

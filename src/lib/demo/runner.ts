// 헤드리스 라우팅 평가기 — send()와 동일한 matcher들을 호출하지만
// UI 사이드이펙트(thread mutation, message append) X / 클라우드 LLM 호출 X.
//
// 왜 헤드리스인가: /demo의 "Run All"이 30개 입력을 매번 Gemini로 흘리면
// 비용 폭발. 라우팅 결정 자체는 매처에서 결정되므로 (cloud로 넘어갈지
// 말지가 매처의 출력) — 클라우드는 호출 안 해도 trace는 정확히 박힌다.
//
// 동일성 보장: send()와 같은 모듈을 import (matchPackContent / searchStoreForQuery
// / matchLearnedResponse / classifyIntent / hasDefinitionIntent), 같은 게이팅
// 로직을 복제. 분기 추가 시 양쪽 동기화 필요 — 회귀 시 demo 결과로 잡힘.

import { PACKS, type Pack } from "@/lib/dots-data";
import { matchLearnedResponse } from "@/lib/learning";
import { classifyIntent } from "@/lib/packs/intent";
import { hasDefinitionIntent, matchPackContent } from "@/lib/packs/match";
import { searchStoreForQuery } from "@/lib/packs/store-search";

import { addDemoTrace, type DemoTrace } from "./trace";

const FOLLOWUP_HINTS = ["새 문", "새거", "다른 거", "다른거", "또 ", "더 줘", "추가"];

function hasFollowUpHint(input: string): boolean {
  const q = input.toLowerCase();
  return FOLLOWUP_HINTS.some((p) => q.includes(p));
}

export type EvaluateOptions = {
  // 어떤 팩이 설치되어 있다고 가정할지. 미지정 시 PACKS의 installed=true
  // 만 사용 (실 사용자 환경과 동일).
  installed?: Pack[];
};

export async function evaluateRouting(
  text: string,
  options: EvaluateOptions = {},
): Promise<DemoTrace> {
  const startTime = Date.now();
  const installed = options.installed ?? PACKS.filter((p) => p.installed);

  const intentResult = await classifyIntent(text);
  const intent = intentResult.intent;

  const isExplanatoryIntent = intent === "definition" || intent === "casual";
  const isFollowUpIntent = intent === "follow-up";
  const skipMatchStep = isExplanatoryIntent || isFollowUpIntent || hasDefinitionIntent(text);

  // Stage 1: pack content match
  if (!skipMatchStep) {
    const matched = await matchPackContent(text, installed, undefined);
    if (matched) {
      return addDemoTrace({
        input: text,
        intent,
        route: "pack",
        externalCall: false,
        provider: "pack",
        packId: matched.pack.id,
        packName: matched.pack.name,
        latencyMs: Date.now() - startTime,
        reason: matched.packLevel
          ? `pack-level 매칭 — ${matched.matches.length}개 후보`
          : `content-level 매칭 — score ${matched.matches[0]?.score.toFixed(0) ?? "?"}`,
      });
    }

    // Stage 2: store search
    const storeResult = searchStoreForQuery(text);
    if (storeResult) {
      return addDemoTrace({
        input: text,
        intent,
        route: "store",
        externalCall: false,
        provider: "none",
        latencyMs: Date.now() - startTime,
        reason: "팩스토어 매칭 — 새 팩 제안",
      });
    }
  }

  // Stage 2.5: learned cache. send()와 동일한 follow-up 게이트.
  const skipLearned = isFollowUpIntent || hasFollowUpHint(text);
  if (!skipLearned) {
    const learned = await matchLearnedResponse(text);
    if (learned) {
      return addDemoTrace({
        input: text,
        intent,
        route: "learned",
        externalCall: false,
        provider: "learned",
        packId: learned.packId,
        packName: learned.packName,
        latencyMs: Date.now() - startTime,
        reason: `학습 캐시 hit — 사용 ${learned.usedCount + 1}회 (priority ${learned.priority})`,
      });
    }
  }

  // Stage 3: 클라우드로 갈 자리. 헤드리스 모드라 실제 호출은 안 함 —
  // trace만 박고 "would-be cloud"임을 reason에 명시.
  return addDemoTrace({
    input: text,
    intent,
    route: "cloud",
    externalCall: true,
    // 실제 호출 안 했으므로 provider는 unspecified.
    provider: "none",
    latencyMs: Date.now() - startTime,
    reason: "헤드리스 평가 — 클라우드 LLM 호출 자리 (실제 미호출)",
  });
}

export type TestRunResult = {
  caseId: string;
  trace: DemoTrace;
  pass: boolean;
};

export async function runTestCase(
  caseInput: { id: string; input: string; expectedRoute: DemoTrace["route"] },
  options: EvaluateOptions = {},
): Promise<TestRunResult> {
  const trace = await evaluateRouting(caseInput.input, options);
  return {
    caseId: caseInput.id,
    trace,
    pass: trace.route === caseInput.expectedRoute,
  };
}

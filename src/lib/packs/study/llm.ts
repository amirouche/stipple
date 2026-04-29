// LLM 폴백 — commonMistakes에 잡히지 않는 깊은 설명, 변형 문제 생성에만 사용.
// 정답/오답 판정 자체는 sat-math.ts::checkAnswer가 온디바이스로 처리한다.

import { askGemini } from "@/lib/ai/gemini";
import type { SATMathProblem } from "./types";

const TUTOR_PERSONA = [
  "당신은 SAT 수학 튜터입니다.",
  "- 답변은 한국어로, 차분하고 단계적으로.",
  "- 비유 → 예시 → 핵심 정리, 3단계 구조를 가능한 한 유지하세요.",
  "- 학생이 어디서 막혔는지 짚어주고, 다음에 같은 실수를 안 하도록 짧은 한 줄을 끝에 덧붙이세요.",
].join("\n");

function describeProblem(p: SATMathProblem): string {
  return [
    `문제 [${p.id}, ${p.topic}, ${p.difficulty}]`,
    p.question,
    `보기: ${p.choices.join(" / ")}`,
    `정답: ${p.correctAnswer}`,
  ].join("\n");
}

export async function explainMistake(problem: SATMathProblem, selected: string): Promise<string> {
  const userMessage = [
    describeProblem(problem),
    "",
    `학생이 고른 답: ${selected}`,
    "",
    "이 학생이 왜 이 답을 골랐을지 추측해서, 어디서 사고가 새었는지 짚어줘. 그리고 다음에 같은 함정을 피할 한 줄을 마지막에 덧붙여.",
  ].join("\n");

  const { text } = await askGemini({
    data: { userMessage, systemPrompt: TUTOR_PERSONA },
  });
  return text;
}

export async function generateVariant(problem: SATMathProblem): Promise<string> {
  const userMessage = [
    describeProblem(problem),
    "",
    "이 문제와 같은 개념을 묻는 변형 문제 1개만 만들어줘. 보기 4개, 정답 표시까지 포함해서. 풀이는 짧게 한 줄.",
  ].join("\n");

  const { text } = await askGemini({
    data: { userMessage, systemPrompt: TUTOR_PERSONA },
  });
  return text;
}

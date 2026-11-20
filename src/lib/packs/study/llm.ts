// LLM 폴백 — commonMistakes에 잡히지 않는 깊은 설명, 변형 문제 생성에만 사용.
// 정답/오답 판정 자체는 sat-math.ts::checkAnswer가 온디바이스로 처리한다.
//
// Phase EN-fix E: lang param 추가. KO/EN persona + userMessage 분기. dispatch
// 에 lang 전달해 charter 도 일관되게 KO/EN. SAT 자체가 원래 영어 시험이라
// 영어 톤이 더 자연스러움.

import { dispatchLLMCall } from "@/lib/ai/dispatch";
import type { SATMathProblem } from "./types";

const TUTOR_PERSONA_KO = [
  "당신은 SAT 수학 튜터입니다.",
  "- 답변은 한국어로, 차분하고 단계적으로.",
  "- 비유 → 예시 → 핵심 정리, 3단계 구조를 가능한 한 유지하세요.",
  "- 학생이 어디서 막혔는지 짚어주고, 다음에 같은 실수를 안 하도록 짧은 한 줄을 끝에 덧붙이세요.",
].join("\n");

const TUTOR_PERSONA_EN = [
  "You are an SAT math tutor.",
  "- Reply in English, calm and step-by-step.",
  "- Try to keep a three-part structure: analogy → example → key takeaway.",
  "- Point out exactly where the student's reasoning leaked, and end with one short line that prevents the same mistake next time.",
].join("\n");

function describeProblem(p: SATMathProblem, lang: "ko" | "en"): string {
  if (lang === "en") {
    return [
      `Problem [${p.id}, ${p.topic}, ${p.difficulty}]`,
      p.questionEn ?? p.question,
      `Choices: ${p.choices.join(" / ")}`,
      `Correct answer: ${p.correctAnswer}`,
    ].join("\n");
  }
  return [
    `문제 [${p.id}, ${p.topic}, ${p.difficulty}]`,
    p.question,
    `보기: ${p.choices.join(" / ")}`,
    `정답: ${p.correctAnswer}`,
  ].join("\n");
}

export async function explainMistake(
  problem: SATMathProblem,
  selected: string,
  lang: "ko" | "en" = "ko",
): Promise<string> {
  const userMessage =
    lang === "en"
      ? [
          describeProblem(problem, "en"),
          "",
          `The student chose: ${selected}`,
          "",
          "Guess what reasoning led this student to that answer — where exactly did their thinking leak? End with one short line they can use to avoid the same trap next time.",
        ].join("\n")
      : [
          describeProblem(problem, "ko"),
          "",
          `학생이 고른 답: ${selected}`,
          "",
          "이 학생이 왜 이 답을 골랐을지 추측해서, 어디서 사고가 새었는지 짚어줘. 그리고 다음에 같은 함정을 피할 한 줄을 마지막에 덧붙여.",
        ].join("\n");

  const { text } = await dispatchLLMCall({
    userMessage,
    systemPrompt: lang === "en" ? TUTOR_PERSONA_EN : TUTOR_PERSONA_KO,
    lang,
  });
  return text;
}

export async function generateVariant(
  problem: SATMathProblem,
  lang: "ko" | "en" = "ko",
): Promise<string> {
  const userMessage =
    lang === "en"
      ? [
          describeProblem(problem, "en"),
          "",
          "Create one variant problem that tests the same concept. Include 4 choices, mark the correct one, and add a short one-line solution.",
        ].join("\n")
      : [
          describeProblem(problem, "ko"),
          "",
          "이 문제와 같은 개념을 묻는 변형 문제 1개만 만들어줘. 보기 4개, 정답 표시까지 포함해서. 풀이는 짧게 한 줄.",
        ].join("\n");

  const { text } = await dispatchLLMCall({
    userMessage,
    systemPrompt: lang === "en" ? TUTOR_PERSONA_EN : TUTOR_PERSONA_KO,
    lang,
  });
  return text;
}

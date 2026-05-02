// V4.1 종합 모드 — 같은 topic 의 모든 learned entry 를 메모 형태로 합쳐
// 보여주는 텍스트 빌더. matchLearnedTopicGroup 의 결과를 받아 화면에 박을
// 단일 string 으로 변환. cost 0 — LLM 호출 X, 단순 concat.
//
// 형식 예시 ("양자역학 정리해줘" 라고 물었을 때):
//   양자역학으로 쌓인 메모 3개:
//
//   1. (4월 15일) "양자역학 알고싶어"
//   양자역학은 물질과 에너지의 미시 세계를...
//
//   2. (4월 22일) "더 알고 싶어"
//   이중성과 중첩 같은 핵심 개념...
//
//   3. (5월 2일) "레포트 자료 부족"
//   3가지 핵심: ...
//
// Pack 매처와 다르게 "다 보여줌" 이 메모리 layer 의 자연스러운 표현 (Pack
// = 대화 진행, Memory = 기록).

import type { LearnedResponse } from "./types";

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function buildTopicSummary(topic: string, entries: LearnedResponse[]): string {
  if (entries.length === 0) return "";
  const header = `${topic}으로 쌓인 메모 ${entries.length}개:`;
  const blocks = entries.map((e, i) => {
    const date = formatDate(e.createdAt);
    return `${i + 1}. (${date}) "${e.userInput}"\n${e.response}`;
  });
  return [header, "", blocks.join("\n\n")].join("\n");
}

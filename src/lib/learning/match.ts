// Phase A matcher: exact equality after lower + trim. Cheap, deterministic,
// good enough to demo the "양자역학 두 번째엔 LLM 안 부름" narrative.
// 의미적 유사도(embedding 기반, edit-distance 등)는 Phase C 이후.
//
// Phase B 큐레이션 추가:
//   - priority < 0 (사용자가 "다른 거" 클릭) → 매칭에서 제외. 다음 같은
//     입력은 새 LLM 호출로 흘러간다.
//   - 같은 입력에 여러 응답이 있으면 priority desc + createdAt desc 순으로
//     정렬해 가장 좋아진 응답을 반환. good 평가 받은 응답이 항상 우선.

import { getLearnedSnapshot } from "./store";
import type { LearnedResponse } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function matchLearnedResponse(input: string): LearnedResponse | null {
  const target = normalize(input);
  if (!target) return null;
  const matches = getLearnedSnapshot()
    .filter((e) => normalize(e.userInput) === target)
    .filter((e) => e.priority >= 0);
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt);
  return matches[0];
}

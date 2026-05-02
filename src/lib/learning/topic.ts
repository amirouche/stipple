// V4.1 Topic consolidation — 캐시 entry를 같은 주제로 묶기 위한 키.
//
// 같은 주제 ("양자역학")로 여러 번 cloud 응답을 받으면 entry가 4-5개 박힌다.
// V4 매칭은 query별 가장 가까운 entry 1개만 꺼내므로 응답이 분산됐다 —
// "양자역학 알고싶어"는 짧은 정의, "레포트 자료 부족"은 풍부한 응답, 같은
// 주제임에도 가장 풍부한 자산이 묻혔다. Topic 키는 그 그룹을 묶는 한 줄.
//
// 추출 전략 — extractNouns의 longest noun:
//   - 이미 박힌 한국어 명사구 추출기를 그대로 활용 (조사/어미 strip).
//   - 가장 긴 noun 이 가장 specific한 주제 신호. ("양자역학 알고싶어" 에서
//     "양자역학" 이 "알고싶" 보다 길다 → topic="양자역학")
//   - 추출 실패 (대부분 follow-up 표현: "더 알고 싶어") → undefined.
//     그런 query는 어차피 follow-up gate에서 캐시 매칭이 skip 되므로 영향 X.

import { extractNouns } from "@/lib/text/extract-nouns";

export function extractTopic(input: string): string | undefined {
  const nouns = extractNouns(input);
  if (nouns.length === 0) return undefined;
  return [...nouns].sort((a, b) => b.length - a.length)[0];
}

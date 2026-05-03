// V6A 명시적 학습 명령 (Active Learning).
//
// DOTS 정체성 (Tei 정리):
//   "Local 학습 = DOTS 핵심 가치"
//   "10번 중 1번 Local = 비용 절감 시작"
//   "10번 중 5번 Local = 이상적"
//
// 사용자가 "두바이 쫀득쿠키를 두쫀쿠라고 해" 가르쳐도 학습 X 였던 약점 보강.
// 명시적 명령어 (@learn / @unlearn / @list) 로 Custom Dictionary 에 저장 →
// 다음 입력 시 alias 변환 → 매칭.
//
// 지원 명령어:
//   @learn X = Y         — alias X 를 canonical Y 로 등록
//   @learn 줄임 X Y      — 같은 의미 (= 자리에 공백)
//   @unlearn X           — alias 삭제
//   @list                — 학습된 alias 목록 표시
//
// parseCommand 가 null 반환 = 일반 입력 (기존 라우팅 유지).

export type CommandResult =
  | { command: "learn"; alias: string; canonical: string }
  | { command: "unlearn"; alias: string }
  | { command: "list" };

// 명령어 정규식. ^ 앵커로 입력 처음에 박혀있어야만 명령. 일반 발화 안에
// "@learn" 박혀 있어도 명령 X (안전).
const LIST_RE = /^@list\s*$/i;
const UNLEARN_RE = /^@unlearn\s+(\S.*)$/i;
// 줄임 변형: "@learn 줄임 X Y" — = 없이 공백 구분. X 는 단일 토큰 (공백 X),
// Y 는 나머지 전체. canonical 에 공백 박혀 있어도 흡수.
const LEARN_SHORT_RE = /^@learn\s+줄임\s+(\S+)\s+(\S.*)$/i;
// 표준 변형: "@learn X = Y" — = 양쪽 공백 가능. X 는 = 까지 (공백 가능 — alias
// 가 짧게 박는 게 일반이지만 "두 쫀쿠" 같은 공백 alias 도 허용).
const LEARN_RE = /^@learn\s+(.+?)\s*=\s*(\S.*)$/i;

export function parseCommand(input: string): CommandResult | null {
  const text = input.trim();
  if (!text.startsWith("@")) return null; // 빠른 path — 명령 아닌 일반 발화 즉시 통과

  if (LIST_RE.test(text)) return { command: "list" };

  const unlearn = UNLEARN_RE.exec(text);
  if (unlearn) return { command: "unlearn", alias: unlearn[1].trim() };

  // "@learn 줄임 ..." 가 "@learn X = ..." 보다 먼저 — = 가 없는 줄임 변형
  // 이 표준 정규식 매칭 X 면 그대로 통과.
  const short = LEARN_SHORT_RE.exec(text);
  if (short) {
    return { command: "learn", alias: short[1].trim(), canonical: short[2].trim() };
  }

  const learn = LEARN_RE.exec(text);
  if (learn) {
    const alias = learn[1].trim();
    const canonical = learn[2].trim();
    if (alias && canonical) return { command: "learn", alias, canonical };
  }

  // "@learn" 으로 시작하지만 형식 안 맞는 경우 — null 반환 시 일반 라우팅
  // 으로 흘러가는데, "@" prefix 가 cloud 응답에 박혀 어색. 명시적으로
  // command=list (도움말 대용) 로 fallback 도 가능. 일단 null — Phase 6B
  // 에서 도움말 메시지 박는 분기 별도 검토.
  return null;
}

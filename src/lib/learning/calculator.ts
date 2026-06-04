// Phase Calc: 계산기 (Calculator) 파서.
//
// "1+1" / "sqrt(16)" / "5 km to m" 같은 계산식 입력을 send() 진입 직후에 잡아
// mathjs 로 Local 평가. Cloud 호출 불필요. eval() 은 보안상 X — mathjs 의
// safe parser 만 사용.
//
// 두 단계 게이트:
//   1) looksLikeCalc — Hangul 차단 + (operator / function-call / "to" 단위
//      변환) 중 하나가 박혀 있어야 통과. 일반 발화 ("hello", "오늘 점심") 즉시
//      reject — mathjs 호출 자체를 회피.
//   2) math.evaluate try/catch — 식이 불완전 ("1+") 하거나 정의 안 된 심볼
//      이면 mathjs 가 throw → null 반환.
//
// log / ln 보정: mathjs 의 log(x) 는 자연로그 (ln), log10(x) 가 base-10. 사용자
// 관습 (log = 상용로그, ln = 자연로그) 에 맞추려고 token-level 치환.

import { evaluate, format } from "mathjs";

export interface CalcResult {
  // 사용자가 입력한 원본 (trim 만). UI 에 그대로 echo.
  expression: string;
  // mathjs 평가 결과를 format 한 string. Unit 객체 ("5000 m") 도 string 으로
  // 떨어짐 — UI 분기 단순화.
  result: string;
}

const HAS_HANGUL = /[가-힣]/;
// `+`, `-`, `*`, `/`, `^`, `%`, `!` — mathjs 가 인식하는 연산자 토큰.
const HAS_OPERATOR = /[+\-*/^!%]/;
// "sqrt(", "sin(", "log(" 같은 함수 호출 패턴. 알파벳 직후 `(`.
const HAS_FN_CALL = /[a-zA-Z]+\s*\(/;
// "5 km to m" — 숫자 박힌 단위 변환. 앞뒤로 space 가 박힌 to 만 잡음 ("tomato"
// 같은 단어 안의 to 흡수 X).
const HAS_UNIT_TO = /\d.*\s+to\s+/;

function looksLikeCalc(text: string): boolean {
  if (HAS_HANGUL.test(text)) return false;
  return HAS_OPERATOR.test(text) || HAS_FN_CALL.test(text) || HAS_UNIT_TO.test(text);
}

// log → log10, ln → log (natural). 순서 의존 — placeholder 로 ln 을 먼저
// 보존한 뒤 log → log10 치환, 마지막으로 placeholder → log 복원.
function rewriteLogConvention(text: string): string {
  return text
    .replace(/\bln\s*\(/g, "__LOG_NAT__(")
    .replace(/\blog\s*\(/g, "log10(")
    .replace(/__LOG_NAT__\(/g, "log(");
}

export function parseCalculation(input: string): CalcResult | null {
  const text = input.trim();
  if (!text) return null;
  if (!looksLikeCalc(text)) return null;

  const rewritten = rewriteLogConvention(text);
  try {
    const value = evaluate(rewritten);
    // assignment / 빈 결과 / function 객체 등은 계산 결과로 부적합. mathjs 는
    // 변수 할당 ("x = 5") 도 식으로 받아 undefined 를 반환할 수 있음.
    if (value === undefined || value === null) return null;
    if (typeof value === "function") return null;
    // mathjs format 기본 notation 은 "auto" — 지수 ≥ 5 또는 ≤ -3 인 number 를
    // 지수표기 (9.273564e+6 / 5e-5) 로 떨군다. number 한정으로 toLocaleString
    // 으로 우회. Unit / Fraction / BigNumber 는 기존 format 유지 — 그쪽은
    // notation:'fixed' 강제 시 자릿수 폭주 / 단위 표시 손실 위험.
    let result: string;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        result = String(value);
      } else if (Number.isInteger(value)) {
        result = value.toLocaleString("en-US", {
          useGrouping: false,
          maximumFractionDigits: 0,
        });
      } else {
        result = value.toLocaleString("en-US", {
          useGrouping: false,
          maximumFractionDigits: 14,
        });
      }
    } else {
      result = format(value, { precision: 14 });
    }
    return { expression: text, result };
  } catch {
    return null;
  }
}

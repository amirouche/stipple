// Phase EN-1: 입력 언어 감지. 단순/명확/한국어 default.
//
// 규칙:
//   - 한글 한 글자라도 박혀 있으면 "ko" (혼재 입력 "kimchi 좋아해" 도 ko —
//     한국어 응답이 자연스러움)
//   - 한글 없고 알파벳 있으면 "en"
//   - 빈 입력 / 숫자·기호만 ("1+1", "?") 은 "ko" — default fallback
//
// 호출 위치: routes/index.tsx::send() 진입 후 intent classify 직전. 결과를
// compose/dispatch/build 까지 thread (Step 2+).

export type Lang = "ko" | "en";

export function detectLanguage(text: string): Lang {
  if (!text || !text.trim()) return "ko";
  if (/[가-힣]/.test(text)) return "ko";
  if (/[a-zA-Z]/.test(text)) return "en";
  return "ko";
}

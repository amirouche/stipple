// Public WebLLM facade. The rest of the app should only import from
// "@/lib/webllm" — never reach into engine.ts / store.ts / worker.ts
// directly. This keeps the constitution rule ("user clicks → LLM") in
// one place and makes it harder to wire up an accidental auto-call.
//
// CONSTITUTION: 모델 다운로드는 사용자가 명시적으로 시작 버튼을 눌러야
// 트리거. DOTS 헌법의 "사용자 명시적 클릭 시에만 LLM" 룰이
// 모델 다운로드(1.8GB)까지 확장된 것.
// 자동 다운로드 절대 X. 자동 추론 절대 X.
//
// ──── 안정성 정정 (2026-05-30) — WebLLM 측면 facade 측면 stub. ─────────────
//
// 배경: @mlc-ai/web-llm 측면 CommonJS 측면 runtime require 측면 박음 → TanStack
// Start SSR 측면 ES module 측면 "require is not defined" 측면 throw → SSR 실패
// → client-only fallback → preference store 측면 module instance 측면 분리 측면
// hydrate timing 흐트러짐 (M0-4 dislike filter 측면 실 send() 측면 작동 X 의 원인).
//
// 조치:
//   1. 정적 @mlc-ai/web-llm import 측면 제거 — engine.ts / worker.ts 측면 unreachable
//      → tree-shaken → SSR bundle 측면 박혀 X.
//   2. downloadAndInitModel / generateWithWebLLM 측면 stub — 호출 시 throw.
//   3. status 측면 idle 측면 박혀 → 모든 caller (intent.ts / dispatch.ts) 측면
//      이미 `isWebLLMReady()` 게이트 측면 박혀 자동 fallback (rule classify /
//      Gemini) 측면 진입.
//
// 재활성 측면 (Phase L / M5 Max):
//   1. 아래 commented import 두 줄 (`@mlc-ai/web-llm` + `./engine`) 측면 복원.
//   2. downloadAndInitModel + generateWithWebLLM 측면 stub body 측면 git history
//      측면 본체 측면 복원 (commit 측면 이 파일 측면 이 정정 직전 측면 박혀 있음).
//   3. `__root.tsx` 측면 `tryAutoReloadWebLLM()` 호출 측면 복원.
//   4. `vite.config.ts` 측면 `ssr.external` 측면 박힌 `@mlc-ai/web-llm` 측면 제거
//      (또는 유지 — SSR 측면 import X 면 무해).
// ───────────────────────────────────────────────────────────────────────────

// import { hasModelInCache, type ChatCompletionMessageParam } from "@mlc-ai/web-llm";
// import { createWebLLMEngine, generateChat } from "./engine";

import { checkWebGPUSupport } from "./compat";
import { getStatusSnapshot, setStatus } from "./store";
import type { WebLLMModelId } from "./types";

// stub 측면 @mlc-ai/web-llm 측면 import 측면 X 박혀 — 메시지 shape 측면 동일.
// 재활성 시 `import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm"`
// 측면 복원.
type ChatCompletionMessageParam = {
  role: "system" | "user" | "assistant";
  content: string;
};

// Last successfully-loaded model id, persisted to localStorage so a fresh
// page load can auto-reload from IndexedDB cache without re-downloading
// 1.8GB. CONSTITUTION (수정):
// - 첫 다운로드는 사용자 명시 클릭 (1.8GB 비용 인지)
// - 그 후 자동 reload (캐시에서 5-10초)
// - 한 번 가치 결정 = 영구 적용. 사용자가 매번 클릭 X.
const LAST_MODEL_KEY = "dots:last-active-webllm-model";

function readLastModel(): WebLLMModelId | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_MODEL_KEY);
    return v ? (v as WebLLMModelId) : null;
  } catch {
    return null;
  }
}

function persistLastModel(modelId: WebLLMModelId | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (modelId) localStorage.setItem(LAST_MODEL_KEY, modelId);
    else localStorage.removeItem(LAST_MODEL_KEY);
  } catch {
    // Storage failures are non-fatal; just lose auto-reload for this session.
  }
}

export type { WebLLMModelId, WebLLMStatus, WebLLMProgress } from "./types";
export type { ModelInfo } from "./config";
export { AVAILABLE_MODELS, DEFAULT_MODEL } from "./config";
export { useWebLLMStatus, getStatusSnapshot as getWebLLMStatus } from "./store";
export { checkWebGPUSupport } from "./compat";

// Stub — 정정 (2026-05-30): @mlc-ai/web-llm 측면 SSR 측면 throw 차단용. 호출
// 시 throw → 사용자 측면 다운로드 버튼 측면 에러 측면 박혀 가시화. UI 측면 button
// 측면 사라진 측면 X 박혀 박혀 박혀 박힘 — 사용자 측면 명시 시도 측면 X 박힘.
// 재활성 절차 측면 파일 상단 주석 참조.
export async function downloadAndInitModel(modelId: WebLLMModelId): Promise<void> {
  setStatus(() => ({
    state: "error",
    model: modelId,
    error: "WebLLM 측면 일시 비활성화 (정정: SSR 호환 작업 진행 중)",
  }));
  throw new Error("WebLLM 측면 비활성. 재활성 측면 src/lib/webllm/index.ts 상단 주석 참조.");
}

// Quietly reload the last-used model on page mount when the cache is
// still warm. Failures are silent — gemini-only is the default so chat
// keeps working without WebLLM.
//
// Skipped when:
//   - LLMProvider !== "webllm-only" (사용자 시점 정정: gemini-only가
//     기본값. webllm-only를 명시적으로 선택한 사용자만 자동 reload —
//     일반 사용자에게 1.8GB 모델을 idle에 끌어오지 않는다.)
//   - WebGPU is unavailable (no point reloading)
//   - No previous model id stored (this is a first-time visitor)
//   - hasModelInCache returns false (user cleared site data)
//   - An engine is already loading or ready (StrictMode double-mount,
//     subsequent navigations)
export async function tryAutoReloadWebLLM(): Promise<void> {
  // 안정성 정정 (2026-04-30): LLMProvider가 "gemini-only"로 좁혀져 분기
  // 자체가 unreachable + 모듈 런타임이 깨져 있어 idle reload를 통째로
  // 끈다. root.tsx에서도 호출이 빠짐. 인프라 복구되면 git 히스토리에서
  // 원본(provider 체크 + cache 확인 + downloadAndInitModel) 복구.
  return;
}

// Stub — getEngine 측면 항상 null. caller (없음 — 현재 X) 측면 호출 시 fallback.
export function getEngine() {
  return null;
}

// Stub — 정정 (2026-05-30): generate 호출 시 throw. caller (intent.ts /
// dispatch.ts) 측면 `isWebLLMReady()` (= status.state === "ready") 측면
// 게이트 측면 박혀 — status 측면 항상 "idle" 박혀 generate 측면 진입 X.
// 만약 caller 측면 게이트 측면 우회 측면 호출 시 throw → fallback path.
export async function generateWithWebLLM(
  _messages: ChatCompletionMessageParam[],
  _onToken: (delta: string, sofar: string) => void = () => {},
): Promise<string> {
  void _messages;
  void _onToken;
  throw new Error(
    "WebLLM 측면 비활성 (SSR 호환 작업 중). 재활성 측면 src/lib/webllm/index.ts 상단 주석 참조.",
  );
}

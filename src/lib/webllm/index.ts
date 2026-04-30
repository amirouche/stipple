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
// downloadAndInitModel() and generateWithWebLLM() are the only entry
// points; both are thin wrappers around engine.ts that also keep the
// status store in sync so the UI sees state transitions.

import { hasModelInCache, type ChatCompletionMessageParam } from "@mlc-ai/web-llm";

import { getPreferences } from "@/lib/preferences";
import { checkWebGPUSupport } from "./compat";
import { createWebLLMEngine, generateChat } from "./engine";
import { getEngineRef, getStatusSnapshot, setEngineRef, setStatus } from "./store";
import type { WebLLMModelId } from "./types";

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

// Trigger the 1.8GB+ download + GPU compile for `modelId`. MUST be called
// from a user click — never on mount, never speculatively.
//
// Idempotent for the same model: calling it again while state === "ready"
// with the same modelId is a no-op so a careless re-render can't restart
// a 2-minute compile.
export async function downloadAndInitModel(modelId: WebLLMModelId): Promise<void> {
  const current = getStatusSnapshot();
  if (current.state === "ready" && current.model === modelId) return;
  if (current.state === "loading") return; // download already in flight

  const support = await checkWebGPUSupport();
  if (!support.supported) {
    setStatus(() => ({
      state: "error",
      error: support.reason ?? "WebGPU 미지원",
    }));
    throw new Error(support.reason ?? "WebGPU 미지원");
  }

  setStatus(() => ({ state: "loading", model: modelId }));

  try {
    const engine = await createWebLLMEngine(modelId, (report) => {
      setStatus(() => ({
        state: "loading",
        model: modelId,
        progress: {
          progress: report.progress,
          timeElapsed: report.timeElapsed,
          text: report.text,
        },
      }));
    });
    setEngineRef(engine);
    setStatus(() => ({ state: "ready", model: modelId }));
    // Remember this model for the next page load. tryAutoReloadWebLLM()
    // reads this back and skips the download dialog when the cache is
    // still warm.
    persistLastModel(modelId);
  } catch (e) {
    setEngineRef(null);
    setStatus(() => ({
      state: "error",
      model: modelId,
      error: String(e),
    }));
    throw e;
  }
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

// Get the active engine, or null if no model has been loaded. Callers
// should treat null as "WebLLM unavailable" and route to whatever
// fallback (Gemini, error, …) is appropriate for the call site —
// 3단계에서 Gemini fallback이 이 위에 얹힘.
export function getEngine() {
  return getEngineRef();
}

// Run a chat completion against the active engine. Throws if no model
// is loaded — the caller is expected to have checked status === "ready"
// or to handle the throw as a fallback signal.
export async function generateWithWebLLM(
  messages: ChatCompletionMessageParam[],
  onToken: (delta: string, sofar: string) => void = () => {},
): Promise<string> {
  const engine = getEngineRef();
  if (!engine) {
    throw new Error("WebLLM 엔진이 로드되지 않았어. 먼저 다운로드해야 해.");
  }
  const prev = getStatusSnapshot();
  setStatus((s) => ({ ...s, state: "generating" }));
  try {
    const text = await generateChat(engine, messages, onToken);
    // Restore the prior model id when returning to ready — `prev` is the
    // snapshot from before we flipped to "generating", so the model field
    // is intact.
    setStatus(() => ({ state: "ready", model: prev.model }));
    return text;
  } catch (e) {
    setStatus(() => ({
      state: "error",
      model: prev.model,
      error: String(e),
    }));
    throw e;
  }
}

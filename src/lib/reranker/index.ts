// Public reranker facade. embedding과 동일 패턴.
//
// 헌법: 250MB 다운로드도 사용자 명시 클릭. 자동 reload는 이전 명시
// 다운로드 기록 있을 때만 (LAST_RERANKER_KEY localStorage 핸들).

import { initRerankerWorker, scoreInWorker } from "./engine";
import { getRerankerStatusSnapshot, setRerankerStatus, useRerankerStatus } from "./store";
import type { RerankerModelId } from "./types";

export type { RerankerModelId, RerankerStatus, RerankerProgress } from "./types";
export type { RerankerModelInfo } from "./config";
export {
  AVAILABLE_RERANKER_MODELS,
  DEFAULT_RERANKER_MODEL,
  LEARNED_RERANK_THRESHOLD,
  PACK_RERANK_THRESHOLD,
  RERANK_TOP_N,
} from "./config";
export { useRerankerStatus, getRerankerStatusSnapshot as getRerankerStatus } from "./store";

const LAST_RERANKER_KEY = "dots:last-active-reranker-model";

function readLastRerankerModel(): RerankerModelId | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_RERANKER_KEY);
    return v ? (v as RerankerModelId) : null;
  } catch {
    return null;
  }
}

function persistLastRerankerModel(modelId: RerankerModelId | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (modelId) localStorage.setItem(LAST_RERANKER_KEY, modelId);
    else localStorage.removeItem(LAST_RERANKER_KEY);
  } catch {
    // localStorage 실패는 자동 reload만 잃을 뿐 — 동작 자체는 유지.
  }
}

export async function downloadAndInitReranker(modelId: RerankerModelId): Promise<void> {
  const current = getRerankerStatusSnapshot();
  if (current.state === "ready" && current.model === modelId) return;
  if (current.state === "loading") return;

  const device: "webgpu" | "wasm" =
    typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";

  setRerankerStatus(() => ({ state: "loading", model: modelId }));

  try {
    await initRerankerWorker(modelId, device, (progress) => {
      setRerankerStatus(() => ({ state: "loading", model: modelId, progress }));
    });
    setRerankerStatus(() => ({ state: "ready", model: modelId }));
    persistLastRerankerModel(modelId);
  } catch (e) {
    setRerankerStatus(() => ({ state: "error", model: modelId, error: String(e) }));
    throw e;
  }
}

export async function tryAutoReloadReranker(): Promise<void> {
  const current = getRerankerStatusSnapshot();
  if (current.state === "loading" || current.state === "ready" || current.state === "scoring") {
    return;
  }
  const modelId = readLastRerankerModel();
  if (!modelId) return;
  try {
    await downloadAndInitReranker(modelId);
  } catch (err) {
    console.warn("[reranker] auto-reload 실패:", err);
  }
}

export async function clearRerankerModel(): Promise<void> {
  persistLastRerankerModel(null);
  setRerankerStatus(() => ({ state: "idle" }));
}

// query를 각 candidate와 비교한 정규화 점수를 반환. candidate 순서를
// 그대로 유지 — 호출 측에서 score와 candidate를 같이 묶어 정렬한다.
// 정규화는 sigmoid(logit) → [0, 1].
export async function rerank(query: string, candidates: string[]): Promise<number[]> {
  return scoreInWorker(query, candidates);
}

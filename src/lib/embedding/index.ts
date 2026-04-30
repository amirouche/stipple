// Public 임베딩 facade. 외부 모듈은 "@/lib/embedding"에서만 import —
// engine/store/worker 내부는 비공개.
//
// 헌법:
// - 모델 다운로드는 사용자가 설정 페이지에서 명시적 클릭으로 트리거.
//   자동 다운로드 X.
// - 첫 다운로드 후 — 마지막 모델 id를 localStorage에 저장. tryAutoReload
//   가 다음 페이지 로드에서 캐시 hit 시 자동 ready.
// - 학습/팩 매칭은 `getEmbeddingStatus().state === "ready"`를 체크 후
//   임베딩 사용. 미사용 시 V3 fallback (정확 일치 + 키워드).

import { initEmbeddingWorker, embedInWorker } from "./engine";
import { getEmbeddingStatusSnapshot, setEmbeddingStatus, useEmbeddingStatus } from "./store";
import type { EmbeddingModelId } from "./types";

export type { EmbeddingModelId, EmbeddingStatus, EmbeddingProgress } from "./types";
export type { EmbeddingModelInfo } from "./config";
export {
  AVAILABLE_EMBEDDING_MODELS,
  DEFAULT_EMBEDDING_MODEL,
  LEARNED_SIMILARITY_THRESHOLD,
  PACK_SIMILARITY_THRESHOLD,
} from "./config";
export { useEmbeddingStatus, getEmbeddingStatusSnapshot as getEmbeddingStatus } from "./store";

const LAST_EMBEDDING_KEY = "dots:last-active-embedding-model";

function readLastEmbeddingModel(): EmbeddingModelId | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_EMBEDDING_KEY);
    return v ? (v as EmbeddingModelId) : null;
  } catch {
    return null;
  }
}

function persistLastEmbeddingModel(modelId: EmbeddingModelId | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (modelId) localStorage.setItem(LAST_EMBEDDING_KEY, modelId);
    else localStorage.removeItem(LAST_EMBEDDING_KEY);
  } catch {
    // localStorage 실패는 자동 reload만 잃을 뿐 — 동작 자체는 유지.
  }
}

// 사용자 명시 클릭에서만 호출. 200MB 다운로드 + ONNX 컴파일.
// idempotent: 같은 모델이 이미 ready면 no-op, 다른 모델이 loading 중이면
// 두 번째 호출은 무시.
export async function downloadAndInitEmbedding(modelId: EmbeddingModelId): Promise<void> {
  const current = getEmbeddingStatusSnapshot();
  if (current.state === "ready" && current.model === modelId) return;
  if (current.state === "loading") return;

  // WebGPU 가능하면 GPU 사용, 아니면 WASM. WebGPU는 임베딩에서도
  // 추론을 GPU로 돌려 main thread 부하를 줄인다 — 메모리에 모델 가중치를
  // GPU에 올린다.
  const device: "webgpu" | "wasm" =
    typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";

  setEmbeddingStatus(() => ({ state: "loading", model: modelId }));

  try {
    await initEmbeddingWorker(modelId, device, (progress) => {
      setEmbeddingStatus(() => ({ state: "loading", model: modelId, progress }));
    });
    setEmbeddingStatus(() => ({ state: "ready", model: modelId }));
    persistLastEmbeddingModel(modelId);
  } catch (e) {
    setEmbeddingStatus(() => ({ state: "error", model: modelId, error: String(e) }));
    throw e;
  }
}

// 페이지 로드 직후 — 사용자가 이전에 명시적으로 다운로드한 적 있는
// 모델이 있으면 조용히 ready 상태로 복구. 캐시 (IndexedDB) hit이면
// 5~10초, miss면 다시 200MB 다운로드는 트리거하지 않고 그냥 바로
// init 호출 — Transformers.js가 캐시 유무를 알아서 처리한다.
//
// 실패는 silent — 사용자는 idle 상태로 떨어지고 V3 fallback 매칭이
// 그대로 작동한다.
export async function tryAutoReloadEmbedding(): Promise<void> {
  const current = getEmbeddingStatusSnapshot();
  if (current.state === "loading" || current.state === "ready" || current.state === "embedding") {
    return;
  }

  const modelId = readLastEmbeddingModel();
  if (!modelId) return;

  try {
    await downloadAndInitEmbedding(modelId);
  } catch (err) {
    console.warn("[embedding] auto-reload 실패:", err);
  }
}

export async function clearEmbeddingModel(): Promise<void> {
  // 사용자가 시맨틱 매칭을 끄고 싶을 때. 다음 페이지 로드부터 auto-reload
  // 안 됨. 메모리에 로드된 워커는 그대로 유지 (다시 켤 때 init 비용 절약).
  persistLastEmbeddingModel(null);
  setEmbeddingStatus(() => ({ state: "idle" }));
}

// 단일 텍스트 → 768/384차원 정규화 벡터.
export async function embed(text: string): Promise<Float32Array> {
  const result = await embedInWorker([text]);
  if (result.length === 0) throw new Error("empty embedding result");
  return result[0];
}

// 배치 — 팩 콘텐츠를 한꺼번에 임베딩할 때 사용. 워커가 한 번에 받아
// pipeline에 넘기므로 한 번씩 호출보다 효율적.
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return embedInWorker(texts);
}

// 두 정규화된 벡터 간 코사인 유사도. 워커 측에서 normalize: true로
// 만들었으므로 dot product가 그대로 코사인 값. 빠른 hot path.
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// number[]로 저장된 벡터를 Float32Array로 변환. localStorage 직렬화는
// number[]로 떨어지므로 hot path에서 매번 변환하지 않으려면 한 번
// 캐싱하는 helper. (현재 store 내부에서 일회성 변환만 하면 충분 — 함수만
// export해두고 필요 시 사용.)
export function toFloat32(arr: number[] | Float32Array): Float32Array {
  if (arr instanceof Float32Array) return arr;
  return Float32Array.from(arr);
}

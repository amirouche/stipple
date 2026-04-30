// 메인 스레드 측 워커 핸들. 한 번 생성된 워커를 모듈 단위로 보관하고,
// init / embed 호출을 promise 기반으로 wrap한다. 메시지 id 매칭으로
// 동시 다발 호출도 안전.
//
// 헌법: 모델 다운로드는 사용자 명시 클릭에서만 트리거. 자동 reload는
// "이전에 한 번 명시적으로 받았다 = 가치 인정 끝났다" 시점에서만.

import { setEmbeddingStatus } from "./store";
import type { EmbeddingProgress } from "./types";

import EmbeddingWorker from "./worker.ts?worker";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let progressCb: ((p: EmbeddingProgress) => void) | undefined;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new EmbeddingWorker();
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      id: number;
      type: "progress" | "ready" | "result" | "error";
      data?: EmbeddingProgress;
      vectors?: Float32Array[];
      error?: string;
    };
    if (msg.type === "progress") {
      if (msg.data) progressCb?.(msg.data);
      return;
    }
    const handler = pending.get(msg.id);
    if (!handler) return;
    pending.delete(msg.id);
    if (msg.type === "error") handler.reject(new Error(msg.error ?? "unknown error"));
    else handler.resolve(msg);
  };
  worker.onerror = (event) => {
    // 워커 자체 크래시. 모든 pending을 reject + status를 error로.
    const err = event.message ?? "embedding worker crashed";
    pending.forEach(({ reject }) => reject(new Error(err)));
    pending.clear();
    setEmbeddingStatus(() => ({ state: "error", error: err }));
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export async function initEmbeddingWorker(
  modelId: string,
  device: "webgpu" | "wasm",
  onProgress: (p: EmbeddingProgress) => void,
): Promise<void> {
  const w = ensureWorker();
  progressCb = onProgress;
  const id = nextId++;
  return new Promise<void>((resolve, reject) => {
    pending.set(id, {
      resolve: () => resolve(),
      reject,
    });
    w.postMessage({ id, type: "init", modelId, device });
  });
}

export async function embedInWorker(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<Float32Array[]>((resolve, reject) => {
    pending.set(id, {
      resolve: (msg) => {
        const m = msg as { vectors?: Float32Array[] };
        resolve(m.vectors ?? []);
      },
      reject,
    });
    w.postMessage({ id, type: "embed", texts });
  });
}

export function destroyEmbeddingWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}

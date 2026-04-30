// 메인 스레드 워커 핸들. embedding/engine.ts와 동일한 request/response
// 패턴 — id로 매칭, pending Map, 단일 progressCb.

import { setRerankerStatus } from "./store";
import type { RerankerProgress } from "./types";

import RerankerWorker from "./worker.ts?worker";

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let progressCb: ((p: RerankerProgress) => void) | undefined;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new RerankerWorker();
  // ── DIAGNOSTIC ─ Worker 진짜 만들어지는지.
  if (import.meta.env.DEV) console.log("[reranker-engine] worker spawned");
  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      id: number;
      type: "progress" | "ready" | "result" | "error";
      data?: RerankerProgress;
      scores?: number[];
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
    const err = event.message ?? "reranker worker crashed";
    pending.forEach(({ reject }) => reject(new Error(err)));
    pending.clear();
    setRerankerStatus(() => ({ state: "error", error: err }));
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export async function initRerankerWorker(
  modelId: string,
  device: "webgpu" | "wasm",
  onProgress: (p: RerankerProgress) => void,
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

export async function scoreInWorker(query: string, candidates: string[]): Promise<number[]> {
  if (candidates.length === 0) return [];
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<number[]>((resolve, reject) => {
    pending.set(id, {
      resolve: (msg) => {
        const m = msg as { scores?: number[] };
        resolve(m.scores ?? []);
      },
      reject,
    });
    w.postMessage({ id, type: "score", query, candidates });
  });
}

export function destroyRerankerWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}

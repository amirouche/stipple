// Engine factory + streaming generation primitives for WebLLM.
//
// Two responsibilities:
//   1. createWebLLMEngine — spin up the Worker, attach a progress
//      callback, call reload() with the chosen model. Returns the engine
//      once it's done loading.
//   2. generateChat — run a chat-completion request as a stream, hand
//      every delta to onToken, and resolve with the concatenated text.
//
// CONSTITUTION: 모델 다운로드는 사용자가 명시적으로 시작 버튼을 눌러야
// 트리거. DOTS 헌법의 "사용자 명시적 클릭 시에만 LLM" 룰이
// 모델 다운로드(1.8GB)까지 확장된 것.
// 자동 다운로드 절대 X. 자동 추론 절대 X.

import {
  WebWorkerMLCEngine,
  type ChatCompletionMessageParam,
  type InitProgressCallback,
} from "@mlc-ai/web-llm";

import type { WebLLMModelId } from "./types";

// `?worker` is Vite-specific — it splits this import into a dedicated
// chunk and gives us back a `Worker` constructor instead of the module's
// exports. The query string is what tells Vite to emit a worker bundle;
// without it the engine code would land on the main thread.
import WebLLMWorker from "./worker.ts?worker";

export async function createWebLLMEngine(
  modelId: WebLLMModelId,
  onProgress: InitProgressCallback,
): Promise<WebWorkerMLCEngine> {
  const worker = new WebLLMWorker();
  const engine = new WebWorkerMLCEngine(worker);
  // Set the callback before reload(): reload() emits progress events
  // synchronously from the moment it kicks off, so registering after the
  // fact would drop the early "Fetching params..." messages that the UI
  // needs to show download has actually started.
  engine.setInitProgressCallback(onProgress);
  await engine.reload(modelId);
  return engine;
}

// Stream a chat completion. Each delta string is handed to onToken so
// the UI can render incrementally; the final concatenated string is
// returned for callers that just need the full text (e.g. parse-llm,
// non-streaming code paths).
export async function generateChat(
  engine: WebWorkerMLCEngine,
  messages: ChatCompletionMessageParam[],
  onToken: (delta: string, sofar: string) => void,
): Promise<string> {
  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
  });
  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;
    full += delta;
    onToken(delta, full);
  }
  return full;
}

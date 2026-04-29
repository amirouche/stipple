// WebLLM Web Worker entry. The actual MLC engine lives here so that
// inference (and the heavy WASM compile that precedes it) doesn't block
// the main thread / chat UI.
//
// Imported from engine.ts via Vite's `?worker` query suffix — that suffix
// makes Vite emit this file as a separate chunk and gives us a `Worker`
// constructor on the import side. Don't import this file without `?worker`
// on the consumer side; the runtime will load the engine on the main
// thread and freeze the UI during a 1.8GB model compile.

import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};

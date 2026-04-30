// V4 임베딩 Web Worker. Transformers.js 파이프라인이 여기 호스팅돼서
// ONNX 추론이 메인 스레드를 블록하지 않는다. WebLLM 워커와 동일 패턴.
//
// 메시지 프로토콜 — id로 요청/응답 매칭:
//   main → worker:
//     { id, type: "init", modelId, device }
//     { id, type: "embed", texts: string[] }
//   worker → main:
//     { id, type: "progress", data: ProgressEvent }
//     { id, type: "ready" }
//     { id, type: "result", vectors: Float32Array[] }
//     { id, type: "error", error: string }

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Transformers.js의 캐시 모드 — IndexedDB에 모델 weight를 저장. 다음
// 페이지 로드 때 자동 hit (auto-reload 흐름).
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let extractor: FeatureExtractionPipeline | null = null;

type InitMsg = { id: number; type: "init"; modelId: string; device: "webgpu" | "wasm" };
type EmbedMsg = { id: number; type: "embed"; texts: string[] };
type IncomingMsg = InitMsg | EmbedMsg;

self.onmessage = async (event: MessageEvent<IncomingMsg>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      // pipeline()은 모델을 다운로드하거나 캐시에서 hit해서 추출기를
      // 만든다. progress_callback이 다운로드 단계마다 호출되며 main으로
      // 그대로 forward.
      extractor = (await pipeline("feature-extraction", msg.modelId, {
        device: msg.device,
        progress_callback: (data: unknown) => {
          self.postMessage({ id: msg.id, type: "progress", data });
        },
      })) as FeatureExtractionPipeline;
      self.postMessage({ id: msg.id, type: "ready" });
    } catch (err) {
      self.postMessage({ id: msg.id, type: "error", error: String(err) });
    }
    return;
  }

  if (msg.type === "embed") {
    if (!extractor) {
      self.postMessage({ id: msg.id, type: "error", error: "embedding 모델이 로드되지 않았어" });
      return;
    }
    try {
      // mean pooling + L2 normalization → 코사인 유사도가 dot product로
      // 단순화돼서 매칭 hot path가 빨라진다.
      const output = await extractor(msg.texts, {
        pooling: "mean",
        normalize: true,
      });
      const data = output.data as Float32Array;
      const dim = data.length / msg.texts.length;
      const vectors: Float32Array[] = msg.texts.map((_, i) => {
        // slice는 새 buffer를 만든다 — 각 벡터가 독립적으로 transferable.
        // 여기서는 굳이 transfer는 안 하고 (3KB × N의 cost는 미미) 단순
        // postMessage로 직렬화 비용만 감수.
        return new Float32Array(data.slice(i * dim, (i + 1) * dim));
      });
      self.postMessage({ id: msg.id, type: "result", vectors });
    } catch (err) {
      self.postMessage({ id: msg.id, type: "error", error: String(err) });
    }
    return;
  }
};

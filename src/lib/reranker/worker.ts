// V4.5 Cross-encoder Web Worker. embedding/worker.ts와 같은 메시지
// 프로토콜. 차이점은 출력 — relevance score 1개 per (query, candidate) pair.
//
// 메시지:
//   main → worker:
//     { id, type: "init", modelId, device }
//     { id, type: "score", query, candidates: string[] }
//   worker → main:
//     { id, type: "progress", data }
//     { id, type: "ready" }
//     { id, type: "result", scores: number[] }  // sigmoid 정규화 [0, 1]
//     { id, type: "error", error }

import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;

type InitMsg = { id: number; type: "init"; modelId: string; device: "webgpu" | "wasm" };
type ScoreMsg = { id: number; type: "score"; query: string; candidates: string[] };
type IncomingMsg = InitMsg | ScoreMsg;

// 큰 logit이 양수일수록 relevant. sigmoid로 [0, 1] 범위로 정규화 →
// 임계값(0.85 / 0.75)을 모델 무관하게 적용 가능.
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

self.onmessage = async (event: MessageEvent<IncomingMsg>) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      tokenizer = await AutoTokenizer.from_pretrained(msg.modelId, {
        progress_callback: (data: unknown) => {
          self.postMessage({ id: msg.id, type: "progress", data });
        },
      });
      model = await AutoModelForSequenceClassification.from_pretrained(msg.modelId, {
        device: msg.device,
        progress_callback: (data: unknown) => {
          self.postMessage({ id: msg.id, type: "progress", data });
        },
      });
      self.postMessage({ id: msg.id, type: "ready" });
    } catch (err) {
      self.postMessage({ id: msg.id, type: "error", error: String(err) });
    }
    return;
  }

  if (msg.type === "score") {
    if (!tokenizer || !model) {
      self.postMessage({ id: msg.id, type: "error", error: "reranker 모델이 로드되지 않았어" });
      return;
    }
    if (msg.candidates.length === 0) {
      self.postMessage({ id: msg.id, type: "result", scores: [] });
      return;
    }
    try {
      // batch tokenization: 같은 query를 candidates 수만큼 복제 + text_pair에
      // 각 candidate. tokenizer가 [CLS] query [SEP] doc [SEP] 시퀀스를 만든다.
      const queries = msg.candidates.map(() => msg.query);
      const inputs = tokenizer(queries, {
        text_pair: msg.candidates,
        padding: true,
        truncation: true,
      });
      const outputs = (await model(inputs)) as { logits: { data: Float32Array; dims: number[] } };
      const logits = outputs.logits.data;
      const numLabels = outputs.logits.dims[1] ?? 1;
      // single-output regression(num=1) / binary classification(num=2) 둘 다
      // 마지막 열을 "positive" 점수로 본다 (BAAI/bge-reranker / gte 표준).
      const scores: number[] = [];
      for (let i = 0; i < msg.candidates.length; i++) {
        const logit = logits[i * numLabels + (numLabels - 1)];
        scores.push(sigmoid(logit));
      }
      self.postMessage({ id: msg.id, type: "result", scores });
    } catch (err) {
      self.postMessage({ id: msg.id, type: "error", error: String(err) });
    }
    return;
  }
};

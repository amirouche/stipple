// 사용자에게 노출할 reranker 모델 카탈로그. EmbeddingModelInfo와 같은
// 형식 — 동일 ModelCard UI에서 재사용 가능.
//
// gte-multilingual-reranker-base: Alibaba 다국어 cross-encoder. 한국어/
// 영어/중국어 정확도 최상. ONNX 양자화로 ~250MB.
//
// ms-marco-MiniLM-L-6-v2: 영어 전용 경량 옵션. 90MB, 빠름. 한국어 정확도
// 떨어짐 — 시연 시연용으로만 의미.

import type { RerankerModelId } from "./types";

export interface RerankerModelInfo {
  id: RerankerModelId;
  name: string;
  size: string;
  description: string;
  recommended: boolean;
}

export const AVAILABLE_RERANKER_MODELS: RerankerModelInfo[] = [
  {
    id: "onnx-community/gte-multilingual-reranker-base",
    name: "GTE Multilingual Reranker (base)",
    size: "250MB",
    description: "Alibaba 다국어 cross-encoder. 한국어 정확도 우수.",
    recommended: true,
  },
  {
    id: "Xenova/ms-marco-MiniLM-L-6-v2",
    name: "MS MARCO MiniLM L6",
    size: "90MB",
    description: "경량 영어 cross-encoder. 한국어는 약함.",
    recommended: false,
  },
];

export const DEFAULT_RERANKER_MODEL: RerankerModelId =
  "onnx-community/gte-multilingual-reranker-base";

// Cross-encoder 점수는 sigmoid(logit)으로 정규화되어 [0, 1]. 임계값:
//   - 학습 매칭: 0.85 — 보수적. 잘못 hit 시 무관 응답 그대로 노출되니 정확도 우선.
//   - 팩 매칭: 0.75 — 키워드/임베딩과 OR 결합이라 살짝 너그럽게.
// 1차 후보 top-N 게이트 — bi-encoder가 너무 많이 잡으면 reranker 비용 ↑.
export const LEARNED_RERANK_THRESHOLD = 0.85;
export const PACK_RERANK_THRESHOLD = 0.75;
export const RERANK_TOP_N = 10;

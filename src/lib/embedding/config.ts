// 사용자에게 노출할 임베딩 모델 카탈로그. WebLLM의 ModelInfo와
// 형식 동일 — 동일한 ModelCard UI에서 재사용 가능.
//
// EmbeddingGemma는 Google 308M 임베딩 전용 모델. ONNX 양자화로 ~200MB.
// 768차원 출력. Matryoshka로 256/128차원 truncate 가능.
//
// MiniLM은 backup/저사양 옵션. 90MB, 384차원, 빠름. 정확도는 EmbeddingGemma보다 낮음.

import type { EmbeddingModelId } from "./types";

export interface EmbeddingModelInfo {
  id: EmbeddingModelId;
  name: string; // UI 표시명
  size: string; // 다운로드 크기 추정
  dim: number; // 출력 차원
  description: string;
  recommended: boolean;
}

export const AVAILABLE_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  {
    id: "onnx-community/embeddinggemma-300m-ONNX",
    name: "EmbeddingGemma (308M)",
    size: "200MB",
    dim: 768,
    description: "Google 임베딩 전용 모델. 다국어, 시맨틱 정확도 우수.",
    recommended: true,
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    name: "MiniLM L6 v2",
    size: "90MB",
    dim: 384,
    description: "경량 모델. 빠르지만 한국어 정확도는 EmbeddingGemma보다 낮음.",
    recommended: false,
  },
];

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelId = "onnx-community/embeddinggemma-300m-ONNX";

// 코사인 유사도 임계값. 두 벡터 사이가 이 값 이상이면 매칭으로 인정.
//   학습 데이터 매칭: 0.85 — "양자역학" / "양자역학에 대해" / "양자역학이
//                            뭐야"가 같은 응답으로 묶이는 정도.
//   팩 콘텐츠 매칭: 0.75 — 키워드 매칭과 hybrid되므로 단독 임계값은 살짝
//                          낮게. 키워드 hit 없이 임베딩만으로 카드를 띄우는
//                          경우는 보수적으로 잡는다.
export const LEARNED_SIMILARITY_THRESHOLD = 0.85;
export const PACK_SIMILARITY_THRESHOLD = 0.75;

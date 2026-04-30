// V4.5 Cross-encoder 재정렬. EmbeddingGemma의 bi-encoder 매칭 위에
// 후보를 정밀 재정렬하는 레이어. 쿼리+문서가 한 번에 attention으로
// 처리되어 추상적/대화적 변형 입력 정확도가 크게 올라간다 (MS MARCO
// benchmark 기준 15~25% NDCG ↑).
//
// 모델 ID는 HuggingFace Hub repo path. ONNX 양자화 버전 사용 —
// 다운로드 200~300MB.

export type RerankerModelId =
  | "onnx-community/gte-multilingual-reranker-base"
  | "Xenova/ms-marco-MiniLM-L-6-v2";

// 모델 다운로드/초기화 진행. EmbeddingProgress와 동일 형식 — Transformers.js
// progress_callback이 흘려보내는 값.
export interface RerankerProgress {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

// 라이프사이클. embedding과 동일 패턴.
export interface RerankerStatus {
  state: "idle" | "loading" | "ready" | "scoring" | "error";
  model?: RerankerModelId;
  progress?: RerankerProgress;
  error?: string;
}

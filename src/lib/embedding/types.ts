// V4 임베딩 1단계 — 타입 정의만. 추론 흐름은 engine.ts / worker.ts.
//
// 모델 ID는 HuggingFace Hub repo path. ONNX 양자화 버전을 사용 —
// EmbeddingGemma 기준 약 200MB.

export type EmbeddingModelId =
  | "onnx-community/embeddinggemma-300m-ONNX"
  | "Xenova/all-MiniLM-L6-v2";

// 모델 다운로드/초기화 진행 상태. Transformers.js의 progress_callback이
// 흘려보내는 형식과 호환. 단계별로 status: "initiate" | "download" |
// "progress" | "done" 흐름.
export interface EmbeddingProgress {
  status: string; // initiate / download / progress / done
  file?: string; // 파일 경로 (어떤 ONNX 파일이 받아지는지)
  progress?: number; // 0-100 (Transformers.js는 0-100 스케일)
  loaded?: number; // bytes
  total?: number; // bytes
}

// 엔진 라이프사이클. WebLLM과 같은 형식 — UI는 이 값만 보고 판단.
//   idle      — 아직 모델 로드 안 됨
//   loading   — 모델 다운로드/초기화 중
//   ready     — 임베딩 준비 완료
//   embedding — 추론 중 (배치 처리)
//   error     — 실패
export interface EmbeddingStatus {
  state: "idle" | "loading" | "ready" | "embedding" | "error";
  model?: EmbeddingModelId;
  progress?: EmbeddingProgress;
  error?: string;
}

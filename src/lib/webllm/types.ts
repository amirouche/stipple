// WebLLM 1단계 — 타입 정의만. 엔진 초기화·다운로드·추론 흐름은
// 후속 단계에서 별도 파일로 추가된다 (engine.ts, worker.ts 예정).
//
// 모델 ID 문자열은 @mlc-ai/web-llm의 prebuilt-app-config.ts에 등록된
// 식별자와 1:1로 매칭. 오타 나면 모델 다운로드가 즉시 실패한다.

export type WebLLMModelId =
  | "Llama-3.2-3B-Instruct-q4f32_1-MLC"
  | "Phi-3.5-mini-instruct-q4f16_1-MLC"
  | "Qwen2.5-3B-Instruct-q4f16_1-MLC";

// 모델 다운로드/초기화 진행 상태. WebLLM의 InitProgressCallback이
// 흘려보내는 값을 그대로 받기 위한 형식.
export interface WebLLMProgress {
  progress: number; // 0-1
  timeElapsed: number;
  text: string; // "Loading model...", "Fetching params..." 등
}

// 엔진 라이프사이클 상태머신. UI는 이 값만 보고 판단한다.
//   idle       — 아직 어떤 모델도 선택/로드 안 됨
//   loading    — 모델 다운로드 또는 초기화 중 (progress 채워짐)
//   ready      — 추론 준비 완료
//   generating — 토큰 스트리밍 중
//   error      — 실패 (error 메시지 채워짐)
export interface WebLLMStatus {
  state: "idle" | "loading" | "ready" | "generating" | "error";
  model?: WebLLMModelId;
  progress?: WebLLMProgress;
  error?: string;
}

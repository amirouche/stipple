// 사용자에게 노출할 모델 카탈로그. WebLLM의 prebuilt 모델 중에서
// (1) 한국어가 어느 정도 되고 (2) 3B급으로 M1/M2 Mac에서 돌릴 만한
// 것들만 골랐다. q4f16/q4f32는 4-bit 양자화 — 정확도 약간 손해 보고
// 메모리/속도 크게 절약하는 트레이드오프.
//
// size는 다운로드 크기 추정치 (MLC 기준). 실제 IndexedDB 점유는
// 모델 외 wasm/토크나이저 포함해서 +200~400MB 정도 더 든다.

import type { WebLLMModelId } from "./types";

export interface ModelInfo {
  id: WebLLMModelId;
  name: string; // 사용자 표시명 (UI 카드 헤딩)
  size: string; // "1.8GB" 형태 — 다운로드 알림에 그대로 노출
  description: string;
  languages: string[]; // ISO 코드 — UI에서 ko/en/ja 칩으로 노출
  recommended: boolean; // 첫 진입 시 자동 강조할 모델
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
    name: "Llama 3.2 (3B)",
    size: "1.8GB",
    description: "Meta의 경량 모델, 한국어/영어 균형",
    languages: ["en", "ko"],
    recommended: true,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi 3.5 mini",
    size: "2.2GB",
    description: "Microsoft의 작은 모델, 빠른 추론",
    languages: ["en", "ko"],
    recommended: false,
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    name: "Qwen 2.5 (3B)",
    size: "1.9GB",
    description: "Alibaba의 모델, 다국어 우수",
    languages: ["en", "ko", "ja", "zh"],
    recommended: false,
  },
];

export const DEFAULT_MODEL: WebLLMModelId = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

// WebGPU 호환성 체크. 이 함수가 false를 반환하면 WebLLM 로딩 자체를
// 시도하지 않는다 — 빈 어댑터로 넘어가면 모델 다운로드만 1GB 잡아먹고
// 마지막에 GPU 초기화 실패로 죽기 때문에 사전에 막아야 한다.
//
// SSR 환경(navigator 자체가 없음)에서도 안전하게 false를 돌려주도록
// 분기 — 이 모듈은 클라이언트 빌드에만 들어가지만, 같은 import 그래프
// 안에서 SSR 렌더가 잠깐 스쳐도 터지면 안 된다.

export interface WebGPUSupport {
  supported: boolean;
  reason?: string;
}

export async function checkWebGPUSupport(): Promise<WebGPUSupport> {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "navigator 없음 (SSR)" };
  }
  if (!("gpu" in navigator)) {
    return { supported: false, reason: "WebGPU 미지원 브라우저" };
  }
  try {
    // navigator.gpu는 표준 타입이 lib.dom.d.ts 버전에 따라 빠져 있을 수
    // 있어서 여기서만 좁게 단언. 호출 자체는 W3C WebGPU의 정식 API.
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: "GPU 어댑터 없음" };
    }
    return { supported: true };
  } catch (e) {
    return { supported: false, reason: `GPU 초기화 실패: ${String(e)}` };
  }
}

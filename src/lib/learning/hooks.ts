// React hooks over the learning store. Subscribe-only (writes go through
// store.ts). Kept separate from store.ts so the store stays framework-
// agnostic — server-rendered code paths can still import store/match
// without pulling React in.

import { useSyncExternalStore } from "react";

import { getLearnedSnapshot, subscribeLearned } from "./store";

// Phase B: AssistantBubble의 Rating UI가 자기 메시지의 learnedId로 현재
// 평가 상태를 읽어서 "좋아"/"다른 거" 버튼과 "✓ 평가됨" 표시를 토글한다.
// 같은 응답이 다른 thread에서도 평가되면 모두 일관되게 갱신된다.
export function useLearnedRating(id: string | undefined): "good" | "bad" | undefined {
  return useSyncExternalStore(
    (cb) => subscribeLearned(cb),
    () => (id ? getLearnedSnapshot().find((e) => e.id === id)?.rating : undefined),
    () => undefined,
  );
}

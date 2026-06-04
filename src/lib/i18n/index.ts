// Phase 2 i18n — 헬퍼 진입점. 컴포넌트는 useT() 훅으로 현재 언어 사전을
// 받아 nested path (t.shell.nav.packs) 형태로 접근.
//
// preferences.language 가 바뀌면 useSyncExternalStore 가 자동 리렌더 —
// usePreferences 가 그 동작 보장.

import { getPreferences, usePreferences } from "@/lib/preferences";
import { MESSAGES_KO, type Messages } from "./messages.ko";
import { MESSAGES_EN } from "./messages.en";

export type { Messages };

// React 컴포넌트에서 사용. preferences.language 변경 시 자동 리렌더.
export function useT(): Messages {
  const lang = usePreferences().language;
  return lang === "en" ? MESSAGES_EN : MESSAGES_KO;
}

// 컴포넌트 외부 (이벤트 핸들러 / module-level 함수 등) 에서 사용.
// 호출 시점의 언어 스냅샷 반환 — 리액티브하지 X.
export function getT(): Messages {
  return getPreferences().language === "en" ? MESSAGES_EN : MESSAGES_KO;
}

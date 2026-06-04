// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Persisted to localStorage so reload-survives changes the user made.

import { useSyncExternalStore } from "react";
import type { PitchCategory } from "@/lib/pitch/types";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

// 안정성 우선 정정 (2026-04-30): WebLLM 모드 일시 폐기. @mlc-ai/web-llm
// ES module 호환 문제로 런타임 깨짐 → Gemini만 안정. webllm-only 옵션은
// 인프라/모델이 안정화되면 다시 노출.
//
// 현 시점 LLMProvider는 단일 값이지만 type을 union으로 유지해 미래에 옵션
// 추가가 type-level 변경 없이 가능하게.
//
// hydrate 시 이전에 "webllm-first" 또는 "webllm-only"가 박혀 있었으면
// 모두 "gemini-only"로 마이그레이션 — 사용자가 깨진 설정으로 응답을
// 못 받는 회귀 차단.
export type LLMProvider = "gemini-only";

export type PitchPrefs = {
  enabled: boolean;
  // Empty list = no pitches even if enabled. Mirrors the "opt-in per
  // category" model — user must check the boxes they're OK with.
  categories: PitchCategory[];
};

export type Preferences = {
  homePriority: HomePriority;
  defaultMode: DefaultMode;
  // ordered list of pack ids — first one shows up first on home + sidebar
  packOrder: string[];
  pitch: PitchPrefs;
  llmProvider: LLMProvider;
  // Show/hide the small "내 기기 (WebLLM)" / "클라우드 (Gemini)" badge
  // under each LLM-generated bubble. Default true for the demo so the
  // viewer can see where each answer came from; flipping it off cleans
  // up the chat UI for everyday use. No settings UI yet — toggle is
  // surfaced once we move past the demo phase.
  showLLMProvenance: boolean;
  // Phase EN-1: UI 언어. 사용자 입력이 없는 화면(스도쿠 / SAT / RecipeCard)이
  // 어떤 언어로 라벨을 렌더할지 결정. chat 흐름은 입력 detectLanguage 가 우선.
  // 첫 hydrate 시 navigator.language 가 "en"으로 시작하면 자동 "en", 아니면
  // "ko". Settings UI 토글은 Phase 2.
  language: "ko" | "en";
};

const STORAGE_KEY = "dots-preferences";

const DEFAULTS: Preferences = {
  homePriority: "balanced",
  defaultMode: "calm",
  packOrder: ["cooking-essentials", "study-companion", "sudoku", "morning-routine"],
  pitch: { enabled: false, categories: [] },
  llmProvider: "gemini-only",
  showLLMProvenance: true,
  language: "ko",
};

let prefs: Preferences = DEFAULTS;
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error("[preferences] persist failed", err);
  }
}

export function hydratePreferences(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Phase EN-1: 저장된 language 없으면 navigator.language 으로 첫 init.
    // "en"으로 시작하는 locale 이면 "en" — Chrome/Safari 모두 "en-US"/"en-GB"
    // 형태로 전달. 그 외 (한국어 ko-KR, 일본어 등) 모두 "ko" 로 default.
    // 저장된 값이 있으면 그대로 유지 (사용자가 한 번 정한 선택을 존중).
    const detectedLang: "ko" | "en" =
      typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")
        ? "en"
        : "ko";

    if (!raw) {
      prefs = { ...DEFAULTS, language: detectedLang };
      emit();
      return;
    }
    const parsed = JSON.parse(raw) as Partial<Preferences> & { llmProvider?: string };
    // 마이그레이션: 어떤 stale 값(webllm-first / webllm-only)이든 모두
    // gemini-only로 강제. WebLLM 일시 비활성화.
    const llmProvider: LLMProvider = "gemini-only";
    const migrated = parsed.llmProvider !== undefined && parsed.llmProvider !== llmProvider;
    // Merge so newly-added preference fields fall through to defaults for
    // returning users. language 가 미박힘 (기존 사용자) 이면 navigator 감지 값
    // 적용 — 한 번 박히면 그 후 hydrate 에선 그대로 유지.
    prefs = {
      ...DEFAULTS,
      ...parsed,
      llmProvider,
      pitch: { ...DEFAULTS.pitch, ...(parsed.pitch ?? {}) },
      language: parsed.language ?? detectedLang,
    };
    if (migrated || parsed.language === undefined) persist();
    emit();
  } catch (err) {
    console.error("[preferences] hydrate failed", err);
  }
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
    () => prefs,
  );
}

export function getPreferences(): Preferences {
  return prefs;
}

export function setPreferences(patch: Partial<Preferences>) {
  prefs = { ...prefs, ...patch };
  emit();
  persist();
}

export function setLLMProvider(provider: LLMProvider) {
  setPreferences({ llmProvider: provider });
}

// Phase EN-1: 화면 측 UI 언어 헬퍼. 입력이 없는 화면(스도쿠/SAT/RecipeCard)이
// 이걸 읽어 라벨 분기. chat 흐름은 입력 detectLanguage 가 우선.
export function getUILanguage(): "ko" | "en" {
  return prefs.language;
}

// Phase 2 i18n 토글 setter. preferences store 갱신 → emit → useSyncExternalStore
// 구독자 (useT 훅 포함) 모두 자동 리렌더 → 전체 트리 영어/한국어 즉시 전환.
export function setLanguage(language: "ko" | "en") {
  setPreferences({ language });
}

export function setPitchPrefs(patch: Partial<PitchPrefs>) {
  prefs = { ...prefs, pitch: { ...prefs.pitch, ...patch } };
  emit();
  persist();
}

export function movePack(id: string, direction: "up" | "down") {
  const idx = prefs.packOrder.indexOf(id);
  if (idx < 0) return;
  const next = [...prefs.packOrder];
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= next.length) return;
  [next[idx], next[swap]] = [next[swap], next[idx]];
  setPreferences({ packOrder: next });
}

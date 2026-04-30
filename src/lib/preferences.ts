// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Persisted to localStorage so reload-survives changes the user made.

import { useSyncExternalStore } from "react";
import type { PitchCategory } from "@/lib/pitch/types";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

// 어느 LLM으로 응답을 만들지. 두 모드만 노출:
//   "gemini-only" (default) — 외부 API. 정확하고 자연스러운 응답이 기본
//                             값. 사용자에게 부정확한 온디바이스 응답을
//                             강제하지 않는다.
//   "webllm-only"           — 외부 호출 X. 모델 다운로드 필수. 사적 영역
//                             가치를 의식적으로 선택한 사용자용.
//
// 이전 "webllm-first" 옵션은 폐기. WebLLM ↔ Gemini 자동 fallback이
// 사용자 입장에서 응답 품질을 예측 불가능하게 만들었고 ("양자역학" 2줄
// 환각 vs 풍부한 설명이 무작위로 섞임), 헌법 "사용자 명시 X 자동 작동"
// 룰에도 어긋났다. hydrate 시 stale "webllm-first" 값은 "gemini-only"로
// 마이그레이션.
export type LLMProvider = "gemini-only" | "webllm-only";

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
};

const STORAGE_KEY = "dots-preferences";

const DEFAULTS: Preferences = {
  homePriority: "balanced",
  defaultMode: "calm",
  packOrder: [
    "cooking-essentials",
    "study-companion",
    "morning-routine",
    "focus-writer",
    "wine-cellar",
    "code-review",
  ],
  pitch: { enabled: false, categories: [] },
  llmProvider: "gemini-only",
  showLLMProvenance: true,
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
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Preferences> & { llmProvider?: string };
    // 마이그레이션: stale "webllm-first" 값(또는 알 수 없는 값)은 새 기본값
    // "gemini-only"로 강제. 사용자가 부정확한 응답을 의식 없이 받지 않게.
    let llmProvider: LLMProvider = DEFAULTS.llmProvider;
    if (parsed.llmProvider === "gemini-only" || parsed.llmProvider === "webllm-only") {
      llmProvider = parsed.llmProvider;
    }
    const migrated = parsed.llmProvider !== undefined && parsed.llmProvider !== llmProvider;
    // Merge so newly-added preference fields fall through to defaults for
    // returning users.
    prefs = {
      ...DEFAULTS,
      ...parsed,
      llmProvider,
      pitch: { ...DEFAULTS.pitch, ...(parsed.pitch ?? {}) },
    };
    if (migrated) persist();
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

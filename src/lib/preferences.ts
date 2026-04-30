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
    // 마이그레이션: 어떤 stale 값(webllm-first / webllm-only)이든 모두
    // gemini-only로 강제. WebLLM 일시 비활성화.
    const llmProvider: LLMProvider = "gemini-only";
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

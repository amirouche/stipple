// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Persisted to localStorage so reload-survives changes the user made.

import { useSyncExternalStore } from "react";
import type { PitchCategory } from "@/lib/pitch/types";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

// Which LLM the dispatch layer should reach for. "webllm-first" is the
// constitution-aligned default — try the on-device engine, fall back to
// Gemini only if it's not loaded. "gemini-only" disables WebLLM entirely
// (lets users skip the 1.8GB download). "webllm-only" forbids the cloud
// call — useful for the "이 기기 안에서" demo path; surfaces an error if
// the model isn't loaded instead of quietly hitting the network.
export type LLMProvider = "webllm-first" | "gemini-only" | "webllm-only";

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
  llmProvider: "webllm-first",
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
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    // Merge so newly-added preference fields fall through to defaults for
    // returning users.
    prefs = {
      ...DEFAULTS,
      ...parsed,
      pitch: { ...DEFAULTS.pitch, ...(parsed.pitch ?? {}) },
    };
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

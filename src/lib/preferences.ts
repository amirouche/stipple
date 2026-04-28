// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Persisted to localStorage so reload-survives changes the user made.

import { useSyncExternalStore } from "react";
import type { PitchCategory } from "@/lib/pitch/types";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

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

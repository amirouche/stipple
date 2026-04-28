// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Persisted to localStorage so reload-survives changes the user made.

import { useSyncExternalStore } from "react";
import type { AdCategory } from "@/lib/promo/types";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

export type AdPrefs = {
  enabled: boolean;
  // Empty list = no ads even if enabled. Mirrors the "opt-in per category"
  // model — user must check the boxes they're OK with.
  categories: AdCategory[];
};

export type Preferences = {
  homePriority: HomePriority;
  defaultMode: DefaultMode;
  // ordered list of pack ids — first one shows up first on home + sidebar
  packOrder: string[];
  ads: AdPrefs;
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
  ads: { enabled: false, categories: [] },
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
      ads: { ...DEFAULTS.ads, ...(parsed.ads ?? {}) },
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

export function setAdPrefs(patch: Partial<AdPrefs>) {
  prefs = { ...prefs, ads: { ...prefs.ads, ...patch } };
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

// Global UI preferences for DOTS — visible in Settings, read in the home view.
// Keeps things simple: no persistence yet, just a React store.

import { useSyncExternalStore } from "react";

export type HomePriority = "memory-first" | "packs-first" | "balanced";
export type DefaultMode = "calm" | "fast" | "deep";

export type Preferences = {
  homePriority: HomePriority;
  defaultMode: DefaultMode;
  // ordered list of pack ids — first one shows up first on home + sidebar
  packOrder: string[];
};

let prefs: Preferences = {
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
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
    () => prefs
  );
}

export function setPreferences(patch: Partial<Preferences>) {
  prefs = { ...prefs, ...patch };
  emit();
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

// Wake alarms store. localStorage-backed (small payload, sync access fits).
// Same useSyncExternalStore pattern as the rest of the codebase so settings
// pages and the scheduler subscribe identically.

import { useSyncExternalStore } from "react";
import type { WakeAlarm } from "./types";

const STORAGE_KEY = "dots-wake-alarms";

const DEFAULT_ALARMS: WakeAlarm[] = [
  { id: "morning", kind: "morning", time: "07:00", enabled: true, tone: "warm" },
  { id: "lunch", kind: "lunch", time: "12:00", enabled: false, tone: "brief" },
  { id: "evening", kind: "evening", time: "19:00", enabled: false, tone: "calm" },
  { id: "bedtime", kind: "bedtime", time: "23:00", enabled: false, tone: "calm" },
  {
    id: "homecoming",
    kind: "homecoming",
    time: "20:00",
    enabled: false,
    tone: "warm",
    minBackgroundHours: 2,
    activeWindowStart: "17:00",
    activeWindowEnd: "23:00",
  },
];

let state: WakeAlarm[] = DEFAULT_ALARMS;
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("[wake] persist failed", err);
  }
}

export function hydrateWakeStore(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") {
    emit();
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      emit();
      return;
    }
    const parsed = JSON.parse(raw) as WakeAlarm[];
    // Merge with defaults — if a new alarm kind ships later, existing users
    // pick it up automatically. Persisted records win for ids they cover.
    const byId = new Map(parsed.map((a) => [a.id, a]));
    state = DEFAULT_ALARMS.map((d) => byId.get(d.id) ?? d);
    emit();
  } catch (err) {
    console.error("[wake] hydrate failed", err);
    emit();
  }
}

export function useWakeAlarms(): WakeAlarm[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

export function getWakeAlarms(): WakeAlarm[] {
  return state;
}

export function updateAlarm(id: string, patch: Partial<WakeAlarm>): void {
  state = state.map((a) => (a.id === id ? { ...a, ...patch } : a));
  emit();
  persist();
}

export function markFiredToday(id: string, day: string): void {
  updateAlarm(id, { lastFiredOn: day });
}

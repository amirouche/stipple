// Wake scheduler — checks alarms on app mount, on visibilitychange, and on
// the first user interaction (so speech, which most browsers gate behind a
// gesture, can actually fire). No setInterval.
//
// MAX_LATE_MINUTES caps "fire if missed" — we don't want to greet someone
// in the morning when they open the app at midnight. Within the window, an
// alarm that's already fired today is skipped via the per-day dedupe in
// the store.

import { getMemorySnapshot } from "@/lib/memory";
import { composeWakeMessage } from "./messages";
import { getWakeAlarms, markFiredToday } from "./store";
import { speak } from "./voice";

const MAX_LATE_MINUTES = 120;

function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowToMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number(s) || 0);
  return h * 60 + m;
}

function topActiveTopic(): string | undefined {
  const snap = getMemorySnapshot();
  return snap.memories
    .filter((m) => m.state === "active")
    .sort((a, b) => b.accessCount - a.accessCount)[0]?.topic;
}

export function checkWakeAlarms(): void {
  const now = new Date();
  const nowMin = nowToMinutes(now);
  const today = todayKey(now);

  for (const alarm of getWakeAlarms()) {
    if (!alarm.enabled) continue;
    if (alarm.lastFiredOn === today) continue;

    const alarmMin = timeToMinutes(alarm.time);
    const lateBy = nowMin - alarmMin;
    if (lateBy < 0 || lateBy > MAX_LATE_MINUTES) continue;

    const text = composeWakeMessage(alarm, { topicMention: topActiveTopic() });
    const fired = speak(text);
    if (fired) markFiredToday(alarm.id, today);
    else {
      // Speech blocked (no user gesture yet). Don't mark fired so the next
      // interaction-triggered check can retry.
      console.warn("[wake] speech blocked — will retry on next interaction");
    }
  }
}

let registered = false;

export function registerWakeScheduler(): void {
  if (registered) return;
  if (typeof document === "undefined") return;
  registered = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkWakeAlarms();
    }
  });

  // First user gesture unlocks Web Speech in most browsers — that's also the
  // earliest point we can actually fire any alarm queued from page load.
  const onFirstInteract = () => {
    checkWakeAlarms();
    document.removeEventListener("click", onFirstInteract);
    document.removeEventListener("keydown", onFirstInteract);
  };
  document.addEventListener("click", onFirstInteract);
  document.addEventListener("keydown", onFirstInteract);
}

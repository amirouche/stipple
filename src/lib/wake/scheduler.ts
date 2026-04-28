// Wake scheduler — checks alarms on app mount, on visibilitychange, and on
// the first user interaction (so speech, which most browsers gate behind a
// gesture, can actually fire). No setInterval.
//
// MAX_LATE_MINUTES caps "fire if missed" — we don't want to greet someone
// in the morning when they open the app at midnight. Within the window, an
// alarm that's already fired today is skipped via the per-day dedupe in
// the store.
//
// "homecoming" is the odd one out: instead of a clock target, it watches
// document.visibilityState. When the tab returns to "visible" after being
// hidden long enough (and inside the user's active window), we treat it as
// a real return-home signal. Brief tab switches and bathroom-length away
// don't trip it because of the minBackgroundHours floor.

import { getMemorySnapshot } from "@/lib/memory";
import { composeWakeMessage } from "./messages";
import { getWakeAlarms, markFiredToday } from "./store";
import type { WakeAlarm } from "./types";
import { speak } from "./voice";

const MAX_LATE_MINUTES = 120;
const HIDDEN_AT_KEY = "dots-wake-hidden-at";

function getHiddenAt(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(HIDDEN_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setHiddenAt(ts: number | null): void {
  if (typeof sessionStorage === "undefined") return;
  if (ts === null) sessionStorage.removeItem(HIDDEN_AT_KEY);
  else sessionStorage.setItem(HIDDEN_AT_KEY, String(ts));
}

function inActiveWindow(now: Date, startHHmm: string, endHHmm: string): boolean {
  const nowMin = nowToMinutes(now);
  const startMin = timeToMinutes(startHHmm);
  const endMin = timeToMinutes(endHHmm);
  // Same-day window only (defaults are evening/night). Wrapping past midnight
  // isn't supported — keep it simple until a real use case shows up.
  return nowMin >= startMin && nowMin <= endMin;
}

function shouldFireHomecoming(alarm: WakeAlarm, now: Date, hiddenAt: number | null): boolean {
  if (hiddenAt === null) return false;
  const elapsedHours = (now.getTime() - hiddenAt) / 3_600_000;
  if (elapsedHours < (alarm.minBackgroundHours ?? 2)) return false;
  return inActiveWindow(now, alarm.activeWindowStart ?? "17:00", alarm.activeWindowEnd ?? "23:00");
}

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
  const hiddenAt = getHiddenAt();

  for (const alarm of getWakeAlarms()) {
    if (!alarm.enabled) continue;
    if (alarm.lastFiredOn === today) continue;

    if (alarm.kind === "homecoming") {
      if (!shouldFireHomecoming(alarm, now, hiddenAt)) continue;
    } else {
      const alarmMin = timeToMinutes(alarm.time);
      const lateBy = nowMin - alarmMin;
      if (lateBy < 0 || lateBy > MAX_LATE_MINUTES) continue;
    }

    const text = composeWakeMessage(alarm, { topicMention: topActiveTopic() });
    const fired = speak(text);
    if (fired) {
      markFiredToday(alarm.id, today);
      // Consume the hiddenAt signal so a later quick tab-switch doesn't
      // immediately retry. The per-day dedupe also blocks it, but clearing
      // here keeps state clean.
      if (alarm.kind === "homecoming") setHiddenAt(null);
    } else {
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
    if (document.visibilityState === "hidden") {
      // Stamp the moment the tab went background. Each new hidden event
      // overwrites — a brief mid-trip return resets the clock, which is what
      // we want: "오늘도 수고했어" only makes sense after a continuous away.
      setHiddenAt(Date.now());
    } else if (document.visibilityState === "visible") {
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

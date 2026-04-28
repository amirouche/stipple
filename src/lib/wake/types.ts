// Proactive wake / greeting alarms.
//
// v1 fires speech via the Web Speech API when the page is open at the alarm
// time (or up to MAX_LATE_MINUTES later). Privacy-first: the message never
// includes message contents — only counts/topics from the local memory layer
// and a numeric placeholder the user provides.

export type WakeKind = "morning" | "lunch" | "evening" | "bedtime";
export type WakeTone = "calm" | "brief" | "warm";

export type WakeAlarm = {
  id: string;
  kind: WakeKind;
  // 24-hour HH:mm
  time: string;
  enabled: boolean;
  tone: WakeTone;
  // YYYY-MM-DD of the last day this alarm fired — used to dedupe within a day.
  lastFiredOn?: string;
};

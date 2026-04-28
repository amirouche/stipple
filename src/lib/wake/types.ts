// Proactive wake / greeting alarms.
//
// v1 fires speech via the Web Speech API when the page is open at the alarm
// time (or up to MAX_LATE_MINUTES later). Privacy-first: the message never
// includes message contents — only counts/topics from the local memory layer
// and a numeric placeholder the user provides.

export type WakeKind = "morning" | "lunch" | "evening" | "bedtime" | "homecoming";
export type WakeTone = "calm" | "brief" | "warm";

export type WakeAlarm = {
  id: string;
  kind: WakeKind;
  // 24-hour HH:mm. For homecoming this is unused (visibility-driven, not
  // time-driven) but kept on the type so the field shape stays uniform.
  time: string;
  enabled: boolean;
  tone: WakeTone;
  // YYYY-MM-DD of the last day this alarm fired — used to dedupe within a day.
  lastFiredOn?: string;
  // Homecoming-only configuration. Ignored for other kinds.
  // - minBackgroundHours: tab must have been hidden at least this long for the
  //   visibility "back" event to count as a real homecoming (vs. brief tab
  //   switch). Defaults to 2.
  // - activeWindowStart / activeWindowEnd: only fire if local clock is within
  //   this window when the user comes back. Defaults to 17:00 ~ 23:00.
  minBackgroundHours?: number;
  activeWindowStart?: string;
  activeWindowEnd?: string;
};

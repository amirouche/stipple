// DOTS micro-pitches (DTC GIF promotions).
//
// The whole point: pitches live on-device. Matching runs against the user's
// local topics, the GIF blob is cached in IndexedDB, and the LLM never
// sees the pitch. The advertiser receives no signal until (and unless) the
// user taps through.

export type PitchCategory = "kimchi" | "cooking" | "book" | "health" | "drink";

// How long the advertiser bought the slot. Informational only in v1 — used
// in Settings to communicate the flat-fee model. v2 would actually expire
// pitches past their period.
export type PitchDisplayPeriod = "weekly" | "monthly";

export type Pitch = {
  id: string;
  brand: string;
  category: PitchCategory;
  // 2~3 second loop. Path is relative to /public.
  gifPath: string;
  // Substrings checked against the user's extracted topics + raw query.
  contextHints: string[];
  // Display duration label (seconds) — UI only, the GIF loops naturally.
  duration: number;
  // Where the user lands on tap. Optional — some are brand-only.
  ctaUrl?: string;
  // Short tagline shown next to the GIF.
  tagline: string;
  // Flat-fee window the advertiser purchased.
  displayPeriod: PitchDisplayPeriod;
};

// Per-pitch on-device counters. Never leaves the device.
export type PitchStats = {
  pitchId: string;
  views: number;
  taps: number;
  lastViewAt?: number;
};

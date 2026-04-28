// DOTS micro-ads (DTC GIF ads).
//
// The whole point: ads live on-device. Matching runs against the user's
// local topics, the GIF blob is cached in IndexedDB, and the LLM never
// sees the ad. The advertiser receives no signal until (and unless) the
// user taps through.

export type AdCategory = "kimchi" | "cooking" | "book" | "health" | "drink";

// How long the advertiser bought the slot. Informational only in v1 — used
// in Settings to communicate the flat-fee model. v2 would actually expire
// ads past their period.
export type AdDisplayPeriod = "weekly" | "monthly";

export type Ad = {
  id: string;
  brand: string;
  category: AdCategory;
  // 2~3 second loop. Path is relative to /public.
  gifPath: string;
  // Substrings checked against the user's extracted topics + raw query.
  contextHints: string[];
  // Display duration label (seconds) — UI only, the GIF loops naturally.
  duration: number;
  // Where the user lands on tap. Optional — some ads are brand-only.
  ctaUrl?: string;
  // Short tagline shown next to the GIF.
  tagline: string;
  // Flat-fee window the advertiser purchased.
  displayPeriod: AdDisplayPeriod;
};

// Per-ad on-device counters. Never leaves the device.
export type AdStats = {
  adId: string;
  impressions: number;
  clicks: number;
  lastImpressionAt?: number;
};

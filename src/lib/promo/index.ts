export type { Ad, AdCategory, AdDisplayPeriod, AdStats } from "./types";
export { AD_CATEGORIES, AD_DATA } from "./data";
export {
  hydrateAdCache,
  getAds,
  getAdCount,
  dismissAd,
  getDismissedAds,
  recordImpression,
  recordClick,
  getAdStats,
  getAdStatFor,
  resetAdStats,
  useAdStats,
} from "./cache";
export { matchAd } from "./match";

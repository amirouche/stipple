// Seed ad inventory for the prototype.
//
// In production this would come from an ad rotation server (rotated weekly /
// monthly), prefetched and cached on-device. For the demo we ship 5 ads
// covering the categories users can opt into. GIF assets land under
// /public/promo/ — until those assets exist, SponsorCard falls back to a
// styled placeholder so the demo still reads. The /promo/ prefix (rather
// than /ads/) is deliberate: adblockers like uBlock auto-block any URL
// path containing "ads" or "advertisement", which would kill the demo on
// a normal Chrome window.

import type { Ad, AdCategory } from "./types";

export const AD_CATEGORIES: { id: AdCategory; label: string }[] = [
  { id: "kimchi", label: "김치 / 발효" },
  { id: "cooking", label: "요리 / 양념" },
  { id: "book", label: "도서 / 학습" },
  { id: "health", label: "건강 / 비타민" },
  { id: "drink", label: "음료 / 카페" },
];

export const AD_DATA: Ad[] = [
  {
    id: "kimchimyeongga-mukunji",
    brand: "김치명가",
    category: "kimchi",
    gifPath: "/promo/kimchimyeongga.gif",
    contextHints: ["김치", "김치찌개", "찌개", "묵은지", "발효"],
    duration: 3,
    ctaUrl: "https://example.com/kimchimyeongga",
    tagline: "묵은지 한 포기 — 오래 끓일수록 깊어지는 맛",
    displayPeriod: "monthly",
  },
  {
    id: "paikseason-yangnyeom",
    brand: "백종원 양념장",
    category: "cooking",
    gifPath: "/promo/paikseason.gif",
    contextHints: ["양념", "요리", "찌개", "고기", "레시피", "cook", "recipe"],
    duration: 2,
    ctaUrl: "https://example.com/paikseason",
    tagline: "한 스푼이면 끝 — 30분 요리 양념",
    displayPeriod: "weekly",
  },
  {
    id: "aladin-fall-reading",
    brand: "알라딘",
    category: "book",
    gifPath: "/promo/aladin.gif",
    contextHints: ["공부", "설명", "책", "study", "homework", "도서"],
    duration: 3,
    ctaUrl: "https://example.com/aladin",
    tagline: "가을 독서 — 베스트셀러 30% 할인",
    displayPeriod: "monthly",
  },
  {
    id: "yuhan-vita",
    brand: "유한양행",
    category: "health",
    gifPath: "/promo/yuhan.gif",
    contextHints: ["피로", "피곤", "비타민", "건강", "잠", "수면", "스트레스"],
    duration: 2,
    ctaUrl: "https://example.com/yuhan",
    tagline: "하루 한 알 — 피로 회복 비타민B",
    displayPeriod: "monthly",
  },
  {
    id: "starbucks-newmenu",
    brand: "스타벅스",
    category: "drink",
    gifPath: "/promo/starbucks.gif",
    contextHints: ["커피", "스타벅스", "음료", "카페", "라떼"],
    duration: 2,
    ctaUrl: "https://example.com/starbucks",
    tagline: "신메뉴 — 가을 한정 라떼",
    displayPeriod: "weekly",
  },
];

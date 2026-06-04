// Lightweight "Continue from here" priority system.
// Picks at most 2 cards from recent threads, repeated topics, and packs.
// The card text reads as a continuation, not a recommendation.

import type { Thread, ThreadTheme } from "@/lib/conversation-store";
import type { Pack } from "@/lib/dots-data";
import { LOCAL_MEMORY, SAVED_RECIPES } from "@/lib/dots-data";

export type ContinueCard = {
  id: string;
  label: string; // continuation phrasing
  sub: string; // small supporting line
  prompt: string; // text to send when picked
  score: number;
  source: "thread" | "topic" | "pack";
};

// Mock signals we don't track in the store yet — kept here so scoring works
// end-to-end without expanding the rest of the app surface.
const RECENTLY_USED_PACK_IDS = new Set<string>(["cooking-essentials"]);
const RECENTLY_INSTALLED_PACK_IDS = new Set<string>(["study-companion"]);
// Pretend a couple of saved recipes are linked to a thread theme.
const SAVED_LINK_BY_TOPIC: Record<string, number> = {
  요리: 2, // saved memory link
  공부: 1, // archive memory link
};

// Simulated "how many times has this topic come up recently".
// Real implementation would derive this from message history.
const TOPIC_COUNT: Record<string, number> = {
  점심: 3,
  김치찌개: 3,
  요리: 2,
  공부: 2,
  어텐션: 2,
};

const ONE_DAY = 1000 * 60 * 60 * 24;

function isToday(ts: number) {
  return Date.now() - ts < ONE_DAY;
}

function continuationFor(
  theme: ThreadTheme,
  title: string,
): { label: string; sub: string; prompt: string } {
  switch (theme) {
    case "cooking":
      return {
        label: `${title} 쪽으로 이어볼까`,
        sub: "저장해둔 것부터 다시 볼게.",
        prompt: `전에 보던 ${title} 다시 보여줘`,
      };
    case "study":
      return {
        label: `아까 하던 ${title} 이어서 볼까`,
        sub: "막혔던 데부터.",
        prompt: `${title} 이어서 설명`,
      };
    case "routine":
      return {
        label: `${title} 흐름 그대로 이어갈까`,
        sub: "남은 일정만 가볍게.",
        prompt: `${title} 이어서`,
      };
    default:
      return {
        label: `${title} 이어서 볼까`,
        sub: "끊긴 데부터.",
        prompt: `${title} 이어서`,
      };
  }
}

export function buildContinuations(threads: Thread[], installedPacks: Pack[]): ContinueCard[] {
  const cards = new Map<string, ContinueCard>();

  // ---- 1. Recent conversations -------------------------------------------
  const sortedThreads = [...threads]
    .filter((t) => t.title && t.title !== "새 대화")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  sortedThreads.forEach((t, idx) => {
    let score = 0;
    if (idx === 0) score += 5; // last conversation
    if (isToday(t.updatedAt)) score += 3;
    // linked memory bonuses (mocked via theme → topic map)
    const link = SAVED_LINK_BY_TOPIC[t.title];
    if (link === 2) score += 2;
    if (link === 1) score += 1;

    if (score <= 0) return;
    const { label, sub, prompt } = continuationFor(t.theme, t.title);
    cards.set(`thread:${t.id}`, {
      id: `thread:${t.id}`,
      label,
      sub,
      prompt,
      score,
      source: "thread",
    });
  });

  // ---- 2. Repeated recent topics -----------------------------------------
  const topics = Array.from(new Set([...LOCAL_MEMORY.recentTopics, ...Object.keys(TOPIC_COUNT)]));

  for (const topic of topics) {
    const count = TOPIC_COUNT[topic] ?? 0;
    let score = 0;
    if (count >= 3) score += 5;
    else if (count >= 2) score += 3;
    if (score <= 0) continue;

    // saved-memory link: any saved recipe whose title contains the topic
    const linked = SAVED_RECIPES.filter((r) => r.title.includes(topic));
    if (linked.length > 0) score += 2;

    const phrasing =
      topic === "김치찌개"
        ? {
            label: "김치찌개 쪽으로 이어볼까",
            sub: "저장해둔 두 가지가 있어.",
            prompt: "전에 저장한 김치찌개 보여줘",
          }
        : topic === "점심"
          ? {
              label: "냉장고에 있는 걸 기준으로 다시 볼 수 있어",
              sub: "남은 재료부터 살펴볼게.",
              prompt: "냉장고에 있는 걸로 점심 뭐 먹지",
            }
          : topic === "공부"
            ? {
                label: "아까 하던 공부 이어서 볼까",
                sub: "막혔던 부분부터.",
                prompt: "공부 이어서",
              }
            : {
                label: `${topic} 쪽으로 이어볼까`,
                sub: "지난 흐름 그대로.",
                prompt: `${topic} 이어서`,
              };

    const key = `topic:${topic}`;
    const existing = cards.get(key);
    if (!existing || existing.score < score) {
      cards.set(key, {
        id: key,
        ...phrasing,
        score,
        source: "topic",
      });
    }
  }

  // ---- 3. Recently used or installed packs --------------------------------
  for (const pack of installedPacks) {
    let score = 0;
    if (RECENTLY_USED_PACK_IDS.has(pack.id)) score += 3;
    if (RECENTLY_INSTALLED_PACK_IDS.has(pack.id)) score += 2;
    if (score <= 0) continue;

    const phrasing =
      pack.id === "cooking-essentials"
        ? {
            label: "요리 쪽 흐름 그대로 이어갈까",
            sub: "Cooking Essentials가 켜져 있어.",
            prompt: "오늘 저녁 뭐 만들지",
          }
        : pack.id === "study-companion"
          ? {
              label: "공부 흐름 이어서 볼까",
              sub: "방금 깐 Study Companion으로.",
              prompt: "공부 이어서 설명",
            }
          : {
              label: `${pack.name} 쪽으로 이어볼까`,
              sub: "최근에 쓴 흐름 그대로.",
              prompt: `${pack.name} 이어서`,
            };

    const key = `pack:${pack.id}`;
    cards.set(key, {
      id: key,
      ...phrasing,
      score,
      source: "pack",
    });
  }

  // Sort by score desc, then deduplicate by label so we don't surface two
  // cards that read the same way.
  const seenLabels = new Set<string>();
  const ranked = Array.from(cards.values())
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      if (seenLabels.has(c.label)) return false;
      seenLabels.add(c.label);
      return true;
    });

  // Cap at 2 — the whole point is to not feel like a feed.
  return ranked.slice(0, 2);
}

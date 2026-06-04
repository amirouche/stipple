// Phase 2 i18n — 영어 사전. messages.ko.ts 의 Messages 타입을 satisfies 로
// 강제 매칭 — KO 에 키 추가 후 EN 미추가 시 tsc 빌드 단계에서 실패.

import type { Messages } from "./messages.ko";

export const MESSAGES_EN: Messages = {
  toggle: { korean: "한국어", english: "English" },

  shell: {
    nav: {
      packs: "Packs",
      store: "Pack Store",
      memory: "Memory",
      settings: "Settings",
      demo: "Demo Metrics",
    },
    newThread: "New chat",
    newThreadDefaultTitle: "New chat",
    sectionChats: "Chats",
    sectionSystem: "System",
    emptyTitle: "No conversations yet.",
    emptyHint: "Hit + above to start one.",
    deviceBadge: "On this device",
    menuOpen: "Open menu",
    relTime: {
      justNow: "just now",
      minutesAgo: (m: number) => `${m}m ago`,
      hoursAgo: (h: number) => `${h}h ago`,
      daysAgo: (d: number) => `${d}d ago`,
    },
  },

  home: {
    tagline: "DOTS — your local AI. Tone follows your language.",
    chipTitleFolder: (name: string) => `Open ${name} folder`,
    chipTitleCards: (name: string) => `View ${name} card`,
    composerPlaceholder: "Talk to DOTS",
    send: "Send",
  },

  packs: {
    eyebrow: "Pack Library",
    title: "Packs",
    subtitle:
      "Packs are small execution units. Each one changes how DOTS reads and organizes the same question, in one area.",
    detailsMore: "More details",
    install: "Install",
    uninstall: "Uninstall",
    pause: "Pause",
    activate: "Activate",
    categories: {
      all: "All",
      game: "Game",
      education: "Education",
      lifestyle: "Lifestyle",
    },
    state: {
      notInstalled: "Not installed",
      active: "Active",
      idle: "Idle",
    },
    behaviorLines: {
      cookingEssentials: "Reformats food questions into ingredients, steps, and timing.",
      studyCompanion: "Walks through it step by step and asks where you got stuck.",
      sudoku:
        "After each round, looks at your result and adjusts the next puzzle's difficulty one step.",
      morningRoutine: "Answers today's schedule and weather right on this device.",
    },
  },

  store: {
    eyebrow: "Marketplace",
    title: "Pack Store",
    subtitle:
      "Add more content and behavior patterns. Installed packs work in chat and matching right away.",
    searchPlaceholder: "Search packs, authors, topics",
    categories: {
      all: "All",
      learning: "Learning",
      cooking: "Cooking",
      lifestyle: "Lifestyle",
      work: "Work",
      entertainment: "Entertainment",
    },
    emptyTitle: "No packs available right now.",
    emptyDescription: "We've curated to working packs only. New packs are coming soon.",
    buttonInstalledRemove: "Installed — Remove",
    buttonFreeInstall: "Install (free)",
    buttonBuyInstall: "Buy & install",
    priceFree: "Free",
  },

  sudoku: {
    title: "Sudoku",
    description:
      "Solve one puzzle, DOTS remembers the result and adjusts the next puzzle's difficulty one step up or down. Same memory layer as chat — different screens, DOTS still follows you.",
    difficulty: "Difficulty",
    demoBoard: "Demo Board",
    demoTooltip: "Demo board with only 3 empty cells — for recording",
    newGame: "New Game",
    check: "Check",
    nextGame: "Next Game",
    clearTooltip: "Clear",
    incomplete: (n: number) =>
      `${n} empty ${n === 1 ? "cell" : "cells"} remaining. Fill the board first.`,
    solved: (time: string) => `Solved. 0 mistakes, ${time}.`,
    mistakes: (n: number, time: string) => `${n} mistake${n === 1 ? "" : "s"}, ${time}.`,
    nextAdjust: (diff: string) => `Next round adjusted to ${diff}.`,
    nextHold: (diff: string) => `Holding at ${diff}.`,
  },

  chat: {
    provider: {
      webllm: "On device (WebLLM) · 0 external calls",
      geminiCloud: "Cloud (outside Pack) · Gemini API",
      gemini: "Cloud (Gemini) · External API",
      learned: "Learned · From cache (0 external calls)",
    },
    suggestionFooter: {
      local: (packName: string) => `Matched in ${packName} · Local match`,
      store: "Found in Pack Store · Local match",
      create: "No content yet · could create one",
    },
    optionTitle: {
      llm: "This option triggers a cloud call",
      local: "Handled on this device",
    },
    rating: {
      liked: "✓ Liked",
      shownDifferent: "✓ Showed something else",
      like: "Like",
      different: "Different",
    },
    processingTrace: {
      deepWithPack: "Checked here first — a wider look should sharpen it.",
      deepWithoutPack: "What I have is fuzzy — let me check a bit more.",
    },
  },

  memory: {
    eyebrow: "Personal layer",
    title: "Memory",
    subtitle: "Not one bucket but four. Each one has its own role — you decide what to keep close.",
    shelves: {
      temporary: {
        name: "Temporary",
        desc: "Alive only inside the current conversation. Forgotten soon unless you save it.",
        badge: "Volatile",
        empty: "Empty for now. Bits passing through new chats land here.",
      },
      frequent: {
        name: "Frequent",
        desc: "Topics that came up across many chats. Kept close for quick recall.",
        badge: "Close",
        empty: "Nothing frequent yet. Repeated topics will surface here.",
      },
      saved: {
        name: "Saved",
        desc: "Things you saved yourself. Packs check here first when needed.",
        badge: "Pinned",
        empty: "Nothing saved yet.",
      },
      archive: {
        name: "Archive",
        desc: "Past conversation records. Not used for inference — there when you want to look back.",
        badge: "Storage only",
        empty: "Archive is empty. Old chats collect here over time.",
      },
    },
    accessCount: (topic: string, n: number) => `${topic} — ${n} mention${n === 1 ? "" : "s"}`,
    archiveItemCount: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
    relTime: {
      justNow: "just now",
      minutesAgo: (m: number) => `${m}m ago`,
      hoursAgo: (h: number) => `${h}h ago`,
      daysAgo: (d: number) => `${d}d ago`,
      weeksAgo: (w: number) => `${w}w ago`,
      monthDay: (month: number, day: number) => `${month}/${day}`,
      ymd: (y: number, m: number, d: number) => `${y}.${m}.${d}`,
    },
    archiveWindow: {
      today: "Today",
      yesterday: "Yesterday",
      daysAgo: (n: number) => `${n}d ago`,
      monthDayWeek: (month: number, day: number) => `Week of ${month}/${day}`,
      ymdWeek: (y: number, m: number, d: number) => `Week of ${y}.${m}.${d}`,
      thisWeek: "This week",
      lastWeek: "Last week",
      weeksAgo: (n: number) => `${n}w ago`,
      thisMonth: "This month",
      lastMonth: "Last month",
      monthOnly: (m: number) => `Month ${m}`,
      yearMonth: (y: number, m: number) => `${y}.${m}`,
      thisQuarter: "This quarter",
      thisYearSeason: (season: string) => `${season} this year`,
      yearSeason: (y: number, season: string) => `${season} ${y}`,
      thisYear: "This year",
      lastYear: "Last year",
      twoYearsAgo: "Two years ago",
      yearOnly: (y: number) => `${y}`,
    },
    seasons: { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" },
    footerLine1: "Stays on this device.",
    footerLine2: "Memory lives on this device. You can export the archive any time in Settings.",
  },

  settings: {
    eyebrow: "Environment",
    title: "Settings",
    homePriority: {
      title: "What shows first on the home view",
      desc: "Where DOTS starts when you open a new chat.",
      memoryFirst: {
        title: "Memory first",
        desc: "Pull from what we talked about before. Good for recurring topics.",
      },
      packsFirst: {
        title: "Packs first",
        desc: "Show active pack results first. Good for jumping into new tasks.",
      },
      balanced: { title: "Balanced", desc: "Whatever feels natural in the moment. Default." },
    },
    defaultMode: {
      title: "Default mode",
      desc: "Default length and pace for replies.",
      calm: { title: "Calm", desc: "Short and gentle. Stays out of the way." },
      fast: { title: "Fast", desc: "One-line answer first. Expand on request." },
      deep: { title: "Deep", desc: "Walk through step by step. Takes a bit longer." },
    },
    packOrder: {
      title: "Pack priority",
      desc: "Packs higher in the list appear first in the library and home.",
      installed: "Installed",
      notInstalled: "Not installed",
      moveUp: "Move up",
      moveDown: "Move down",
    },
    privacy: {
      title: "Privacy",
      badge: "On device",
      line1: "Your personalized data stays on this device.",
      line2:
        "Memory, pack settings, and learned habits are stored locally. Only when deeper reasoning is needed do prompts and pack signatures go to the base model.",
      telemetry: "Anonymous usage stats",
      telemetryDesc: "For pack improvement. Off by default.",
    },
    about: {
      title: "About DOTS",
      version: "Version",
      versionValue: "0.1.0 · prototype",
      baseModel: "Base model",
      baseModelValue: "Configurable",
      personalLayer: "Personal layer",
      personalLayerValue: "Local",
    },
    disabledCards: {
      webllmTitle: "On-device LLM",
      webllmStatus: "In progress",
      webllmDesc:
        "AI mode that runs inside the browser. External calls disappear but response detail drops. Temporarily disabled for stability work — all answers route through the default mode (cloud).",
      webllmFooter: "Next phase (beta) — restored after infra stabilizes",
      rerankerTitle: "Accuracy boost (V4.5)",
      rerankerStatus: "Next phase (beta)",
      rerankerDesc:
        "Cross-encoder reranking — a precise second pass on V4 embedding candidates. Hidden for now while we work on model compatibility. V4 semantic matching still works.",
    },
  },

  notFound: {
    code: "404",
    title: "Nothing routed here.",
    subtitle: "DOTS could not match this path to a local pack or known screen.",
    backToChat: "Back to chat",
  },

  study: {
    packFolder: "Pack folder",
    packShortSuffix:
      "Answer checking runs on this device. Cloud only kicks in for deeper explanations.",
    backToChat: "← Back to chat",
    backToFolder: "← Folder",
    problemsSuffix: (n: number) => `SAT Math · ${n} problem${n === 1 ? "" : "s"}`,
    newProblem: "New",
    retry: "Try again",
    showHint: "Show hint",
    hint: "Hint",
    correct: "Correct",
    incorrect: "Incorrect",
    chosenLabel: "Chosen",
    correctLabel: "Correct",
    showSolution: "Show solution",
    matchedLocal: "· Matched on this device",
    cloudFallback: "Not in the common-mistakes table. Want a deeper look from the cloud?",
    moreExplain: "Get a detailed explanation",
    loadingExplain: "Fetching explanation…",
    makeVariant: "Make a variant",
    loadingVariant: "Generating variant…",
    moreExplainSection: "Detailed explanation",
    variantSection: "Variant problem",
    cloudFailed: "Cloud call failed",
    cloudBadge: "Cloud",
    metaPrefix: "SAT Math",
  },
};

// Memory operating system — type model.
//
// v1 unit is topic-based (decision: keep simple, evolve later). The optional
// `content` slot is shaped as a discriminated union so a v2 fact-based unit
// can be added without breaking existing records.

export type MemoryState = "temporary" | "active" | "dormant" | "archived";

export type MemoryContent =
  | { kind: "topic"; text: string }
  | {
      kind: "fact";
      subject: string;
      predicate: string;
      object: string;
    };

export type EmotionSources = {
  // Auto-detected: repetition, emphasis ("정말", "진짜", "!"), pos/neg keywords.
  heuristic: number;
  // User-marked: 👍, "기억해줘", explicit save action. Weighted higher when
  // emotionScore is computed (see scoring rules in stage 2).
  explicit: number;
};

export type MemoryRecord = {
  id: string;
  topic: string;
  state: MemoryState;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  // Denormalized cache of (heuristic + explicit*W). Source of truth is
  // `emotionSources`; this field exists for sort/query without iteration.
  emotionScore: number;
  emotionSources: EmotionSources;
  sourceThreadId?: string;
  content?: MemoryContent;
};

export type ArchiveGranularity = "day" | "week" | "month" | "quarter" | "year";

export type ArchiveEntry = {
  id: string;
  granularity: ArchiveGranularity;
  windowStart: number;
  windowEnd: number;
  topics: { topic: string; count: number }[];
  sourceMemoryIds: string[];
  createdAt: number;
};

export type MetaRecord = {
  key: string;
  value: unknown;
  updatedAt: number;
};

// Wake message composition.
//
// Templates are grouped by alarm kind × tone. A small placeholder language
// lets memory context drip in: {topic} expands to the most-active local
// topic if any, otherwise the segment is dropped.

import type { WakeAlarm, WakeKind, WakeTone } from "./types";

type TemplateGroup = Record<WakeTone, string[]>;

const TEMPLATES: Record<WakeKind, TemplateGroup> = {
  morning: {
    warm: [
      "좋은 아침이야. 오늘도 천천히 시작하자.",
      "일어났어? {topicHint}",
      "잘 잤어? 어제 {topic} 얘기했던 거 기억나.",
      "아침이야. 오늘 하루도 가볍게.",
    ],
    brief: ["{time}이야.", "아침. 일어날 시간.", "기상 시간이야."],
    calm: [
      "천천히 일어나. 서두르지 마.",
      "조용한 아침이야. 따뜻한 물 한 잔.",
      "오늘은 어떻게 시작할까.",
    ],
  },
  lunch: {
    warm: ["점심 시간이야. 챙겨 먹어.", "{topicHint} 점심으로 어때?", "한숨 돌리고 점심 먹자."],
    brief: ["점심.", "12시야.", "먹을 시간."],
    calm: ["잠깐 멈추고 점심.", "급하지 않게 천천히 먹어.", "오전 수고했어. 점심 챙겨."],
  },
  evening: {
    warm: [
      "오늘 하루 어땠어? 저녁이야.",
      "수고했어. 오늘 {topic} 얘기 많이 했네.",
      "이제 좀 쉬자. 저녁이야.",
    ],
    brief: ["저녁.", "퇴근 시간.", "오늘은 여기까지."],
    calm: ["하루를 정리할 시간이야.", "오늘은 어떤 하루였어?", "저녁 공기 좋다. 천천히 가."],
  },
  bedtime: {
    warm: ["이제 자자. 오늘도 수고했어.", "잘 자. 내일 또 얘기하자.", "하루 마무리할 시간이야."],
    brief: ["자야 할 시간.", "굿나잇.", "잘 시간이야."],
    calm: [
      "조용히 하루를 닫자.",
      "내일은 또 새로운 날이야. 푹 쉬어.",
      "오늘 하루도 충분했어. 잘 자.",
    ],
  },
  homecoming: {
    warm: [
      "오늘도 수고했어요. 다녀왔어요?",
      "왔구나. 오늘 {topic} 얘기 했었는데, 잘 풀렸어?",
      "다녀왔어. 오늘 어땠어?",
    ],
    brief: ["왔어?", "수고했어요.", "다녀왔구나."],
    calm: [
      "오늘도 수고했어. 천천히 쉬어.",
      "어서 와. 오늘 하루 어땠어?",
      "이제 좀 쉬자. 다녀왔어요.",
    ],
  },
};

export type ComposeContext = {
  // Top active topic from memory store, if any.
  topicMention?: string;
  // The alarm's HH:mm — used by the {time} placeholder.
  time?: string;
};

function fillPlaceholders(template: string, ctx: ComposeContext): string {
  let out = template;
  // {topic} — bare topic word ("김치찌개")
  out = out.replace(/\{topic\}/g, ctx.topicMention ?? "그 얘기");
  // {topicHint} — softer phrasing including the topic, dropped if no topic
  if (ctx.topicMention) {
    out = out.replace(/\{topicHint\}/g, `${ctx.topicMention} 어때?`);
  } else {
    // Drop the placeholder along with any leading whitespace
    out = out.replace(/\s*\{topicHint\}\s*/g, " ").trim();
  }
  out = out.replace(/\{time\}/g, ctx.time ?? "");
  return out.replace(/\s+/g, " ").trim();
}

export function composeWakeMessage(alarm: WakeAlarm, ctx: ComposeContext = {}): string {
  const pool = TEMPLATES[alarm.kind][alarm.tone];
  const template = pool[Math.floor(Math.random() * pool.length)];
  return fillPlaceholders(template, { ...ctx, time: alarm.time });
}

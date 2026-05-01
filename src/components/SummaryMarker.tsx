// V5.0 Phase M-1 — 대화 요약 박힘을 알리는 시각 마커.
// thread 안 어느 시점부터 LLM이 raw history 대신 summary를 보는지 사용자에게
// 표시. 메시지 사이에 가로선 + 라벨 + 작은 메타 (요약된 메시지 수).

import type { ConversationSummary } from "@/lib/memory/types";

export function SummaryMarker({ summary }: { summary: ConversationSummary }) {
  return (
    <div className="flex items-center gap-3 py-2 fade-in" aria-label="이전 대화 요약 지점">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
        <span>이전 대화 요약됨 ({summary.sourceMessagesCount} 메시지)</span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

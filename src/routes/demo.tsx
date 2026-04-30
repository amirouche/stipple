// /demo — DOTS 라우팅 검증 + 측정 도구.
//
// 시니어 엔지니어 피드백 (2026-04-30): "지금 필요한 건 더 똑똑한 라우터가
// 아님. 현재 라우터가 어떤 결정을 했는지 증명하는 장치." 이 페이지가 그
// 증명. 30개 고정 입력 셋에 대해 라우팅 결정을 자동 검증 + 메트릭 패널로
// 누적 분포 시각화.
//
// 헤드리스 평가: evaluateRouting()이 매처를 직접 호출하므로 클라우드 LLM
// 호출 0번. 시연이 비용 없이 30번 돌릴 수 있게 설계 — 다만 트레이스 자체는
// 실제 라우팅 결정을 그대로 반영하므로 신뢰 가능.

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { DemoMetricsPanel } from "@/components/DemoMetricsPanel";
import { evaluateRouting } from "@/lib/demo/runner";
import { TEST_SUITE, type TestCase } from "@/lib/demo/test-suite";
import type { DemoRoute, DemoTrace } from "@/lib/demo/trace";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "데모 측정 — DOTS" },
      {
        name: "description",
        content:
          "30개 고정 입력에 대한 DOTS 라우팅 결정 검증. 빅테크 대비 차별점인 외부 호출 회피율을 그대로 보여주는 도구.",
      },
    ],
  }),
  component: DemoPage,
});

type RowState = {
  status: "idle" | "running" | "passed" | "failed";
  trace?: DemoTrace;
};

const ROUTE_LABEL: Record<DemoRoute, string> = {
  pack: "Pack",
  store: "Store",
  learned: "Learned",
  cloud: "Cloud",
  local: "Local",
};

function ResultBadge({ status }: { status: RowState["status"] }) {
  if (status === "running") {
    return (
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
        실행 중…
      </span>
    );
  }
  if (status === "passed") {
    return (
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-primary">
        ✓ 통과
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">✗ 불일치</span>
    );
  }
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft/60">
      대기
    </span>
  );
}

function DemoPage() {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(TEST_SUITE.map((c) => [c.id, { status: "idle" } as RowState])),
  );
  const [running, setRunning] = useState(false);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runOne(c: TestCase) {
    setRow(c.id, { status: "running", trace: undefined });
    const trace = await evaluateRouting(c.input);
    setRow(c.id, {
      status: trace.route === c.expectedRoute ? "passed" : "failed",
      trace,
    });
  }

  async function runAll() {
    if (running) return;
    setRunning(true);
    setRows((prev) => {
      const next = { ...prev };
      for (const c of TEST_SUITE) next[c.id] = { status: "idle" };
      return next;
    });
    for (const c of TEST_SUITE) {
      // 순차 실행 — classifyIntent가 (현재는 규칙 기반이라 빠르지만) 미래에
      // LLM 분류로 갈 가능성을 위해. 동시 실행은 학습 캐시에 쓰기 경합을
      // 일으킬 수 있음.
      await runOne(c);
    }
    setRunning(false);
  }

  const total = TEST_SUITE.length;
  const passed = Object.values(rows).filter((r) => r.status === "passed").length;
  const failed = Object.values(rows).filter((r) => r.status === "failed").length;
  const completed = passed + failed;

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">검증</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">데모 측정</h1>
          <p className="mt-2 text-[13px] text-ink-soft max-w-2xl leading-relaxed">
            라우팅 결정이 어디로 흘러갔는지 — 30개 고정 입력으로 검증 + 누적 분포 시각화. "더 똑똑한
            라우터"가 아니라 "현재 라우터가 어떤 결정을 했는지 증명"하는 장치.
          </p>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-4xl space-y-6">
          {/* Run controls */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">자동 검증</h2>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
                {completed}/{total} · {passed} 통과 · {failed} 불일치
              </span>
            </div>
            <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">
              헤드리스 평가 — 매처는 실제로 돌지만 클라우드 LLM은 호출 안 함. 30개 입력 × 평균 50ms
              = 약 1.5초.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runAll}
                disabled={running}
                className="h-8 px-3 rounded-md bg-ink text-background text-[12px] disabled:opacity-40 transition-opacity"
              >
                {running ? "실행 중…" : "Run All"}
              </button>
              <span className="text-[11.5px] text-ink-soft">
                각 행의 "Run" 버튼으로 단일 실행도 가능.
              </span>
            </div>
          </section>

          {/* Test cases */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-3">
              테스트 케이스 ({total}개)
            </h2>
            <p className="text-[12px] text-ink-soft mb-3 leading-relaxed">
              <span className="font-mono uppercase tracking-[0.12em]">requiresPriorChat</span>{" "}
              표시된 케이스는 같은 입력을 채팅에서 한 번 cloud로 처리해야 학습 캐시에 hit. 신선한
              상태에서는 cloud로 떨어진다.
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {TEST_SUITE.map((c) => {
                const row = rows[c.id];
                const expectedLabel = ROUTE_LABEL[c.expectedRoute];
                const actualLabel = row?.trace ? ROUTE_LABEL[row.trace.route] : "—";
                return (
                  <li key={c.id} className="px-3 py-2.5 bg-card">
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-[10.5px] text-ink-soft uppercase tracking-[0.12em] w-16 shrink-0 mt-1">
                        {c.category}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-ink truncate">{c.input}</p>
                        <p className="mt-0.5 text-[11.5px] text-ink-soft">{c.description}</p>
                        {c.requiresPriorChat && (
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft/70">
                            선행 채팅 필요
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 min-w-[120px]">
                        <span className="font-mono text-[10.5px] tabular-nums text-ink-soft">
                          예상 {expectedLabel} / 실제 {actualLabel}
                        </span>
                        <ResultBadge status={row?.status ?? "idle"} />
                        {row?.trace && (
                          <span className="font-mono text-[9.5px] text-ink-soft">
                            {row.trace.latencyMs}ms · {row.trace.intent}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => runOne(c)}
                        disabled={running || row?.status === "running"}
                        className="h-7 px-2.5 rounded-md border border-border text-[11.5px] text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors shrink-0"
                      >
                        Run
                      </button>
                    </div>
                    {row?.trace && row.status === "failed" && (
                      <p className="mt-1 ml-[76px] text-[11px] text-ink-soft leading-relaxed">
                        {row.trace.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <DemoMetricsPanel />
        </div>
      </div>
    </Shell>
  );
}

// 데모 측정 패널 — DemoTrace 집계를 시각화.
//
// 시니어 엔지니어 피드백 (2026-04-30): "지금 필요한 건 — 더 똑똑한 라우터가
// 아님. 현재 라우터가 어떤 결정을 했는지 증명하는 장치." 이 패널이 그
// 증명. send()의 각 분기에서 박힌 trace가 useDemoTraceStore() 구독으로
// 실시간 집계된다.

import { useDemoTraceStore, getDemoMetrics, clearDemoTraces } from "@/lib/demo/trace";
import { PACKS } from "@/lib/dots-data";

function pct(n: number): string {
  if (!Number.isFinite(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

function pctOfTotal(count: number, total: number): string {
  if (total === 0) return "0.0%";
  return pct(count / total);
}

export function DemoMetricsPanel() {
  // useDemoTraceStore의 반환값을 직접 쓰기보다 — getDemoMetrics가 모든
  // 집계를 한 자리에서 계산. traces 배열 변화가 hook 구독을 트리거하므로
  // 결과적으로 실시간 업데이트.
  const traces = useDemoTraceStore();
  const metrics = getDemoMetrics();
  const localTotal =
    metrics.packCount + metrics.learnedCount + metrics.storeCount + metrics.localCount;

  // PACKS와 join — 0회인 팩도 "어떤 팩이 시연에 참여 안 했는지" 보이게.
  const packRows = PACKS.map((p) => ({
    id: p.id,
    name: p.name,
    count: metrics.packBreakdown[p.id] ?? 0,
  })).sort((a, b) => b.count - a.count);

  function handleClear() {
    if (!window.confirm("모든 trace를 지울까? 이 디바이스에만 저장돼 있어.")) return;
    clearDemoTraces();
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(traces, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dots-traces-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">데모 측정 (V0)</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          이 디바이스
        </span>
      </div>
      <p className="text-[12.5px] text-ink-soft mb-5 leading-relaxed">
        DOTS의 라우팅 결정 — 빅테크 대비 차별점. 각 입력이 어디로 흘러갔는지 / 외부 호출을 몇 번이나
        피했는지가 여기에 박힌다. 본질은 "더 똑똑한 라우터"가 아니라 "현재 라우터가 어떤 결정을
        했는지 증명".
      </p>

      {metrics.total === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-[12.5px] text-ink-soft">
            아직 trace가 없어. 채팅에서 한 번 입력하거나 /demo 의 검증 도구를 돌려.
          </p>
        </div>
      ) : (
        <>
          {/* Top-line: total + local/cloud split */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[12.5px] text-ink-soft">총 요청</span>
              <span className="font-mono text-[18px] tabular-nums text-ink">{metrics.total}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  로컬
                </div>
                <p className="mt-1 font-mono text-[16px] text-ink tabular-nums">
                  {localTotal}{" "}
                  <span className="text-[11px] text-ink-soft">
                    ({pctOfTotal(localTotal, metrics.total)})
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
                  클라우드
                </div>
                <p className="mt-1 font-mono text-[16px] text-ink tabular-nums">
                  {metrics.cloudCount}{" "}
                  <span className="text-[11px] text-ink-soft">
                    ({pctOfTotal(metrics.cloudCount, metrics.total)})
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Route breakdown */}
          <div className="mb-5">
            <p className="text-[12.5px] text-ink mb-2">분기 별</p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              <BreakdownRow label="Pack" count={metrics.packCount} total={metrics.total} />
              <BreakdownRow label="Learned" count={metrics.learnedCount} total={metrics.total} />
              <BreakdownRow label="Store" count={metrics.storeCount} total={metrics.total} />
              <BreakdownRow
                label="Local (canned)"
                count={metrics.localCount}
                total={metrics.total}
              />
              <BreakdownRow label="Cloud" count={metrics.cloudCount} total={metrics.total} />
            </ul>
          </div>

          {/* The headline number */}
          <div className="mb-5 rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
              빅테크 대비 차별점
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-mono text-[20px] tabular-nums text-ink">
                  {metrics.avoidedCalls}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">회피한 외부 호출</p>
              </div>
              <div>
                <p className="font-mono text-[20px] tabular-nums text-primary">
                  {pct(metrics.avoidanceRate)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">회피율</p>
              </div>
              <div>
                <p className="font-mono text-[20px] tabular-nums text-ink">
                  {metrics.avgLatencyMs.toFixed(0)}
                  <span className="text-[12px] text-ink-soft">ms</span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft">평균 지연</p>
              </div>
            </div>
          </div>

          {/* Pack breakdown */}
          <div className="mb-5">
            <p className="text-[12.5px] text-ink mb-2">팩 별</p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {packRows.map((row) => (
                <li key={row.id} className="px-3 py-2 flex items-center gap-2 bg-card text-[12px]">
                  <span className="flex-1 min-w-0 truncate text-ink">{row.name}</span>
                  <span className="font-mono text-[11px] text-ink tabular-nums w-12 text-right">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-4 border-t border-border">
        <button
          type="button"
          onClick={handleExport}
          disabled={metrics.total === 0}
          className="h-8 px-3 rounded-md border border-border text-[11.5px] text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={metrics.total === 0}
          className="h-8 px-3 rounded-md border border-border text-[11.5px] text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
        >
          Clear
        </button>
      </div>
    </section>
  );
}

function BreakdownRow({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <li className="px-3 py-2 flex items-center gap-3 bg-card text-[12px]">
      <span className="flex-1 min-w-0 text-ink">{label}</span>
      <span className="font-mono text-[11px] text-ink tabular-nums w-10 text-right">{count}</span>
      <span className="font-mono text-[10.5px] text-ink-soft tabular-nums w-14 text-right">
        {pctOfTotal(count, total)}
      </span>
    </li>
  );
}

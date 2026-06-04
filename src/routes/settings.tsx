import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { PACKS } from "@/lib/dots-data";
import {
  movePack,
  setPitchPrefs,
  setPreferences,
  usePreferences,
  type DefaultMode,
  type HomePriority,
} from "@/lib/preferences";
import {
  AVAILABLE_EMBEDDING_MODELS,
  clearEmbeddingModel,
  downloadAndInitEmbedding,
  useEmbeddingStatus,
  type EmbeddingModelId,
} from "@/lib/embedding";
import {
  PITCH_CATEGORIES,
  getPitchCount,
  getPitches,
  resetPitchStats,
  usePitchStats,
} from "@/lib/pitch";
import type { PitchCategory } from "@/lib/pitch/types";
import {
  composeWakeMessage,
  isSpeechSupported,
  speak,
  updateAlarm,
  useWakeAlarms,
  type WakeAlarm,
  type WakeKind,
  type WakeTone,
} from "@/lib/wake";
import { getMemorySnapshot } from "@/lib/memory";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "설정 — DOTS" },
      {
        name: "description",
        content: "DOTS의 홈 흐름, 기본 모드, 팩 순서를 직접 정해보세요.",
      },
    ],
  }),
  component: SettingsPage,
});

// HomePriority / DefaultMode 옵션 — title/desc 는 t 사전 키 참조 (id 별 매핑).
const HOME_PRIORITY_IDS: HomePriority[] = ["memory-first", "packs-first", "balanced"];
const DEFAULT_MODE_IDS: DefaultMode[] = ["calm", "fast", "deep"];

const WAKE_KIND_LABEL: Record<WakeKind, string> = {
  morning: "아침 인사",
  lunch: "점심 멘트",
  evening: "저녁 회상",
  bedtime: "자기 전",
  homecoming: "귀가",
};

const HOMECOMING_HOUR_OPTIONS = [1, 2, 3, 4, 5, 6];

const WAKE_TONE_LABEL: Record<WakeTone, string> = {
  warm: "편안하게",
  brief: "짧게",
  calm: "차분하게",
};

const WAKE_TONES: WakeTone[] = ["warm", "brief", "calm"];

function SettingsPage() {
  const prefs = usePreferences();
  const wakeAlarms = useWakeAlarms();
  const [telemetry, setTelemetry] = useState(false);
  const speechOK = isSpeechSupported();
  const ts = useT().settings;
  // HomePriority / DefaultMode id → t 사전 객체 매핑.
  const HOME_PRIORITY_T = {
    "memory-first": ts.homePriority.memoryFirst,
    "packs-first": ts.homePriority.packsFirst,
    balanced: ts.homePriority.balanced,
  } as const;
  const DEFAULT_MODE_T = {
    calm: ts.defaultMode.calm,
    fast: ts.defaultMode.fast,
    deep: ts.defaultMode.deep,
  } as const;

  const orderedPacks = [...PACKS].sort((a, b) => {
    const ai = prefs.packOrder.indexOf(a.id);
    const bi = prefs.packOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            {ts.eyebrow}
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">{ts.title}</h1>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-2xl space-y-6">
          {/* Home priority */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">
              {ts.homePriority.title}
            </h2>
            <p className="text-[12.5px] text-ink-soft mb-4">{ts.homePriority.desc}</p>
            <div className="space-y-2">
              {HOME_PRIORITY_IDS.map((id) => {
                const opt = HOME_PRIORITY_T[id];
                return (
                  <PickOption
                    key={id}
                    active={prefs.homePriority === id}
                    title={opt.title}
                    desc={opt.desc}
                    onClick={() => setPreferences({ homePriority: id })}
                  />
                );
              })}
            </div>
          </section>

          {/* Default mode */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">
              {ts.defaultMode.title}
            </h2>
            <p className="text-[12.5px] text-ink-soft mb-4">{ts.defaultMode.desc}</p>
            <div className="space-y-2">
              {DEFAULT_MODE_IDS.map((id) => {
                const opt = DEFAULT_MODE_T[id];
                return (
                  <PickOption
                    key={id}
                    active={prefs.defaultMode === id}
                    title={opt.title}
                    desc={opt.desc}
                    onClick={() => setPreferences({ defaultMode: id })}
                  />
                );
              })}
            </div>
          </section>

          {/* On-device LLM (WebLLM) */}
          <WebLLMSection />

          {/* V4 시맨틱 매칭 (EmbeddingGemma) */}
          <EmbeddingSection />

          {/* V4.5 정확도 향상 (Cross-encoder reranker) */}
          <RerankerSection />

          {/* Wake / proactive greetings */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">능동 인사</h2>
              {!speechOK && (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  미지원 브라우저
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-ink-soft mb-4">
              시간 되면 음성으로 먼저 말 걸어줄게. 대화 내용은 말하지 않아 — 시간대와 흐름만.
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {wakeAlarms.map((a) => (
                <WakeRow key={a.id} alarm={a} />
              ))}
            </ul>
            {!speechOK && (
              <p className="mt-3 text-[11.5px] text-ink-soft/80 leading-relaxed">
                이 브라우저는 Web Speech API를 지원하지 않아. Chrome / Safari 에서 다시 열어봐.
              </p>
            )}
          </section>

          {/* Micro-pitches */}
          <PitchSection />

          {/* Pack order */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">
              {ts.packOrder.title}
            </h2>
            <p className="text-[12.5px] text-ink-soft mb-4">{ts.packOrder.desc}</p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {orderedPacks.map((p, i) => (
                <li key={p.id} className="px-3 py-2.5 flex items-center gap-3 bg-card">
                  <span className="font-mono text-[10.5px] text-ink-soft w-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-ink truncate">{p.name}</span>
                    <span className="block text-[11px] text-ink-soft">
                      {p.installed ? ts.packOrder.installed : ts.packOrder.notInstalled}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePack(p.id, "up")}
                      disabled={i === 0}
                      className="h-7 w-7 rounded-md border border-border text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors text-[12px]"
                      aria-label={ts.packOrder.moveUp}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => movePack(p.id, "down")}
                      disabled={i === orderedPacks.length - 1}
                      className="h-7 w-7 rounded-md border border-border text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors text-[12px]"
                      aria-label={ts.packOrder.moveDown}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Privacy */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                {ts.privacy.title}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                {ts.privacy.badge}
              </span>
            </div>
            <p className="text-[13.5px] text-ink leading-relaxed">{ts.privacy.line1}</p>
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">{ts.privacy.line2}</p>

            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-[13.5px] text-ink">{ts.privacy.telemetry}</p>
                <p className="text-[12px] text-ink-soft">{ts.privacy.telemetryDesc}</p>
              </div>
              <Toggle on={telemetry} onChange={setTelemetry} />
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-3">
              {ts.about.title}
            </h2>
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-ink-soft">{ts.about.version}</dt>
              <dd className="font-mono text-ink">{ts.about.versionValue}</dd>
              <dt className="text-ink-soft">{ts.about.baseModel}</dt>
              <dd className="font-mono text-ink">{ts.about.baseModelValue}</dd>
              <dt className="text-ink-soft">{ts.about.personalLayer}</dt>
              <dd className="font-mono text-ink">{ts.about.personalLayerValue}</dd>
            </dl>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function PickOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-colors flex items-start gap-3 ${
        active ? "border-strong bg-surface" : "border-border bg-card hover:border-strong"
      }`}
    >
      <span
        className={`mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0 transition-all ${
          active ? "border-primary bg-primary" : "border-border-strong"
        }`}
      />
      <span>
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block text-[12px] text-ink-soft mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

function WakeRow({ alarm }: { alarm: WakeAlarm }) {
  const speechOK = isSpeechSupported();

  function preview() {
    const top = getMemorySnapshot()
      .memories.filter((m) => m.state === "active")
      .sort((a, b) => b.accessCount - a.accessCount)[0]?.topic;
    speak(composeWakeMessage(alarm, { topicMention: top }));
  }

  const isHomecoming = alarm.kind === "homecoming";

  return (
    <li className="px-3 py-3 flex items-center gap-2 bg-card flex-wrap">
      <span className="text-[13px] text-ink w-24 shrink-0">{WAKE_KIND_LABEL[alarm.kind]}</span>

      {isHomecoming ? (
        <>
          <span className="flex items-center gap-1">
            <input
              type="time"
              value={alarm.activeWindowStart ?? "17:00"}
              disabled={!alarm.enabled}
              onChange={(e) => updateAlarm(alarm.id, { activeWindowStart: e.target.value })}
              className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] text-ink font-mono disabled:opacity-40 focus:outline-none focus:border-strong"
              aria-label="활성 시간대 시작"
            />
            <span className="text-[11px] text-ink-soft">~</span>
            <input
              type="time"
              value={alarm.activeWindowEnd ?? "23:00"}
              disabled={!alarm.enabled}
              onChange={(e) => updateAlarm(alarm.id, { activeWindowEnd: e.target.value })}
              className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] text-ink font-mono disabled:opacity-40 focus:outline-none focus:border-strong"
              aria-label="활성 시간대 끝"
            />
          </span>
          <select
            value={alarm.minBackgroundHours ?? 2}
            disabled={!alarm.enabled}
            onChange={(e) => updateAlarm(alarm.id, { minBackgroundHours: Number(e.target.value) })}
            className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] text-ink disabled:opacity-40 focus:outline-none focus:border-strong"
            aria-label="최소 외출 시간"
          >
            {HOMECOMING_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}시간↑
              </option>
            ))}
          </select>
        </>
      ) : (
        <input
          type="time"
          value={alarm.time}
          disabled={!alarm.enabled}
          onChange={(e) => updateAlarm(alarm.id, { time: e.target.value })}
          className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] text-ink font-mono disabled:opacity-40 focus:outline-none focus:border-strong"
        />
      )}

      <select
        value={alarm.tone}
        disabled={!alarm.enabled}
        onChange={(e) => updateAlarm(alarm.id, { tone: e.target.value as WakeTone })}
        className="h-8 px-2 rounded-md border border-border bg-card text-[12.5px] text-ink disabled:opacity-40 focus:outline-none focus:border-strong"
      >
        {WAKE_TONES.map((t) => (
          <option key={t} value={t}>
            {WAKE_TONE_LABEL[t]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={preview}
        disabled={!speechOK || !alarm.enabled}
        className="h-8 px-2.5 rounded-md border border-border text-[11.5px] text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
      >
        들어보기
      </button>

      <span className="ml-auto">
        <Toggle on={alarm.enabled} onChange={(v) => updateAlarm(alarm.id, { enabled: v })} />
      </span>
    </li>
  );
}

function PitchSection() {
  const prefs = usePreferences();
  const statsMap = usePitchStats();
  const enabled = prefs.pitch.enabled;
  const selected = new Set<PitchCategory>(prefs.pitch.categories);
  const cacheCount = getPitchCount();
  const pitches = getPitches();

  function toggleCategory(cat: PitchCategory) {
    const next = new Set(selected);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setPitchPrefs({ categories: [...next] });
  }

  // Sort by views desc, then brand. Items with zero stats still show so
  // the user can see the full inventory.
  const rows = [...pitches]
    .map((pitch) => ({
      pitch,
      views: statsMap.get(pitch.id)?.views ?? 0,
      taps: statsMap.get(pitch.id)?.taps ?? 0,
    }))
    .sort((a, b) => b.views - a.views || a.pitch.brand.localeCompare(b.pitch.brand));

  const totalViews = rows.reduce((sum, r) => sum + r.views, 0);
  const totalTaps = rows.reduce((sum, r) => sum + r.taps, 0);

  function handleReset() {
    if (!window.confirm("이 디바이스의 광고 노출 통계를 모두 지워. 계속할까?")) return;
    void resetPitchStats();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">마이크로 광고</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          기기 안
        </span>
      </div>
      <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">
        DOTS의 광고는 디바이스 안에 머물러. 광고주는 네 데이터를 안 받아 — 매칭은 로컬에서만.
      </p>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-[13.5px] text-ink">광고 표시</p>
          <p className="text-[11.5px] text-ink-soft mt-0.5">
            대화 흐름과 맞을 때만, 답변 옆에 한 장.
          </p>
        </div>
        <Toggle on={enabled} onChange={(v) => setPitchPrefs({ enabled: v })} />
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[12.5px] text-ink mb-2">카테고리</p>
        <div className="flex flex-wrap gap-1.5">
          {PITCH_CATEGORIES.map((cat) => {
            const on = selected.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                disabled={!enabled}
                onClick={() => toggleCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] transition-colors disabled:opacity-40 ${
                  on
                    ? "bg-ink text-background border border-ink"
                    : "bg-card text-ink-soft border border-border hover:text-ink hover:border-strong"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          광고 {cacheCount}개 캐시됨 · 로컬
        </p>
      </div>

      {/* On-device view stats */}
      <div className="mt-5 pt-5 border-t border-border">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[13px] text-ink">내 노출 통계</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            노출 {totalViews} · 클릭 {totalTaps}
          </span>
        </div>
        <p className="text-[11.5px] text-ink-soft mb-3 leading-relaxed">
          이 통계는 디바이스 안에만 머물러. 광고주는 받지 못해.
        </p>
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {rows.map(({ pitch, views, taps }) => (
            <li key={pitch.id} className="px-3 py-2 flex items-center gap-2 bg-card text-[12px]">
              <span className="flex-1 min-w-0 truncate text-ink">{pitch.brand}</span>
              <span className="font-mono text-[10.5px] text-ink-soft uppercase tracking-[0.12em]">
                {pitch.displayPeriod === "weekly" ? "주간" : "월간"}
              </span>
              <span className="font-mono text-[11px] text-ink tabular-nums w-16 text-right">
                {views} 노출
              </span>
              <span className="font-mono text-[11px] text-ink-soft tabular-nums w-14 text-right">
                {taps} 클릭
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={handleReset}
          disabled={totalViews === 0 && totalTaps === 0}
          className="mt-3 h-8 px-3 rounded-md border border-border text-[11.5px] text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors"
        >
          통계 초기화
        </button>
      </div>

      {/* How this works — concept block for the demo */}
      <div className="mt-5 pt-5 border-t border-border">
        <p className="text-[12.5px] text-ink mb-2">DOTS의 광고는 다르게 작동해</p>
        <ul className="space-y-1.5 text-[12px] text-ink-soft leading-relaxed list-disc pl-5">
          <li>광고주는 카테고리와 기간을 구매해 (정액제)</li>
          <li>네 데이터는 외부로 안 나가</li>
          <li>노출 통계는 네 디바이스 안에만 머물러</li>
          <li>카운트는 광고 효과를 네가 직접 볼 수 있게 한 거야</li>
        </ul>
      </div>
    </section>
  );
}

// 안정성 정정 (2026-04-30): WebLLM 일시 비활성화. @mlc-ai/web-llm ES
// module 호환 문제로 런타임 깨짐 → 모델 카드 / 다운로드 / Provider 라디오
// 모두 제거. 단일 옵션 (gemini-only) 자동 강제. 모듈 (src/lib/webllm) 자체는
// 살려둔다 — 추후 인프라 안정화되면 이 섹션만 복구하면 된다.

function WebLLMSection() {
  const ts = useT().settings.disabledCards;
  return (
    <section className="rounded-xl border border-border bg-card p-6 opacity-80">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{ts.webllmTitle}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {ts.webllmStatus}
        </span>
      </div>
      <p className="text-[12.5px] text-ink-soft leading-relaxed">{ts.webllmDesc}</p>
      <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
        {ts.webllmFooter}
      </p>
    </section>
  );
}

// V4 시맨틱 매칭 섹션. EmbeddingGemma 다운로드 토글 + 상태 표시.
// 헌법: 사용자 명시 클릭에서만 다운로드. 활성화 안 하면 V3 매칭(정확
// 일치 + 키워드)이 그대로 작동 — 시맨틱은 옵트인 진화.
function EmbeddingSection() {
  const status = useEmbeddingStatus();
  const isLoading = status.state === "loading";
  const isReady = status.state === "ready";
  const isError = status.state === "error";
  const progressPct = status.progress?.progress ?? 0;
  const progressFile = status.progress?.file ?? "";
  const progressStatus = status.progress?.status ?? "";

  const recommended = AVAILABLE_EMBEDDING_MODELS.find((m) => m.recommended);

  function handleDownload(modelId: EmbeddingModelId) {
    downloadAndInitEmbedding(modelId).catch((err) => {
      console.error("[embedding] 다운로드 실패:", err);
    });
  }

  function handleDisable() {
    void clearEmbeddingModel();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">시맨틱 매칭 (V4)</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
          기기 안
        </span>
      </div>
      <p className="text-[12.5px] text-ink-soft mb-4 leading-relaxed">
        의미 기반 매칭 — "양자역학" / "양자역학에 대해" / "양자역학이 뭐야"가 같은 응답으로 묶인다.
        모델이 다운로드된 뒤부터 작동. 안 켜도 V3 정확-일치 매칭은 그대로.
      </p>

      <div className="space-y-2.5">
        {AVAILABLE_EMBEDDING_MODELS.map((m) => {
          const isThis = status.model === m.id;
          const thisLoading = isThis && isLoading;
          const thisReady = isThis && isReady;
          const thisError = isThis && isError;
          return (
            <article key={m.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold tracking-tight text-ink">{m.name}</h3>
                    {m.recommended && (
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-primary">
                        추천
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink-soft leading-relaxed">
                    {m.description}
                  </p>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-soft">
                    {m.size} · {m.dim}d
                  </p>
                </div>
                {thisReady ? (
                  <button
                    type="button"
                    onClick={handleDisable}
                    className="px-3 h-8 rounded-md border border-border text-[12px] text-ink-soft hover:text-ink hover:bg-card shrink-0"
                  >
                    비활성화
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownload(m.id)}
                    disabled={isLoading}
                    className="px-3 h-8 rounded-md bg-ink text-background text-[12px] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {thisLoading ? "다운로드 중…" : "다운로드"}
                  </button>
                )}
              </div>

              {thisLoading && (
                <div className="mt-2">
                  <div className="h-1 rounded-full bg-card overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, progressPct)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-ink-soft">
                    {progressStatus} {progressFile && `· ${progressFile}`}
                  </p>
                </div>
              )}
              {thisReady && (
                <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary">
                  ✓ 준비 완료 — 시맨틱 매칭 작동 중
                </p>
              )}
              {thisError && (
                <p className="mt-2 text-[12px] text-ink leading-relaxed">
                  실패: {status.error ?? "알 수 없는 오류"}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-[11.5px] text-ink-soft leading-relaxed">
        다운로드는 1회만. IndexedDB에 저장되어 다음부터 즉시 작동.
        {recommended && ` 추천: ${recommended.name} (${recommended.size}).`}
      </p>
    </section>
  );
}

// V4.5 cross-encoder reranker 섹션. 안정성 정정 (2026-04-30): GTE
// multilingual reranker가 Transformers.js v4와 호환되지 않아 (ONNX 그래프
// 로드 실패) 일시 비활성화. 모듈 (src/lib/reranker)은 살려두고 다운로드
// 카드만 가린다. matcher 측에서도 reranker 단계를 건너뛰므로 V4 임베딩
// 점수가 그대로 통과 — 모델 호환 문제 해결되면 이 섹션 복구.
function RerankerSection() {
  const ts = useT().settings.disabledCards;
  return (
    <section className="rounded-xl border border-border bg-card p-6 opacity-80">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{ts.rerankerTitle}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {ts.rerankerStatus}
        </span>
      </div>
      <p className="text-[12.5px] text-ink-soft leading-relaxed">{ts.rerankerDesc}</p>
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`h-5 w-9 rounded-full transition-colors relative ${
        on ? "bg-ink" : "bg-border-strong"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

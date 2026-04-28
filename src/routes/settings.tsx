import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { PACKS } from "@/lib/dots-data";
import {
  movePack,
  setAdPrefs,
  setPreferences,
  usePreferences,
  type DefaultMode,
  type HomePriority,
} from "@/lib/preferences";
import { AD_CATEGORIES, getAdCount, getAds, resetAdStats, useAdStats } from "@/lib/ads";
import type { AdCategory } from "@/lib/ads/types";
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

const HOME_PRIORITY: { id: HomePriority; title: string; desc: string }[] = [
  {
    id: "memory-first",
    title: "기억 우선",
    desc: "전에 얘기한 것부터 꺼내. 같은 주제 반복이 잦을 때 좋아.",
  },
  {
    id: "packs-first",
    title: "팩 우선",
    desc: "활성 팩의 결과를 먼저 보여줘. 새 일에 빠르게 들어갈 때.",
  },
  {
    id: "balanced",
    title: "균형",
    desc: "그 순간 가장 자연스러운 쪽으로. 기본값.",
  },
];

const DEFAULT_MODE: { id: DefaultMode; title: string; desc: string }[] = [
  { id: "calm", title: "차분한 모드", desc: "짧고 부드럽게. 끼어들지 않게." },
  { id: "fast", title: "빠른 모드", desc: "한 줄 답을 먼저. 필요하면 더 풀어줄게." },
  { id: "deep", title: "깊은 모드", desc: "단계적으로 풀어. 시간이 조금 더 걸려." },
];

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

  const orderedPacks = [...PACKS].sort((a, b) => {
    const ai = prefs.packOrder.indexOf(a.id);
    const bi = prefs.packOrder.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <Shell>
      <div className="flex flex-col">
        <header className="px-8 md:px-12 pt-10 pb-8 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">환경</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight text-ink">설정</h1>
        </header>

        <div className="px-8 md:px-12 py-10 max-w-2xl space-y-6">
          {/* Home priority */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">
              홈에서 먼저 보여줄 흐름
            </h2>
            <p className="text-[12.5px] text-ink-soft mb-4">
              DOTS가 새 대화를 열 때 어디서부터 시작할지.
            </p>
            <div className="space-y-2">
              {HOME_PRIORITY.map((opt) => (
                <PickOption
                  key={opt.id}
                  active={prefs.homePriority === opt.id}
                  title={opt.title}
                  desc={opt.desc}
                  onClick={() => setPreferences({ homePriority: opt.id })}
                />
              ))}
            </div>
          </section>

          {/* Default mode */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">기본 모드</h2>
            <p className="text-[12.5px] text-ink-soft mb-4">답의 길이와 속도의 기본값.</p>
            <div className="space-y-2">
              {DEFAULT_MODE.map((opt) => (
                <PickOption
                  key={opt.id}
                  active={prefs.defaultMode === opt.id}
                  title={opt.title}
                  desc={opt.desc}
                  onClick={() => setPreferences({ defaultMode: opt.id })}
                />
              ))}
            </div>
          </section>

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

          {/* Micro-ads */}
          <AdsSection />

          {/* Pack order */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-1">팩 우선순위</h2>
            <p className="text-[12.5px] text-ink-soft mb-4">
              위에 있는 팩이 라이브러리와 홈에서 먼저 보여.
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {orderedPacks.map((p, i) => (
                <li key={p.id} className="px-3 py-2.5 flex items-center gap-3 bg-card">
                  <span className="font-mono text-[10.5px] text-ink-soft w-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-ink truncate">{p.name}</span>
                    <span className="block text-[11px] text-ink-soft">
                      {p.installed ? "설치됨" : "설치 안 됨"}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePack(p.id, "up")}
                      disabled={i === 0}
                      className="h-7 w-7 rounded-md border border-border text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors text-[12px]"
                      aria-label="위로"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => movePack(p.id, "down")}
                      disabled={i === orderedPacks.length - 1}
                      className="h-7 w-7 rounded-md border border-border text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-30 transition-colors text-[12px]"
                      aria-label="아래로"
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
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">프라이버시</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
                기기 안
              </span>
            </div>
            <p className="text-[13.5px] text-ink leading-relaxed">
              개인화된 데이터는 이 기기 안에 머물러.
            </p>
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
              기억, 팩 설정, 학습된 습관은 로컬에 저장돼. 더 깊은 추론이 필요할 때만 프롬프트와 팩
              시그니처가 베이스 모델로 가.
            </p>

            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
              <div>
                <p className="text-[13.5px] text-ink">익명 사용 통계</p>
                <p className="text-[12px] text-ink-soft">팩 개선용. 기본은 꺼져 있어.</p>
              </div>
              <Toggle on={telemetry} onChange={setTelemetry} />
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink mb-3">DOTS 정보</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-ink-soft">버전</dt>
              <dd className="font-mono text-ink">0.1.0 · 프로토타입</dd>
              <dt className="text-ink-soft">베이스 모델</dt>
              <dd className="font-mono text-ink">설정 가능</dd>
              <dt className="text-ink-soft">개인 레이어</dt>
              <dd className="font-mono text-ink">로컬</dd>
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

function AdsSection() {
  const prefs = usePreferences();
  const statsMap = useAdStats();
  const enabled = prefs.ads.enabled;
  const selected = new Set<AdCategory>(prefs.ads.categories);
  const cacheCount = getAdCount();
  const ads = getAds();

  function toggleCategory(cat: AdCategory) {
    const next = new Set(selected);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setAdPrefs({ categories: [...next] });
  }

  // Sort by impressions desc, then brand. Ads with zero stats still show
  // so the user can see the full inventory.
  const rows = [...ads]
    .map((ad) => ({
      ad,
      impressions: statsMap.get(ad.id)?.impressions ?? 0,
      clicks: statsMap.get(ad.id)?.clicks ?? 0,
    }))
    .sort((a, b) => b.impressions - a.impressions || a.ad.brand.localeCompare(b.ad.brand));

  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);

  function handleReset() {
    if (!window.confirm("이 디바이스의 광고 노출 통계를 모두 지워. 계속할까?")) return;
    void resetAdStats();
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
        <Toggle on={enabled} onChange={(v) => setAdPrefs({ enabled: v })} />
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[12.5px] text-ink mb-2">카테고리</p>
        <div className="flex flex-wrap gap-1.5">
          {AD_CATEGORIES.map((cat) => {
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

      {/* On-device impression stats */}
      <div className="mt-5 pt-5 border-t border-border">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[13px] text-ink">내 노출 통계</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            노출 {totalImpressions} · 클릭 {totalClicks}
          </span>
        </div>
        <p className="text-[11.5px] text-ink-soft mb-3 leading-relaxed">
          이 통계는 디바이스 안에만 머물러. 광고주는 받지 못해.
        </p>
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {rows.map(({ ad, impressions, clicks }) => (
            <li key={ad.id} className="px-3 py-2 flex items-center gap-2 bg-card text-[12px]">
              <span className="flex-1 min-w-0 truncate text-ink">{ad.brand}</span>
              <span className="font-mono text-[10.5px] text-ink-soft uppercase tracking-[0.12em]">
                {ad.displayPeriod === "weekly" ? "주간" : "월간"}
              </span>
              <span className="font-mono text-[11px] text-ink tabular-nums w-16 text-right">
                {impressions} 노출
              </span>
              <span className="font-mono text-[11px] text-ink-soft tabular-nums w-14 text-right">
                {clicks} 클릭
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={handleReset}
          disabled={totalImpressions === 0 && totalClicks === 0}
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

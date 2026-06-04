// Study Companion 팩의 폴더 뷰. 두 가지 화면이 한 라우트 안에 있다:
//   1) 폴더 그리드 — 팩에 속한 콘텐츠 카드 목록
//   2) 문제 상세 — 정답/오답 검증, 자주 틀리는 답 매칭 (둘 다 온디바이스)
//
// LLM 호출은 사용자가 명시적으로 누른 두 가지 버튼에서만 일어난다:
//   - 오답 + 매칭 안 된 경우의 "더 자세히"
//   - 정답 후 "변형 문제"
// 그래서 네트워크 끊긴 상태에서도 90% 흐름이 그대로 작동한다.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, useShell } from "@/components/Shell";
import { PACKS } from "@/lib/dots-data";
import {
  SAT_MATH_PROBLEMS,
  checkAnswer,
  difficultyLabel,
  topicLabel,
  type CheckResult,
} from "@/lib/packs/study/sat-math";
import { explainMistake, generateVariant } from "@/lib/packs/study/llm";
import type { SATMathProblem } from "@/lib/packs/study/types";
import { useUserSATProblems } from "@/lib/packs/study/user-store";
import { usePreferences } from "@/lib/preferences";
import { useT, type Messages } from "@/lib/i18n";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study Companion — DOTS" },
      {
        name: "description",
        content:
          "Study Companion 팩 — SAT 수학 문제를 온디바이스로 채점하고, 필요할 때만 LLM에 묻습니다.",
      },
    ],
  }),
  component: StudyPage,
});

function StudyPage() {
  const [openProblemId, setOpenProblemId] = useState<string | null>(null);
  const studyPack = PACKS.find((p) => p.id === "study-companion");
  const lang = usePreferences().language;
  // The pack ships with 5 base problems; user/LLM-generated problems live
  // in the reactive user store and stack onto the end. Both are picked up
  // here in one merged list so the folder view stays simple.
  const userProblems = useUserSATProblems();
  const problems: SATMathProblem[] = [...SAT_MATH_PROBLEMS, ...userProblems];

  const openProblem = openProblemId ? (problems.find((p) => p.id === openProblemId) ?? null) : null;

  return (
    <Shell>
      {openProblem ? (
        <ProblemView problem={openProblem} onBack={() => setOpenProblemId(null)} lang={lang} />
      ) : (
        <FolderView
          packName={studyPack?.name ?? "Study"}
          packShort={studyPack?.short ?? ""}
          problems={problems}
          onOpen={(id) => setOpenProblemId(id)}
          lang={lang}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Folder grid view
// ---------------------------------------------------------------------------

function FolderView({
  packName,
  packShort,
  problems,
  onOpen,
  lang,
}: {
  packName: string;
  packShort: string;
  problems: SATMathProblem[];
  onOpen: (id: string) => void;
  lang: "ko" | "en";
}) {
  const navigate = useNavigate();
  const shell = useShell();
  const t = useT();
  const L = t.study;

  return (
    <div className="flex flex-col">
      <header className="border-b border-border px-4 sm:px-8 md:px-12 pt-6 pb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => shell?.openMobile()}
            className="md:hidden shrink-0 h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            aria-label={t.shell.menuOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              {L.packFolder}
            </p>
            <h1 className="mt-1 text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">
              {packName}
            </h1>
            <p className="mt-1 text-[13px] text-ink-soft max-w-xl">
              {packShort} {L.packShortSuffix}
            </p>
          </div>
          <button
            onClick={() => navigate({ to: "/" })}
            className="shrink-0 h-9 px-3 rounded-md border border-border text-[12.5px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
          >
            {L.backToChat}
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-8 md:px-12 py-8">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft mb-4">
          {L.problemsSuffix(problems.length)}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
          {problems.map((p) => {
            const isUserGen = p.id.startsWith("sat-m-user-");
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="text-left rounded-xl border border-border bg-card p-5 hover:border-strong hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {topicLabel(p.topic, lang)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/50">
                    ·
                  </span>
                  <DifficultyChip d={p.difficulty} lang={lang} />
                  {isUserGen && (
                    <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-primary">
                      {L.newProblem}
                    </span>
                  )}
                </div>
                <p className="text-[13.5px] text-ink leading-snug line-clamp-3">{p.question}</p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/70">
                  {p.id}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DifficultyChip({ d, lang }: { d: SATMathProblem["difficulty"]; lang: "ko" | "en" }) {
  const tone = d === "easy" ? "text-primary" : d === "medium" ? "text-ink" : "text-destructive";
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}>
      {difficultyLabel(d, lang)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Problem detail view — answer, validate on-device, optional LLM follow-up
// ---------------------------------------------------------------------------

type LlmState =
  | { kind: "idle" }
  | { kind: "loading"; for: "explain" | "variant" }
  | { kind: "result"; for: "explain" | "variant"; text: string }
  | { kind: "error"; for: "explain" | "variant"; message: string };

function ProblemView({
  problem,
  onBack,
  lang,
}: {
  problem: SATMathProblem;
  onBack: () => void;
  lang: "ko" | "en";
}) {
  const L = useT().study;
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [llm, setLlm] = useState<LlmState>({ kind: "idle" });

  function pick(choice: string) {
    if (result) return; // already answered — second pick is a no-op
    const r = checkAnswer(problem.id, choice);
    if (r) setResult(r);
  }

  function reset() {
    setResult(null);
    setShowHint(false);
    setLlm({ kind: "idle" });
  }

  async function askExplain() {
    if (!result || result.kind !== "incorrect") return;
    setLlm({ kind: "loading", for: "explain" });
    try {
      const text = await explainMistake(problem, result.selected);
      setLlm({ kind: "result", for: "explain", text });
    } catch (err) {
      setLlm({
        kind: "error",
        for: "explain",
        message: err instanceof Error ? err.message : "설명 가져오기 실패",
      });
    }
  }

  async function askVariant() {
    setLlm({ kind: "loading", for: "variant" });
    try {
      const text = await generateVariant(problem);
      setLlm({ kind: "result", for: "variant", text });
    } catch (err) {
      setLlm({
        kind: "error",
        for: "variant",
        message: err instanceof Error ? err.message : "변형 문제 생성 실패",
      });
    }
  }

  return (
    <div className="flex flex-col">
      <header className="border-b border-border px-4 sm:px-8 md:px-12 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 h-9 px-3 rounded-md border border-border text-[12.5px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
          >
            {L.backToFolder}
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
              {L.metaPrefix} · {problem.id}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
                {topicLabel(problem.topic, lang)}
              </span>
              <span className="font-mono text-[10px] text-ink-soft/50">·</span>
              <DifficultyChip d={problem.difficulty} lang={lang} />
            </div>
          </div>
          {result && (
            <button
              onClick={reset}
              className="shrink-0 h-9 px-3 rounded-md border border-border text-[12.5px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
            >
              {L.retry}
            </button>
          )}
        </div>
      </header>

      <div className="px-4 sm:px-8 md:px-12 py-8 max-w-3xl">
        <h2 className="text-[18px] sm:text-[20px] text-ink leading-snug">{problem.question}</h2>

        <div className="mt-6 space-y-2">
          {problem.choices.map((c) => {
            const picked = result && pickedChoice(result) === c;
            const isCorrect = c === problem.correctAnswer;
            const showState = result !== null;
            const tone = !showState
              ? "border-border bg-card hover:border-strong hover:bg-surface"
              : isCorrect
                ? "border-primary bg-primary/10 text-ink"
                : picked
                  ? "border-destructive bg-destructive/10 text-ink"
                  : "border-border bg-card text-ink-soft";
            return (
              <button
                key={c}
                onClick={() => pick(c)}
                disabled={showState}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors text-[14px] ${tone} disabled:cursor-default`}
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-soft w-4 shrink-0">
                    {String(problem.choices.indexOf(c) + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1">{c}</span>
                  {showState && isCorrect && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-primary">
                      {L.correctLabel}
                    </span>
                  )}
                  {showState && picked && !isCorrect && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-destructive">
                      {L.chosenLabel}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {!result && (
          <div className="mt-5">
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                className="text-[12.5px] text-ink-soft underline-offset-4 hover:underline"
              >
                {L.showHint}
              </button>
            ) : (
              <div className="px-4 py-3 rounded-md border border-border bg-surface text-[13px] text-ink-soft leading-relaxed">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft/70 block mb-1">
                  {L.hint}
                </span>
                {problem.hint}
              </div>
            )}
          </div>
        )}

        {result?.kind === "correct" && (
          <ResultBlock tone="correct" title={L.correct}>
            <pre className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
              {problem.solution}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={askVariant}
                disabled={llm.kind === "loading"}
                className="h-9 px-3 rounded-md bg-ink text-background text-[12.5px] font-medium disabled:opacity-40"
              >
                {llm.kind === "loading" && llm.for === "variant" ? L.loadingVariant : L.makeVariant}
              </button>
              <CloudBadge />
            </div>
          </ResultBlock>
        )}

        {result?.kind === "incorrect" && (
          <ResultBlock tone="incorrect" title={L.incorrect}>
            {result.mistakeExplanation ? (
              <>
                <p className="text-[13.5px] text-ink leading-relaxed">
                  {result.mistakeExplanation}
                </p>
                <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
                  {L.matchedLocal}
                </p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] text-ink leading-relaxed">{L.cloudFallback}</p>
                <div className="mt-4">
                  <button
                    onClick={askExplain}
                    disabled={llm.kind === "loading"}
                    className="h-9 px-3 rounded-md bg-ink text-background text-[12.5px] font-medium disabled:opacity-40"
                  >
                    {llm.kind === "loading" && llm.for === "explain"
                      ? L.loadingExplain
                      : L.moreExplain}
                  </button>
                </div>
              </>
            )}

            <details className="mt-5 group">
              <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.14em] text-ink-soft hover:text-ink list-none">
                {L.showSolution}
              </summary>
              <pre className="mt-3 text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
                {problem.solution}
              </pre>
            </details>
          </ResultBlock>
        )}

        {llm.kind === "result" && (
          <div className="mt-6 px-4 py-4 rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {llm.for === "explain" ? L.moreExplainSection : L.variantSection}
              </span>
              <CloudBadge />
            </div>
            <pre className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
              {llm.text}
            </pre>
          </div>
        )}

        {llm.kind === "error" && (
          <div className="mt-6 px-4 py-3 rounded-md border border-destructive/40 bg-destructive/10 text-[13px] text-ink">
            {L.cloudFailed}: {llm.message}
          </div>
        )}
      </div>
    </div>
  );
}

function pickedChoice(r: CheckResult): string {
  return r.kind === "correct" ? r.problem.correctAnswer : r.selected;
}

function ResultBlock({
  tone,
  title,
  children,
}: {
  tone: "correct" | "incorrect";
  title: string;
  children: React.ReactNode;
}) {
  const accent = tone === "correct" ? "border-primary/60" : "border-destructive/60";
  const labelTone = tone === "correct" ? "text-primary" : "text-destructive";
  return (
    <div className={`mt-6 rounded-xl border ${accent} bg-card overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border">
        <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${labelTone}`}>
          {title}
        </span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function CloudBadge() {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/50" />
      {t.study.cloudBadge}
    </span>
  );
}

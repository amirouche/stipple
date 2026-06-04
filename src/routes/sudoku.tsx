// Sudoku Pack 전용 페이지. 앱스토어 "앱 실행" 흐름의 데모.
//
// 한 판을 풀면 직전 결과(난이도·오답·시간)를 sudoku-store 에 기록하고,
// 다음 게임에서 그 기록을 보고 난이도를 한 단계 올리거나 내림.
//
// 데모/촬영 모드: "데모 보드" 버튼을 누르면 solution 에서 3칸만 dash 처리한
// 거의 풀린 보드를 로드. 30초 안에 한 판 완료 → 다음 판 난이도 조정이 영상에
// 담김. 본판은 sudoku-gen 의 정상 난이도 그대로.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSudoku } from "sudoku-gen";
import { Shell } from "@/components/Shell";
import {
  getLastSudokuPlay,
  recordSudokuPlay,
  type SudokuDifficulty,
  type SudokuPlayEntry,
} from "@/lib/learning";
import { usePreferences } from "@/lib/preferences";
import { useT, type Messages } from "@/lib/i18n";

export const Route = createFileRoute("/sudoku")({
  head: () => ({
    meta: [
      { title: "Sudoku — DOTS" },
      {
        name: "description",
        content:
          "Sudoku 팩 — 직전 풀이 결과를 기억해 다음 판 난이도를 자동으로 한 단계 조정합니다.",
      },
    ],
  }),
  component: SudokuPage,
});

// ───────────────────────────────────────────────────────────────────
// 난이도 시간 임계값. 데모/촬영 시 한 곳만 수정해 짧게 잡으면 됨.
// 기본값은 일반 솔버 평균을 보수적으로 잡은 값.
// FAST 이하 + mistakes 0 → 한 단계 올림.
// SLOW 이상 OR mistakes ≥ 4 → 한 단계 내림.
// 그 외 → 유지.
//
// 촬영 모드 예시 (모든 fastSec=10, slowSec=120) — 데모 보드로 빠르게 끝내고
// 다음 판 난이도가 expert 방향으로 한 단계씩 올라가는 걸 보여줄 때.
// ───────────────────────────────────────────────────────────────────
const DIFFICULTY_THRESHOLDS: Record<SudokuDifficulty, { fastSec: number; slowSec: number }> = {
  easy: { fastSec: 300, slowSec: 720 },
  medium: { fastSec: 600, slowSec: 1320 },
  hard: { fastSec: 1080, slowSec: 2280 },
  expert: { fastSec: 1800, slowSec: 3600 },
};

const DIFFICULTY_ORDER: SudokuDifficulty[] = ["easy", "medium", "hard", "expert"];

const DIFFICULTY_LABEL: Record<SudokuDifficulty, string> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  expert: "expert",
};

function pickNextDifficulty(last?: SudokuPlayEntry): SudokuDifficulty {
  if (!last) return "medium";
  const { fastSec, slowSec } = DIFFICULTY_THRESHOLDS[last.difficulty];
  const idx = DIFFICULTY_ORDER.indexOf(last.difficulty);
  if (last.mistakes === 0 && last.timeSeconds <= fastSec) {
    return DIFFICULTY_ORDER[Math.min(idx + 1, DIFFICULTY_ORDER.length - 1)];
  }
  if (last.mistakes >= 4 || last.timeSeconds >= slowSec) {
    return DIFFICULTY_ORDER[Math.max(idx - 1, 0)];
  }
  return last.difficulty;
}

type Board = {
  puzzle: string;
  solution: string;
  difficulty: SudokuDifficulty;
};

function fetchBoard(difficulty: SudokuDifficulty): Board {
  const { puzzle, solution } = getSudoku(difficulty);
  return { puzzle, solution, difficulty };
}

// 데모 보드 — 솔루션에서 3칸만 dash 처리. difficulty 는 medium 으로 기록되어
// "0 오답 + 빠른 시간" 이면 다음 판이 hard 로 자동 승급. 본판 흐름과 동일한
// recordSudokuPlay → pickNextDifficulty 경로를 그대로 탐.
function fetchDemoBoard(): Board {
  const { solution } = getSudoku("easy");
  const blanks = [10, 40, 70];
  let puzzle = solution;
  for (const i of blanks) {
    puzzle = puzzle.slice(0, i) + "-" + puzzle.slice(i + 1);
  }
  return { puzzle, solution, difficulty: "medium" };
}

// Phase EN-4: 시간 표시 — 한국어 "N분 SS초" / 영어 "N min SSs".
function formatMMSS(totalSec: number, lang: "ko" | "en"): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return lang === "en"
    ? `${m} min ${s.toString().padStart(2, "0")}s`
    : `${m}분 ${s.toString().padStart(2, "0")}초`;
}

type CheckResult =
  | { kind: "incomplete"; emptyCount: number }
  | { kind: "scored"; mistakes: number; entry: SudokuPlayEntry; nextDifficulty: SudokuDifficulty };

function SudokuPage() {
  const lang = usePreferences().language;
  const L = useT().sudoku;
  const [board, setBoard] = useState<Board>(() =>
    fetchBoard(pickNextDifficulty(getLastSudokuPlay())),
  );
  // 사용자 입력 셀 — 고정 cell 은 null 위치에 puzzle 의 숫자 박힘. 입력 가능
  // cell 은 null 로 시작.
  const [cells, setCells] = useState<(number | null)[]>(() => initCells(board.puzzle));
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (result) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [result]);

  const elapsedSeconds = Math.floor((now - startedAt) / 1000);

  const fixedMask = useMemo(() => {
    const arr = new Array<boolean>(81);
    for (let i = 0; i < 81; i++) arr[i] = board.puzzle[i] !== "-";
    return arr;
  }, [board.puzzle]);

  const startBoard = useCallback((next: Board) => {
    setBoard(next);
    setCells(initCells(next.puzzle));
    setSelectedIdx(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    setResult(null);
  }, []);

  const onNewGame = useCallback(() => {
    const nextDiff = pickNextDifficulty(getLastSudokuPlay());
    startBoard(fetchBoard(nextDiff));
  }, [startBoard]);

  const onDemoBoard = useCallback(() => {
    startBoard(fetchDemoBoard());
  }, [startBoard]);

  const onSelectCell = (idx: number) => {
    if (result) return;
    if (fixedMask[idx]) return;
    setSelectedIdx(idx === selectedIdx ? null : idx);
  };

  const onEnterNumber = (n: number | null) => {
    if (selectedIdx === null) return;
    setCells((prev) => {
      const next = [...prev];
      next[selectedIdx] = n;
      return next;
    });
  };

  const onCheck = () => {
    const emptyCount = cells.filter((c) => c === null).length;
    if (emptyCount > 0) {
      setResult({ kind: "incomplete", emptyCount });
      return;
    }
    let mistakes = 0;
    for (let i = 0; i < 81; i++) {
      const expected = Number(board.solution[i]);
      if (cells[i] !== expected) mistakes++;
    }
    const entry = recordSudokuPlay({
      difficulty: board.difficulty,
      mistakes,
      timeSeconds: elapsedSeconds,
    });
    const nextDifficulty = pickNextDifficulty(entry);
    setResult({ kind: "scored", mistakes, entry, nextDifficulty });
  };

  return (
    <Shell>
      <div className="flex flex-col h-full">
        <header className="px-8 md:px-12 pt-10 pb-6 border-b border-border">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
            Sudoku Pack
          </p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">{L.title}</h1>
          <p className="mt-2 text-[13px] text-ink-soft max-w-xl">{L.description}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3 text-[12.5px] text-ink-soft">
                <span className="font-mono uppercase tracking-[0.14em]">{L.difficulty}</span>
                <span className="text-ink font-medium">{DIFFICULTY_LABEL[board.difficulty]}</span>
                <span className="text-ink-soft/40">·</span>
                <span className="font-mono">{formatMMSS(elapsedSeconds, lang)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDemoBoard}
                  className="h-9 px-3 rounded-md border border-border text-[12px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
                  title={L.demoTooltip}
                >
                  {L.demoBoard}
                </button>
                <button
                  type="button"
                  onClick={onNewGame}
                  className="h-9 px-3 rounded-md border border-border text-[12px] text-ink hover:bg-surface-2 transition-colors"
                >
                  {L.newGame}
                </button>
              </div>
            </div>

            <Board
              cells={cells}
              fixedMask={fixedMask}
              selectedIdx={selectedIdx}
              onSelectCell={onSelectCell}
              solution={board.solution}
              showSolutionMismatch={result?.kind === "scored"}
            />

            <Keypad
              onEnter={onEnterNumber}
              disabled={selectedIdx === null || result !== null}
              t={L}
            />

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={onCheck}
                disabled={result?.kind === "scored"}
                className="h-10 px-5 rounded-md bg-ink text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {L.check}
              </button>
              {result?.kind === "scored" && (
                <button
                  type="button"
                  onClick={onNewGame}
                  className="h-10 px-5 rounded-md border border-strong text-[13px] text-ink hover:bg-surface-2 transition-colors"
                >
                  {L.nextGame} ({DIFFICULTY_LABEL[result.nextDifficulty]})
                </button>
              )}
            </div>

            {result && (
              <ResultBanner
                result={result}
                elapsedSeconds={elapsedSeconds}
                board={board}
                lang={lang}
                t={L}
              />
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function initCells(puzzle: string): (number | null)[] {
  const out = new Array<number | null>(81);
  for (let i = 0; i < 81; i++) {
    const ch = puzzle[i];
    out[i] = ch === "-" ? null : Number(ch);
  }
  return out;
}

function Board({
  cells,
  fixedMask,
  selectedIdx,
  onSelectCell,
  solution,
  showSolutionMismatch,
}: {
  cells: (number | null)[];
  fixedMask: boolean[];
  selectedIdx: number | null;
  onSelectCell: (idx: number) => void;
  solution: string;
  showSolutionMismatch: boolean;
}) {
  return (
    <div className="grid grid-cols-9 w-full max-w-md mx-auto border-2 border-ink rounded-md overflow-hidden select-none">
      {cells.map((value, idx) => {
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        const fixed = fixedMask[idx];
        const selected = idx === selectedIdx;
        const isMismatch =
          showSolutionMismatch && !fixed && value !== null && value !== Number(solution[idx]);
        // 3×3 블록 경계만 굵게.
        const thickRight =
          c % 3 === 2 && c !== 8 ? "border-r-2 border-r-ink" : "border-r border-r-border";
        const thickBottom =
          r % 3 === 2 && r !== 8 ? "border-b-2 border-b-ink" : "border-b border-b-border";
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectCell(idx)}
            className={[
              "aspect-square flex items-center justify-center text-[15px] sm:text-[17px]",
              thickRight,
              thickBottom,
              fixed
                ? "bg-surface-2 text-ink font-semibold cursor-default"
                : "bg-card text-ink hover:bg-surface-2",
              selected ? "ring-2 ring-primary ring-inset" : "",
              isMismatch ? "text-red-500" : "",
            ].join(" ")}
          >
            {value ?? ""}
          </button>
        );
      })}
    </div>
  );
}

function Keypad({
  onEnter,
  disabled,
  t,
}: {
  onEnter: (n: number | null) => void;
  disabled: boolean;
  t: Messages["sudoku"];
}) {
  return (
    <div className="mt-5 grid grid-cols-10 gap-1.5 max-w-md mx-auto">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onEnter(n)}
          disabled={disabled}
          className="h-10 rounded-md border border-border text-[14px] text-ink hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onEnter(null)}
        disabled={disabled}
        className="h-10 rounded-md border border-border text-[12px] text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title={t.clearTooltip}
      >
        ⌫
      </button>
    </div>
  );
}

function ResultBanner({
  result,
  elapsedSeconds,
  board,
  lang,
  t,
}: {
  result: CheckResult;
  elapsedSeconds: number;
  board: Board;
  lang: "ko" | "en";
  t: Messages["sudoku"];
}) {
  const L = t;
  if (result.kind === "incomplete") {
    return (
      <div className="mt-5 rounded-md border border-border bg-surface px-4 py-3 text-[13px] text-ink-soft">
        {L.incomplete(result.emptyCount)}
      </div>
    );
  }
  const { mistakes, nextDifficulty } = result;
  const ok = mistakes === 0;
  const time = formatMMSS(elapsedSeconds, lang);
  const verdict = ok ? L.solved(time) : L.mistakes(mistakes, time);
  const sameLabel = nextDifficulty === board.difficulty;
  const next = sameLabel
    ? L.nextHold(DIFFICULTY_LABEL[nextDifficulty])
    : L.nextAdjust(DIFFICULTY_LABEL[nextDifficulty]);
  return (
    <div className="mt-5 rounded-md border border-strong bg-surface px-4 py-3 text-[13px] text-ink">
      {verdict} {next}
    </div>
  );
}

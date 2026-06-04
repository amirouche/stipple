// Sudoku Pack — 직전 판 결과 영구 저장.
//
// preferences-store.ts 와 동일 패턴 (모듈 cache + listeners + localStorage).
// 키 "dots:sudoku" 로 분리 — 선호 store ("dots:preferences") 와 다른 도메인.
// 채팅의 선호와 같은 "기억 레이어"의 다른 슬롯 — DOTS가 화면이 달라도
// 사용자를 기억한다는 데모 핵심.

const STORAGE_KEY = "dots:sudoku";

export type SudokuDifficulty = "easy" | "medium" | "hard" | "expert";

export interface SudokuPlayEntry {
  id: string;
  difficulty: SudokuDifficulty;
  mistakes: number;
  timeSeconds: number;
  clearedAt: number;
}

let cache: SudokuPlayEntry[] = [];
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn("[sudoku] persist failed:", err);
  }
}

const VALID_DIFFICULTIES: ReadonlyArray<SudokuDifficulty> = ["easy", "medium", "hard", "expert"];

export function hydrateSudokuStore(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<Partial<SudokuPlayEntry>>;
    if (Array.isArray(parsed)) {
      cache = parsed
        .filter((e): e is SudokuPlayEntry =>
          Boolean(
            e?.id &&
            typeof e?.difficulty === "string" &&
            VALID_DIFFICULTIES.includes(e.difficulty as SudokuDifficulty) &&
            typeof e?.mistakes === "number" &&
            typeof e?.timeSeconds === "number",
          ),
        )
        .map((e) => ({
          id: e.id,
          difficulty: e.difficulty,
          mistakes: e.mistakes,
          timeSeconds: e.timeSeconds,
          clearedAt: e.clearedAt ?? Date.now(),
        }));
      emit();
    }
  } catch (err) {
    console.warn("[sudoku] hydrate failed:", err);
  }
}

export function recordSudokuPlay(
  input: Omit<SudokuPlayEntry, "id" | "clearedAt">,
): SudokuPlayEntry {
  const entry: SudokuPlayEntry = {
    id: crypto.randomUUID(),
    difficulty: input.difficulty,
    mistakes: input.mistakes,
    timeSeconds: input.timeSeconds,
    clearedAt: Date.now(),
  };
  cache = [...cache, entry];
  persist();
  emit();
  return entry;
}

export function listSudokuPlays(): SudokuPlayEntry[] {
  return [...cache].sort((a, b) => b.clearedAt - a.clearedAt);
}

export function getLastSudokuPlay(): SudokuPlayEntry | undefined {
  return listSudokuPlays()[0];
}

export function clearSudokuPlays(): void {
  cache = [];
  persist();
  emit();
}

export function subscribeSudokuStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

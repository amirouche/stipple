// V6A Custom Dictionary store — 사용자가 명시적으로 가르친 alias 박는 자리.
// learning/store.ts (cloud 응답 캐시) 와 별도 store key — 캐시 데이터 영향 X.
//
// 저장 매체: localStorage 키 "dots:custom-dict". 기존 learning store 와
// 같은 패턴 — Phase A 는 localStorage, 향후 IndexedDB 마이그레이션 시 비동기
// API 시그니처 그대로 유지. 5MB cap 안에서 alias 1만 개까지 충분.
//
// API 비동기 — 호출 측 (resolveAlias 는 매 매칭마다 호출) 이 await 박아도
// 즉시 resolve 되도록. 향후 IndexedDB 전환 시 호출 측 변경 X.

const STORAGE_KEY = "dots:custom-dict";

export type AliasDirection = "alias" | "definition";

export interface AliasEntry {
  id: string;
  alias: string; // "두쫀쿠"
  canonical: string; // "두바이 쫀득쿠키"
  learnedAt: number; // Date.now()
  // alias = 짧은 → 긴 변환 (default). definition = 향후 "X 란 Y" 형식 정의
  // 등록 (Phase 6B 후보). 현재는 항상 "alias".
  direction: AliasDirection;
}

let cache: AliasEntry[] = [];
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
    console.warn("[dictionary] persist failed:", err);
  }
}

export function hydrateDictionary(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<Partial<AliasEntry>>;
    if (Array.isArray(parsed)) {
      cache = parsed
        .filter((e): e is AliasEntry => Boolean(e?.alias && e?.canonical && e?.id))
        .map((e) => ({
          id: e.id,
          alias: e.alias,
          canonical: e.canonical,
          learnedAt: e.learnedAt ?? Date.now(),
          direction: e.direction ?? "alias",
        }));
      emit();
    }
  } catch (err) {
    console.warn("[dictionary] hydrate failed:", err);
  }
}

// 같은 alias 가 이미 박혀있으면 갱신 (canonical 만 교체). 새 entry id 박힘.
// 호출 측이 "이미 있어요" UX 박고 싶으면 listAliases().some(e => e.alias===X)
// 미리 체크.
export async function addAlias(
  alias: string,
  canonical: string,
  direction: AliasDirection = "alias",
): Promise<AliasEntry> {
  const trimmedAlias = alias.trim();
  const trimmedCanonical = canonical.trim();
  cache = cache.filter((e) => e.alias !== trimmedAlias);
  const entry: AliasEntry = {
    id: crypto.randomUUID(),
    alias: trimmedAlias,
    canonical: trimmedCanonical,
    learnedAt: Date.now(),
    direction,
  };
  cache = [...cache, entry];
  persist();
  emit();
  return entry;
}

export async function removeAlias(alias: string): Promise<boolean> {
  const trimmed = alias.trim();
  const before = cache.length;
  cache = cache.filter((e) => e.alias !== trimmed);
  if (cache.length === before) return false;
  persist();
  emit();
  return true;
}

export function listAliases(): AliasEntry[] {
  return [...cache].sort((a, b) => b.learnedAt - a.learnedAt);
}

// 텍스트 내 alias 를 canonical 로 변환. 빈 dictionary 면 즉시 원래 텍스트
// 반환 — 매 매칭 hot path 에서 호출되므로 cost 0 이어야.
//
// 변환 전략: longest-alias-first. "두쫀쿠" / "쫀쿠" 둘 다 박혀있으면 더 긴
// "두쫀쿠" 부터 매칭 → 짧은 게 prefix-match 로 잘못 흡수되지 X.
//
// 변환 결과가 empty 면 원래 입력 반환 (안전망).
export async function resolveAlias(text: string): Promise<string> {
  if (cache.length === 0) return text;
  const sorted = [...cache].sort((a, b) => b.alias.length - a.alias.length);
  let result = text;
  for (const e of sorted) {
    if (!e.alias) continue;
    if (result.includes(e.alias)) {
      result = result.split(e.alias).join(e.canonical);
    }
  }
  return result || text;
}

export function subscribeDictionary(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function clearDictionary(): Promise<void> {
  cache = [];
  persist();
  emit();
}

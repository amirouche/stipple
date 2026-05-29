// Phase M0: Preference store — 선호 표현 (좋아/싫어) 영구 저장.
//
// 별도 키 "dots:preferences" — learning/store.ts (응답 캐시) 와 분리. Memory
// inject (다음 단계) 시 Cloud system prompt 의 USER_CONTEXT 에 박힐 데이터.
//
// 패턴: learning/store.ts + dictionary.ts 와 동일 — module-level cache + Set
// of listeners, localStorage 직렬화. 5MB cap 안에서 preference 수천 개까지 충분.
//
// addPreference 는 같은 (type, subject) 중복을 피해 갱신 — 사용자가 "매운 음식
// 좋아해" 를 두 번 말해도 entry 가 두 개 박히지 X.

const STORAGE_KEY = "dots:preferences";

export interface PreferenceEntry {
  id: string;
  type: "like" | "dislike";
  subject: string;
  createdAt: number;
}

let cache: PreferenceEntry[] = [];
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
    console.warn("[preferences] persist failed:", err);
  }
}

export function hydratePreferencesStore(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<Partial<PreferenceEntry>>;
    if (Array.isArray(parsed)) {
      cache = parsed
        .filter((e): e is PreferenceEntry =>
          Boolean(e?.id && e?.subject && (e?.type === "like" || e?.type === "dislike")),
        )
        .map((e) => ({
          id: e.id,
          type: e.type,
          subject: e.subject,
          createdAt: e.createdAt ?? Date.now(),
        }));
      emit();
    }
  } catch (err) {
    console.warn("[preferences] hydrate failed:", err);
  }
}

export function addPreference(type: "like" | "dislike", subject: string): PreferenceEntry {
  const trimmed = subject.trim();
  // 중복 제거: 같은 (type, subject) 가 박혀 있으면 떨궈낸 후 새 entry 박음.
  // 갱신된 createdAt 이 "가장 최근에 말함" 시점을 반영.
  cache = cache.filter((e) => !(e.type === type && e.subject === trimmed));
  const entry: PreferenceEntry = {
    id: crypto.randomUUID(),
    type,
    subject: trimmed,
    createdAt: Date.now(),
  };
  cache = [...cache, entry];
  persist();
  emit();
  return entry;
}

export function removePreference(id: string): boolean {
  const before = cache.length;
  cache = cache.filter((e) => e.id !== id);
  if (cache.length === before) return false;
  persist();
  emit();
  return true;
}

export function listPreferences(): PreferenceEntry[] {
  return [...cache].sort((a, b) => b.createdAt - a.createdAt);
}

export function listByType(type: "like" | "dislike"): PreferenceEntry[] {
  return listPreferences().filter((e) => e.type === type);
}

export function subscribePreferencesStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearPreferences(): void {
  cache = [];
  persist();
  emit();
}

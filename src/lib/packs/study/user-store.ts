// 사용자(혹은 LLM)가 만든 SAT 수학 문제 저장소.
// 로컬스토리지에 영속화하고, useSyncExternalStore 패턴으로 UI에 반응성을
// 제공한다. 베이스 5문제(SAT_MATH_PROBLEMS)와는 별개로 모이며, 조회 시
// sat-math.ts::getAllSATMathProblems가 두 소스를 합친다.
//
// 헌법: "LLM 응답을 일회용으로 흘려보내지 말고 팩에 저장한다." 이 파일이
// 그 약속을 지키는 영속 레이어다.

import { useSyncExternalStore } from "react";
import type { SATMathProblem } from "./types";

const STORAGE_KEY = "user-pack-contents:study-companion";

let userProblems: SATMathProblem[] = [];
let hydrated = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userProblems));
  } catch (err) {
    console.error("[user-sat-store] persist failed", err);
  }
}

export function hydrateUserSATProblems(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      userProblems = parsed as SATMathProblem[];
      emit();
    }
  } catch (err) {
    console.error("[user-sat-store] hydrate failed", err);
  }
}

export function getUserSATProblems(): SATMathProblem[] {
  return userProblems;
}

export function useUserSATProblems(): SATMathProblem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => userProblems,
    () => userProblems,
  );
}

export function addUserSATProblem(p: SATMathProblem): void {
  // New reference so useSyncExternalStore notices the change.
  userProblems = [...userProblems, p];
  emit();
  persist();
}

export function clearUserSATProblems(): void {
  userProblems = [];
  emit();
  persist();
}

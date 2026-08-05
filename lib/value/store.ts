"use client";

import {
  FIRST_USE_PITCH_STORAGE_KEY,
  MEMORY_APPLY_COUNT_KEY,
  VALUE_NOTIFY_STORAGE_KEY,
} from "./constants";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function hasSeenValuePitch(): boolean {
  if (!canUseStorage()) return true;
  try {
    return localStorage.getItem(FIRST_USE_PITCH_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markValuePitchSeen(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(FIRST_USE_PITCH_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function getMemoryApplyCount(): number {
  if (!canUseStorage()) return 0;
  try {
    const raw = localStorage.getItem(MEMORY_APPLY_COUNT_KEY);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function incrementMemoryApplyCount(by = 1): number {
  const next = getMemoryApplyCount() + Math.max(1, by);
  if (canUseStorage()) {
    try {
      localStorage.setItem(MEMORY_APPLY_COUNT_KEY, String(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export type ValueSavingsNotice = {
  at: string;
  minutesSaved: number;
  message: string;
};

export function loadLatestValueSavingsNotice(): ValueSavingsNotice | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(VALUE_NOTIFY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ValueSavingsNotice;
  } catch {
    return null;
  }
}

export function saveValueSavingsNotice(notice: ValueSavingsNotice): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(VALUE_NOTIFY_STORAGE_KEY, JSON.stringify(notice));
  } catch {
    // ignore
  }
}

export function resetValueStoreForTests(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(FIRST_USE_PITCH_STORAGE_KEY);
  localStorage.removeItem(MEMORY_APPLY_COUNT_KEY);
  localStorage.removeItem(VALUE_NOTIFY_STORAGE_KEY);
}

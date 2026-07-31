"use client";

import { getFieldEntry } from "./field-catalog";
import { markFieldSaved } from "./persistence";
import type { SmartProfileFact, SmartProfileFieldKey } from "./types";

const FACTS_KEY = "atlas-smart-profile-facts";

function loadAll(): SmartProfileFact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmartProfileFact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(facts: SmartProfileFact[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FACTS_KEY, JSON.stringify(facts));
}

export function listSmartProfileFacts(): SmartProfileFact[] {
  return loadAll();
}

export function getSmartProfileFact(
  key: SmartProfileFieldKey,
): SmartProfileFact | null {
  return loadAll().find((fact) => fact.key === key) ?? null;
}

export function saveSmartProfileFact(
  key: SmartProfileFieldKey,
  value: string,
): SmartProfileFact {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("値を入力してください");
  }
  const entry = getFieldEntry(key);
  const next: SmartProfileFact = {
    key,
    label: entry.label,
    value: trimmed,
    savedAt: new Date().toISOString(),
  };
  const others = loadAll().filter((fact) => fact.key !== key);
  saveAll([next, ...others]);
  markFieldSaved(key);
  return next;
}

export function resetSmartProfileFactsForTests(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FACTS_KEY);
}

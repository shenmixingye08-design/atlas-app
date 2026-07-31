"use client";

import type { SmartProfileFieldKey } from "./types";
import { SMART_PROFILE_SUGGESTION_EVALUATION } from "./feature-evaluation";

const PREFS_KEY = "atlas-smart-profile-suggestion-prefs";
const HISTORY_KEY = "atlas-smart-profile-input-history";

type SuggestionPrefs = {
  /** fieldKey → ISO snooze-until */
  snoozed: Record<string, string>;
  /** field keys permanently silenced after save */
  savedKeys: string[];
};

type InputHistory = {
  /** fieldKey → normalizedValue → count */
  counts: Record<string, Record<string, number>>;
};

const DEFAULT_PREFS: SuggestionPrefs = { snoozed: {}, savedKeys: [] };
const DEFAULT_HISTORY: InputHistory = { counts: {} };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadSuggestionPrefs(): SuggestionPrefs {
  const parsed = readJson<Partial<SuggestionPrefs>>(PREFS_KEY, DEFAULT_PREFS);
  return {
    snoozed:
      parsed.snoozed && typeof parsed.snoozed === "object" ? parsed.snoozed : {},
    savedKeys: Array.isArray(parsed.savedKeys) ? parsed.savedKeys : [],
  };
}

function saveSuggestionPrefs(prefs: SuggestionPrefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function isFieldSaved(key: SmartProfileFieldKey): boolean {
  return loadSuggestionPrefs().savedKeys.includes(key);
}

export function markFieldSaved(key: SmartProfileFieldKey): void {
  const prefs = loadSuggestionPrefs();
  if (!prefs.savedKeys.includes(key)) prefs.savedKeys.push(key);
  delete prefs.snoozed[key];
  saveSuggestionPrefs(prefs);
}

export function snoozeField(
  key: SmartProfileFieldKey,
  days: number = SMART_PROFILE_SUGGESTION_EVALUATION.skipDays,
  now: Date = new Date(),
): void {
  const prefs = loadSuggestionPrefs();
  const until = new Date(now);
  until.setDate(until.getDate() + days);
  prefs.snoozed[key] = until.toISOString();
  saveSuggestionPrefs(prefs);
}

export function snoozeFields(
  keys: SmartProfileFieldKey[],
  days: number = SMART_PROFILE_SUGGESTION_EVALUATION.skipDays,
  now: Date = new Date(),
): void {
  for (const key of keys) snoozeField(key, days, now);
}

export function isFieldSuggestionVisible(
  key: SmartProfileFieldKey,
  now: Date = new Date(),
): boolean {
  const prefs = loadSuggestionPrefs();
  if (prefs.savedKeys.includes(key)) return false;
  const until = prefs.snoozed[key];
  if (!until) return true;
  return new Date(until).getTime() <= now.getTime();
}

export function loadInputHistory(): InputHistory {
  const parsed = readJson<Partial<InputHistory>>(HISTORY_KEY, DEFAULT_HISTORY);
  return {
    counts:
      parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {},
  };
}

export function normalizeInputValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Record a seen value for recurring-input detection (client-side). */
export function recordInputObservation(
  key: SmartProfileFieldKey,
  value: string,
): number {
  const normalized = normalizeInputValue(value);
  if (!normalized || normalized.length < 2) return 0;
  const history = loadInputHistory();
  if (!history.counts[key]) history.counts[key] = {};
  const next = (history.counts[key][normalized] ?? 0) + 1;
  history.counts[key][normalized] = next;
  writeJson(HISTORY_KEY, history);
  return next;
}

export function getRecurringValue(
  key: SmartProfileFieldKey,
  threshold: number = SMART_PROFILE_SUGGESTION_EVALUATION.recurringThreshold,
): string | null {
  const history = loadInputHistory();
  const bucket = history.counts[key];
  if (!bucket) return null;
  let best: { value: string; count: number } | null = null;
  for (const [value, count] of Object.entries(bucket)) {
    if (count >= threshold && (!best || count > best.count)) {
      best = { value, count };
    }
  }
  return best?.value ?? null;
}

export function resetSmartProfileSuggestionStateForTests(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PREFS_KEY);
  window.localStorage.removeItem(HISTORY_KEY);
}

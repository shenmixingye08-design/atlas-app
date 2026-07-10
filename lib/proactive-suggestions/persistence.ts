"use client";

import type { ProactiveSuggestion } from "./types";

const STORAGE_KEY = "atlas-proactive-suggestion-preferences";

type SuggestionPreferences = {
  dismissed: string[];
  snoozed: Record<string, string>;
};

const DEFAULT_PREFERENCES: SuggestionPreferences = {
  dismissed: [],
  snoozed: {},
};

function loadPreferences(): SuggestionPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<SuggestionPreferences>;
    return {
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
      snoozed:
        parsed.snoozed && typeof parsed.snoozed === "object"
          ? parsed.snoozed
          : {},
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(prefs: SuggestionPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function dismissProactiveSuggestion(id: string): void {
  const prefs = loadPreferences();
  if (!prefs.dismissed.includes(id)) {
    prefs.dismissed.push(id);
  }
  delete prefs.snoozed[id];
  savePreferences(prefs);
}

export function snoozeProactiveSuggestion(
  id: string,
  until: Date = snoozeUntilTomorrow(),
): void {
  const prefs = loadPreferences();
  prefs.snoozed[id] = until.toISOString();
  savePreferences(prefs);
}

export function snoozeUntilTomorrow(now: Date = new Date()): Date {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);
  return tomorrow;
}

export function snoozeForHours(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function isProactiveSuggestionVisible(
  id: string,
  now: Date = new Date(),
): boolean {
  const prefs = loadPreferences();
  if (prefs.dismissed.includes(id)) return false;

  const until = prefs.snoozed[id];
  if (!until) return true;

  return new Date(until).getTime() <= now.getTime();
}

export function filterVisibleProactiveSuggestions(
  suggestions: ProactiveSuggestion[],
  now: Date = new Date(),
): ProactiveSuggestion[] {
  return suggestions.filter((item) => isProactiveSuggestionVisible(item.id, now));
}

export function resetProactiveSuggestionPreferences(): void {
  savePreferences(DEFAULT_PREFERENCES);
}

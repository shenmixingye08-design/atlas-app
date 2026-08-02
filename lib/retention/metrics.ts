import { getOnboardingState } from "@/lib/onboarding/store";

import { loadRetentionState, saveRetentionState } from "./store";
import type { RetentionCohortFlags } from "./types";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, end: Date): number {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Record an active day and evaluate 7/14/30 retention flags when the window closes.
 * Pure client cohort counters — no AI.
 */
export function recordRetentionActivity(now: Date = new Date()): RetentionCohortFlags {
  const state = loadRetentionState();
  const onboarding = getOnboardingState();
  const key = dayKey(now);
  const firstActiveAt =
    state.cohort.firstActiveAt ??
    onboarding.createdAt ??
    now.toISOString();
  const activeDayKeys = state.cohort.activeDayKeys.includes(key)
    ? state.cohort.activeDayKeys
    : [...state.cohort.activeDayKeys, key];

  const elapsed = daysBetween(firstActiveAt, now);
  const activeSet = new Set(activeDayKeys);

  const hasActivityOnOrAfter = (n: number): boolean => {
    const start = new Date(firstActiveAt);
    const target = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + n),
    );
    return activeSet.has(dayKey(target)) || activeDayKeys.some((k) => {
      const d = daysBetween(firstActiveAt, new Date(`${k}T00:00:00.000Z`));
      return d >= n;
    });
  };

  const cohort: RetentionCohortFlags = {
    firstActiveAt,
    lastActiveAt: now.toISOString(),
    activeDayKeys,
    retainedDay7:
      elapsed >= 7 ? hasActivityOnOrAfter(6) || activeDayKeys.length >= 5 : null,
    retainedDay14:
      elapsed >= 14 ? hasActivityOnOrAfter(13) || activeDayKeys.length >= 8 : null,
    retainedDay30:
      elapsed >= 30 ? hasActivityOnOrAfter(29) || activeDayKeys.length >= 12 : null,
  };

  saveRetentionState({ cohort });
  return cohort;
}

export function getRetentionRatesSummary(
  cohort: RetentionCohortFlags = loadRetentionState().cohort,
): {
  day7: boolean | null;
  day14: boolean | null;
  day30: boolean | null;
  activeDays: number;
} {
  return {
    day7: cohort.retainedDay7,
    day14: cohort.retainedDay14,
    day30: cohort.retainedDay30,
    activeDays: cohort.activeDayKeys.length,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";

import {
  HOME_LIVE_REFRESH_MS,
  activeRunIds,
  findNewlyCompletedRun,
  type HomeCompletedRun,
} from "@/lib/automation-first/home-core-state";
import {
  fetchAutomationOperationsSummary,
  fetchAutomationRunsAll,
} from "@/lib/automation-platform/client";
import type { AutomationOperationsSummary } from "@/lib/automation-platform/operations/summary";
import type { AutomationRun } from "@/lib/automation-platform/types";

export type LiveOpsUpdate = {
  summary: AutomationOperationsSummary;
  runs: AutomationRun[];
  /** A run seen active before this refresh that has now fully succeeded. */
  completed: HomeCompletedRun | null;
};

/**
 * Quietly refreshes operations data while runs are active and the tab is
 * visible (plus once on tab return). Failures keep the last known data —
 * the page's initial load is responsible for surfacing errors.
 * Returns `refreshNow` for callers that just changed something.
 */
export function useLiveOpsRefresh({
  enabled,
  runs,
  onUpdate,
}: {
  enabled: boolean;
  runs: AutomationRun[];
  onUpdate: (update: LiveOpsUpdate) => void;
}): { refreshNow: () => void } {
  const [tick, setTick] = useState(0);
  const runsRef = useRef(runs);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    runsRef.current = runs;
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    if (!enabled || tick === 0) return;
    let cancelled = false;
    void Promise.all([
      fetchAutomationOperationsSummary(),
      fetchAutomationRunsAll({ sort: "newest" }),
    ])
      .then(([summary, nextRuns]) => {
        if (cancelled) return;
        const completed = findNewlyCompletedRun(
          activeRunIds(runsRef.current),
          nextRuns,
        );
        runsRef.current = nextRuns;
        onUpdateRef.current({ summary, runs: nextRuns, completed });
      })
      .catch(() => {
        // Next tick retries; stale data is never presented as new success.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const hasActiveRuns = activeRunIds(runs).size > 0;
  useEffect(() => {
    if (!enabled || !hasActiveRuns) return;
    const onTick = () => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    };
    const timer = window.setInterval(onTick, HOME_LIVE_REFRESH_MS);
    document.addEventListener("visibilitychange", onTick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onTick);
    };
  }, [enabled, hasActiveRuns]);

  return { refreshNow: () => setTick((value) => value + 1) };
}

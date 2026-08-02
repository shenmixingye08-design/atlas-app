"use client";

import { useCallback, useEffect, useState } from "react";

import { resolveClientAutomationFirstPreferOn } from "./client-rollout";
import { fetchFeatureAvailability } from "./client";
import type { FeatureAvailabilityMap, FeatureFlagId } from "./types";
import { FEATURE_FLAG_IDS } from "./registry";

/** Flags that must not flash "on" in production before the server map loads. */
const GATED_UNTIL_LOADED: ReadonlySet<FeatureFlagId> = new Set([
  "automation_first_home_enabled",
  "automation_first_navigation_enabled",
  "automation_design_system_enabled",
  "automation_dashboard_v2_enabled",
  "automation_v2_enabled",
  "automation_memory_enabled",
  "automation_approval_enabled",
  "workflow_learning_enabled",
  "automation_operations_enabled",
]);

const AF_ROLLOUT_IDS: ReadonlySet<FeatureFlagId> = new Set([
  "automation_first_home_enabled",
  "automation_first_navigation_enabled",
  "automation_design_system_enabled",
  "automation_dashboard_v2_enabled",
  "automation_v2_enabled",
  "automation_operations_enabled",
]);

function buildDefaultAvailability(): FeatureAvailabilityMap {
  const preferAfOn = resolveClientAutomationFirstPreferOn();
  return FEATURE_FLAG_IDS.reduce<FeatureAvailabilityMap>((map, id) => {
    if (AF_ROLLOUT_IDS.has(id) && preferAfOn) {
      map[id] = true;
      return map;
    }
    map[id] = !GATED_UNTIL_LOADED.has(id);
    return map;
  }, {} as FeatureAvailabilityMap);
}

export function useFeatureAvailability() {
  const [flags, setFlags] = useState<FeatureAvailabilityMap>(
    buildDefaultAvailability,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      void fetchFeatureAvailability()
        .then((next) => {
          if (!cancelled) {
            setFlags(next);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // Keep optimistic AF defaults on Preview/dev — never force legacy home.
          setFlags(buildDefaultAvailability());
          setError(
            err instanceof Error
              ? err.message
              : "機能フラグの取得に失敗しました",
          );
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const isAvailable = (id: FeatureFlagId): boolean => flags[id] ?? true;

  return { flags, loading, error, reload, isAvailable };
}

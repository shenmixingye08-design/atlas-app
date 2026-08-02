"use client";

import { useEffect, useState } from "react";

import { fetchFeatureAvailability } from "./client";
import type { FeatureAvailabilityMap, FeatureFlagId } from "./types";
import { FEATURE_FLAG_IDS } from "./registry";

/** Flags that must stay off until the server map loads (avoid FOUC of new UI). */
const DEFAULT_OFF_UNTIL_LOADED: ReadonlySet<FeatureFlagId> = new Set([
  "automation_first_home_enabled",
  "automation_first_navigation_enabled",
  "automation_design_system_enabled",
  "automation_dashboard_v2_enabled",
  "automation_v2_enabled",
  "automation_memory_enabled",
  "automation_approval_enabled",
  "workflow_learning_enabled",
]);

const DEFAULT_AVAILABILITY = FEATURE_FLAG_IDS.reduce<FeatureAvailabilityMap>(
  (map, id) => {
    map[id] = !DEFAULT_OFF_UNTIL_LOADED.has(id);
    return map;
  },
  {} as FeatureAvailabilityMap,
);

export function useFeatureAvailability() {
  const [flags, setFlags] = useState<FeatureAvailabilityMap>(
    DEFAULT_AVAILABILITY,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchFeatureAvailability()
      .then((next) => {
        if (!cancelled) {
          setFlags(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlags(DEFAULT_AVAILABILITY);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAvailable = (id: FeatureFlagId): boolean => flags[id] ?? true;

  return { flags, loading, isAvailable };
}

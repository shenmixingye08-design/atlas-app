"use client";

import { useEffect, useState } from "react";

import { fetchFeatureAvailability } from "./client";
import type { FeatureAvailabilityMap, FeatureFlagId } from "./types";
import { FEATURE_FLAG_IDS } from "./registry";

const DEFAULT_AVAILABILITY = FEATURE_FLAG_IDS.reduce<FeatureAvailabilityMap>(
  (map, id) => {
    map[id] = true;
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

import {
  getPopularityFeatureDefinition,
  isPopularityFeatureId,
  POPULARITY_FEATURE_DEFINITIONS,
  POPULARITY_FEATURE_IDS,
} from "@/lib/owner/popularity-ranking/registry";

import type { CostFeatureDefinition, CostFeatureId } from "./types";

export const COST_FEATURE_DEFINITIONS: readonly CostFeatureDefinition[] =
  POPULARITY_FEATURE_DEFINITIONS;

export const COST_FEATURE_IDS: readonly CostFeatureId[] = POPULARITY_FEATURE_IDS;

export function getCostFeatureDefinition(
  id: CostFeatureId,
): CostFeatureDefinition {
  return getPopularityFeatureDefinition(id);
}

export function isCostFeatureId(value: string): value is CostFeatureId {
  return isPopularityFeatureId(value);
}

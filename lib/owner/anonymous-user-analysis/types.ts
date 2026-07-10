import type { PlanId } from "@/lib/billing/plans/types";
import type { PopularityFeatureId } from "@/lib/owner/popularity-ranking/types";

export type AnonymousUsageEvent = {
  anonymousUserId: string;
  planId: PlanId;
  featureId: PopularityFeatureId | null;
  costUsd: number;
  timestamp: string;
  source: "orchestration" | "automation";
};

export type AnonymousUserRow = {
  anonymousUserId: string;
  planId: PlanId;
  planLabel: string;
  apiCostUsd: number;
  profitMarginPercent: number | null;
  featuresUsed: readonly string[];
  usageCount: number;
  isHighCost: boolean;
  isEstimated: boolean;
};

export type AnonymousUserAnalysisSnapshot = {
  period: {
    month: string;
    monthLabel: string;
  };
  users: readonly AnonymousUserRow[];
  highCostCount: number;
  isEstimated: boolean;
  generatedAt: string;
};

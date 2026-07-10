import type { PlanId } from "@/lib/billing/plans/types";

export type CancellationReasonId =
  | "price"
  | "not_used"
  | "too_difficult"
  | "other";

export type CancellationReasonDefinition = {
  id: CancellationReasonId;
  label: string;
};

export type CancellationEventSource =
  | "stripe_webhook"
  | "billing_portal"
  | "manual";

export type CancellationEvent = {
  userId: string;
  planId: PlanId;
  reasonId: CancellationReasonId;
  timestamp: string;
  source: CancellationEventSource;
};

export type CancellationReasonBreakdown = {
  reasonId: CancellationReasonId;
  label: string;
  count: number;
  sharePercent: number;
  momChangePercent: number | null;
};

export type CancellationAnalysisSnapshot = {
  period: {
    month: string;
    monthLabel: string;
    previousMonth: string;
    previousMonthLabel: string;
  };
  canceledCount: number;
  churnRatePercent: number | null;
  momChangePercent: number | null;
  reasons: readonly CancellationReasonBreakdown[];
  isEstimated: boolean;
  generatedAt: string;
};

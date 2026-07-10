import type { CancellationReasonId } from "./types";

/** Baseline monthly cancellations when no live telemetry exists yet. */
export const ESTIMATED_MONTHLY_CANCELLATIONS = 8;

/** Estimated reason distribution (must sum to 1). */
export const ESTIMATED_REASON_SHARES: Record<CancellationReasonId, number> = {
  price: 0.35,
  not_used: 0.3,
  too_difficult: 0.2,
  other: 0.15,
};

/** Estimated monthly churn rate for mock display. */
export const ESTIMATED_CHURN_RATE_PERCENT = 4.2;

/** Previous month multiplier for mock MoM comparison. */
export const ESTIMATED_PREVIOUS_MONTH_RATIO = 0.85;

export function buildEstimatedCancellationMetrics(now: Date = new Date()): {
  canceledCount: number;
  previousCanceledCount: number;
  churnRatePercent: number;
  reasonCounts: Record<CancellationReasonId, number>;
} {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const canceledCount = Math.max(
    1,
    Math.round(
      ESTIMATED_MONTHLY_CANCELLATIONS * (dayOfMonth / daysInMonth),
    ),
  );
  const previousCanceledCount = Math.max(
    1,
    Math.round(
      ESTIMATED_MONTHLY_CANCELLATIONS * ESTIMATED_PREVIOUS_MONTH_RATIO,
    ),
  );

  const reasonCounts = {} as Record<CancellationReasonId, number>;
  let allocated = 0;

  for (const [index, reasonId] of (
    Object.keys(ESTIMATED_REASON_SHARES) as CancellationReasonId[]
  ).entries()) {
    const isLast =
      index === Object.keys(ESTIMATED_REASON_SHARES).length - 1;
    const count = isLast
      ? Math.max(0, canceledCount - allocated)
      : Math.round(canceledCount * ESTIMATED_REASON_SHARES[reasonId]);
    reasonCounts[reasonId] = count;
    allocated += count;
  }

  return {
    canceledCount,
    previousCanceledCount,
    churnRatePercent: ESTIMATED_CHURN_RATE_PERCENT,
    reasonCounts,
  };
}

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";

import { formatOwnerMonthKey, formatOwnerMonthLabel } from "../format";
import {
  CANCELLATION_REASON_IDS,
  getCancellationReasonDefinition,
} from "./registry";
import { listCancellationEvents } from "./store";
import type {
  CancellationAnalysisSnapshot,
  CancellationEvent,
  CancellationReasonBreakdown,
} from "./types";

function getPreviousMonthKey(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 2, 1);
  return formatOwnerMonthKey(date);
}

function filterEventsByMonth(
  events: readonly CancellationEvent[],
  monthKey: string,
): CancellationEvent[] {
  return events.filter((event) => event.timestamp.startsWith(monthKey));
}

function computeMomChangePercent(
  currentCount: number,
  previousCount: number,
): number | null {
  if (previousCount === 0) {
    return currentCount > 0 ? 100 : null;
  }

  return Math.round(((currentCount - previousCount) / previousCount) * 100);
}

function computeChurnRatePercent(
  canceledCount: number,
  paidSubscribers: number,
): number | null {
  const base = paidSubscribers + canceledCount;
  if (base <= 0) return null;
  return Math.round((canceledCount / base) * 1000) / 10;
}

function buildReasonBreakdown(
  currentEvents: readonly CancellationEvent[],
  previousEvents: readonly CancellationEvent[],
  totalCanceled: number,
): CancellationReasonBreakdown[] {
  return CANCELLATION_REASON_IDS.map((reasonId) => {
    const definition = getCancellationReasonDefinition(reasonId);
    const count = currentEvents.filter(
      (event) => event.reasonId === reasonId,
    ).length;
    const previousCount = previousEvents.filter(
      (event) => event.reasonId === reasonId,
    ).length;
    const sharePercent =
      totalCanceled > 0 ? Math.round((count / totalCanceled) * 100) : 0;

    return {
      reasonId,
      label: definition.label,
      count,
      sharePercent,
      momChangePercent: computeMomChangePercent(count, previousCount),
    };
  });
}

export function buildCancellationAnalysisSnapshot(
  now: Date = new Date(),
): CancellationAnalysisSnapshot {
  const monthKey = formatOwnerMonthKey(now);
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const events = listCancellationEvents();
  const currentEvents = filterEventsByMonth(events, monthKey);
  const previousEvents = filterEventsByMonth(events, previousMonthKey);

  const previousMonthDate = new Date(
    Number(previousMonthKey.slice(0, 4)),
    Number(previousMonthKey.slice(5, 7)) - 1,
    1,
  );

  const canceledCount = currentEvents.length;
  const billing = getOwnerBillingMetrics();
  const churnRatePercent = computeChurnRatePercent(
    canceledCount,
    billing.paidSubscribers,
  );

  return {
    period: {
      month: monthKey,
      monthLabel: formatOwnerMonthLabel(now),
      previousMonth: previousMonthKey,
      previousMonthLabel: formatOwnerMonthLabel(previousMonthDate),
    },
    canceledCount,
    churnRatePercent,
    momChangePercent: computeMomChangePercent(
      canceledCount,
      previousEvents.length,
    ),
    reasons: buildReasonBreakdown(
      currentEvents,
      previousEvents,
      canceledCount,
    ),
    isEstimated: false,
    generatedAt: now.toISOString(),
  };
}

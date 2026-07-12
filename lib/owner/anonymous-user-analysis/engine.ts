import { getPlanDefinition } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";
import { getPopularityFeatureDefinition } from "@/lib/owner/popularity-ranking/registry";
import type { PopularityFeatureId } from "@/lib/owner/popularity-ranking/types";

import { formatOwnerMonthKey, formatOwnerMonthLabel } from "../format";
import {
  FEATURE_LABELS,
  HIGH_COST_API_USD_THRESHOLD,
  HIGH_COST_MARGIN_THRESHOLD,
} from "./defaults";
import { hasAnonymousUsageRecords, listAnonymousUsageEvents } from "./store";
import type {
  AnonymousUsageEvent,
  AnonymousUserAnalysisSnapshot,
  AnonymousUserRow,
} from "./types";

/** Margin display only — uses ATLAS_USD_JPY_RATE when set; otherwise null margin. */
function usdFromJpy(jpy: number): number | null {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return jpy / rate;
}

function filterEventsByMonth(
  events: readonly AnonymousUsageEvent[],
  monthKey: string,
): AnonymousUsageEvent[] {
  return events.filter((event) => event.timestamp.startsWith(monthKey));
}

function resolveFeatureLabel(featureId: PopularityFeatureId | null): string | null {
  if (!featureId) return null;
  try {
    return getPopularityFeatureDefinition(featureId).label;
  } catch {
    return FEATURE_LABELS[featureId] ?? featureId;
  }
}

function computeProfitMarginPercent(
  planId: PlanId,
  apiCostUsd: number,
): number | null {
  const plan = getPlanDefinition(planId);
  if (plan.monthlyPriceJpy <= 0) return null;

  const revenueUsd = usdFromJpy(plan.monthlyPriceJpy);
  if (revenueUsd === null || revenueUsd <= 0) return null;

  const margin = ((revenueUsd - apiCostUsd) / revenueUsd) * 100;
  return Math.round(margin);
}

function resolveHighCost(
  apiCostUsd: number,
  profitMarginPercent: number | null,
): boolean {
  if (apiCostUsd >= HIGH_COST_API_USD_THRESHOLD) return true;
  if (profitMarginPercent !== null && profitMarginPercent <= HIGH_COST_MARGIN_THRESHOLD) {
    return true;
  }
  return false;
}

function aggregateUserRows(events: readonly AnonymousUsageEvent[]): AnonymousUserRow[] {
  const grouped = new Map<
    string,
    {
      planId: PlanId;
      apiCostUsd: number;
      usageCount: number;
      features: Set<string>;
    }
  >();

  for (const event of events) {
    const current = grouped.get(event.anonymousUserId) ?? {
      planId: event.planId,
      apiCostUsd: 0,
      usageCount: 0,
      features: new Set<string>(),
    };

    current.apiCostUsd += event.costUsd;
    current.usageCount += 1;
    current.planId = event.planId;

    const label = resolveFeatureLabel(event.featureId);
    if (label) current.features.add(label);

    grouped.set(event.anonymousUserId, current);
  }

  return [...grouped.entries()]
    .map(([anonymousUserId, aggregate]) => {
      const apiCostUsd = Math.round(aggregate.apiCostUsd * 100) / 100;
      const plan = getPlanDefinition(aggregate.planId);
      const profitMarginPercent = computeProfitMarginPercent(
        aggregate.planId,
        apiCostUsd,
      );

      return {
        anonymousUserId,
        planId: aggregate.planId,
        planLabel: plan.name,
        apiCostUsd,
        profitMarginPercent,
        featuresUsed: [...aggregate.features].sort(),
        usageCount: aggregate.usageCount,
        isHighCost: resolveHighCost(apiCostUsd, profitMarginPercent),
        isEstimated: false,
      };
    })
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd);
}

export function buildAnonymousUserAnalysisSnapshot(
  now: Date = new Date(),
): AnonymousUserAnalysisSnapshot {
  const monthKey = formatOwnerMonthKey(now);
  const allEvents = listAnonymousUsageEvents();
  const events = filterEventsByMonth(allEvents, monthKey);

  if (!hasAnonymousUsageRecords() || events.length === 0) {
    return {
      period: {
        month: monthKey,
        monthLabel: formatOwnerMonthLabel(now),
      },
      users: [],
      highCostCount: 0,
      isEstimated: false,
      generatedAt: now.toISOString(),
    };
  }

  const users = aggregateUserRows(events);

  return {
    period: {
      month: monthKey,
      monthLabel: formatOwnerMonthLabel(now),
    },
    users,
    highCostCount: users.filter((user) => user.isHighCost).length,
    isEstimated: false,
    generatedAt: now.toISOString(),
  };
}

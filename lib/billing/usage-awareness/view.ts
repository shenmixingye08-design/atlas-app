import type { PlanDefinition, PlanId } from "@/lib/billing/plans/types";
import type { UsageLimitSummary, UsageMeter } from "@/lib/billing/usage/types";

import { findUsageBillingInconsistencies } from "./consistency";
import { isUnlimitedLimit, resolveUsageWarningLevel, usageLevelRank, usageRates } from "./levels";
import { USAGE_METER_UNIT } from "./meters";
import { recommendUpgradeForMeter } from "./recommend";
import { formatUsageResetLabel, nextUsageResetAt } from "./reset";
import {
  USAGE_METER_IDS,
  type UsageAwarenessView,
  type UsageItemView,
  type UsageMeterId,
} from "./types";

function meterOf(usage: UsageLimitSummary, id: UsageMeterId): UsageMeter {
  if (id === "automationTasks") return usage.automationTasks;
  return usage[id];
}

export function buildUsageItemView(input: {
  id: UsageMeterId;
  meter: UsageMeter;
  planId: PlanId;
  month: string;
  plans: readonly PlanDefinition[];
}): UsageItemView {
  const unlimited = isUnlimitedLimit(input.meter.limit);
  const offered = unlimited || input.meter.limit > 0;
  const rates = usageRates(input.meter);
  const recommendation = offered
    ? recommendUpgradeForMeter({
        currentPlanId: input.planId,
        meterId: input.id,
        plans: input.plans,
      })
    : null;

  return {
    id: input.id,
    planId: input.planId,
    used: input.meter.used,
    limit: input.meter.limit,
    remaining: rates.remaining,
    usageRate: rates.usageRate,
    remainingRate: rates.remainingRate,
    resetAt: nextUsageResetAt(input.month),
    resetLabel: formatUsageResetLabel(input.month),
    level: resolveUsageWarningLevel(input.meter),
    offered,
    unlimited,
    unit: USAGE_METER_UNIT[input.id],
    primaryUpgrade: recommendation?.primary ?? null,
    secondaryUpgrade: recommendation?.secondary ?? null,
  };
}

export function buildUsageAwarenessView(input: {
  usage: UsageLimitSummary;
  catalog: readonly PlanDefinition[];
  subscribedPlanId?: PlanId;
}): UsageAwarenessView {
  const planId = input.usage.planId;
  const items = USAGE_METER_IDS.map((id) =>
    buildUsageItemView({
      id,
      meter: meterOf(input.usage, id),
      planId,
      month: input.usage.month,
      plans: input.catalog,
    }),
  );

  const alertItems = items.filter((item) => item.offered && item.level !== "normal");
  const headline =
    alertItems.sort((a, b) => usageLevelRank(b.level) - usageLevelRank(a.level))[0] ??
    null;

  return {
    planId,
    subscribedPlanId: input.subscribedPlanId ?? planId,
    month: input.usage.month,
    resetAt: nextUsageResetAt(input.usage.month),
    resetLabel: formatUsageResetLabel(input.usage.month),
    items,
    headline,
    periodRightsDiffer: Boolean(
      input.subscribedPlanId && input.subscribedPlanId !== planId,
    ),
    inconsistencies: findUsageBillingInconsistencies({
      usage: input.usage,
      catalog: input.catalog,
    }),
    available: input.usage.available !== false,
    unavailableReason: input.usage.unavailableReason ?? null,
  };
}

export function offeredUsageItems(view: UsageAwarenessView): UsageItemView[] {
  return view.items.filter((item) => item.offered);
}

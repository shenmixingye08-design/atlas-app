import { getExpectedStripeAmountJpy } from "@/lib/billing/plans/registry";
import type { PlanDefinition } from "@/lib/billing/plans/types";
import type { UsageLimitSummary } from "@/lib/billing/usage/types";

import { USAGE_LIMIT_KEY, registryLimitForMeter } from "./meters";
import { USAGE_METER_IDS, type UsageMeterId } from "./types";

function meterLimit(usage: UsageLimitSummary, id: UsageMeterId): number {
  if (id === "automationTasks") return usage.automationTasks.limit;
  return usage[id].limit;
}

/**
 * Detects drift between Plan Registry, usage meters, catalog, and Stripe JPY.
 * Does not change prices.
 */
export function findUsageBillingInconsistencies(input: {
  usage: UsageLimitSummary;
  catalog: readonly PlanDefinition[];
}): string[] {
  const errors: string[] = [];
  const registryPlan = input.catalog.find((plan) => plan.planId === input.usage.planId);
  if (!registryPlan) {
    errors.push(`catalog_missing_plan:${input.usage.planId}`);
    return errors;
  }

  for (const meterId of USAGE_METER_IDS) {
    const expected = registryLimitForMeter(registryPlan.limits, meterId);
    const actual = meterLimit(input.usage, meterId);
    if (expected !== actual) {
      errors.push(`usage_limit_mismatch:${meterId}:${actual}!=${expected}`);
    }
  }

  if (registryPlan.limits.snsPostsMonthly !== registryPlan.limits.xAutoPostsMonthly) {
    errors.push("sns_alias_mismatch");
  }

  if (getExpectedStripeAmountJpy(registryPlan.planId) !== registryPlan.monthlyPriceJpy) {
    errors.push(`stripe_jpy_mismatch:${registryPlan.planId}`);
  }

  for (const plan of input.catalog) {
    if (getExpectedStripeAmountJpy(plan.planId) !== plan.monthlyPriceJpy) {
      errors.push(`stripe_jpy_mismatch:${plan.planId}`);
    }
    if (plan.limits.snsPostsMonthly !== plan.limits.xAutoPostsMonthly) {
      errors.push(`sns_alias_mismatch:${plan.planId}`);
    }
    for (const meterId of USAGE_METER_IDS) {
      const key = USAGE_LIMIT_KEY[meterId];
      if (typeof plan.limits[key] !== "number") {
        errors.push(`registry_missing_limit:${plan.planId}:${key}`);
      }
    }
  }

  return errors;
}

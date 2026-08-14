import type { PlanDefinition, PlanId } from "@/lib/billing/plans/types";

import { registryLimitForMeter } from "./meters";
import type { UsageMeterId, UsageUpgradeCandidate } from "./types";

function toCandidate(
  plan: PlanDefinition,
  meterId: UsageMeterId,
): UsageUpgradeCandidate {
  return {
    planId: plan.planId,
    planName: plan.name,
    monthlyPriceJpy: plan.monthlyPriceJpy,
    nextLimit: registryLimitForMeter(plan.limits, meterId),
  };
}

/**
 * Smallest higher-priced plan that actually increases this meter.
 * Never recommend a plan that does not improve the scarce quota.
 */
export function recommendUpgradeForMeter(input: {
  currentPlanId: PlanId;
  meterId: UsageMeterId;
  plans: readonly PlanDefinition[];
}): {
  primary: UsageUpgradeCandidate;
  secondary: UsageUpgradeCandidate | null;
} | null {
  const current = input.plans.find((plan) => plan.planId === input.currentPlanId);
  if (!current) return null;

  const currentLimit = registryLimitForMeter(current.limits, input.meterId);
  const higher = input.plans
    .filter((plan) => plan.monthlyPriceJpy > current.monthlyPriceJpy)
    .slice()
    .sort((a, b) => a.monthlyPriceJpy - b.monthlyPriceJpy);

  const primary = higher.find(
    (plan) => registryLimitForMeter(plan.limits, input.meterId) > currentLimit,
  );
  if (!primary) return null;

  const primaryLimit = registryLimitForMeter(primary.limits, input.meterId);
  const secondary =
    higher.find(
      (plan) =>
        plan.planId !== primary.planId &&
        registryLimitForMeter(plan.limits, input.meterId) > primaryLimit,
    ) ?? null;

  return {
    primary: toCandidate(primary, input.meterId),
    secondary: secondary ? toCandidate(secondary, input.meterId) : null,
  };
}

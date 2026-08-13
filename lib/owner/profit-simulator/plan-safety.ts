import { estimateStripeFeeJpy } from "./engine";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

/**
 * Simulation-only FX. Not used for Stripe settlement or customer billing.
 */
export const USD_JPY_SAFETY_RATE = 170;

/** X API cost assumptions for profit-safety simulation (USD per post). */
export const X_COST_USD = {
  normalCreate: 0.015,
  createWithUrl: 0.2,
} as const;

/** Infra / storage / retry reserve as a fraction of list price. */
export const INFRA_RESERVE_RATE = 0.1;

export type PlanProfitSafetyRow = {
  planId: PlanId;
  planName: string;
  priceJpy: number;
  aiBudgetUsd: number;
  aiCostJpy: number;
  xNormalPosts: number;
  xUrlPosts: number;
  xCostUsd: number;
  xCostJpy: number;
  stripeFeeJpy: number;
  maxDirectVariableCostJpy: number;
  infraReserveJpy: number;
  contributionMarginJpy: number;
  contributionMarginPositive: boolean;
};

function roundJpy(value: number): number {
  return Math.round(value);
}

function usdToSafetyJpy(usd: number): number {
  return roundJpy(usd * USD_JPY_SAFETY_RATE);
}

export function simulatePlanProfitSafety(planId: PlanId): PlanProfitSafetyRow {
  const plan = getPlanDefinition(planId);
  const limits = plan.limits;
  const priceJpy = plan.monthlyPriceJpy;
  const aiBudgetUsd = limits.aiCostBudgetUsdMonthly;
  const aiCostJpy = usdToSafetyJpy(aiBudgetUsd);

  const xUrlPosts = limits.xUrlPostsMonthly;
  const xNormalPosts = Math.max(0, limits.xAutoPostsMonthly - xUrlPosts);
  const xCostUsd =
    xNormalPosts * X_COST_USD.normalCreate +
    xUrlPosts * X_COST_USD.createWithUrl;
  const xCostJpy = usdToSafetyJpy(xCostUsd);
  const stripeFeeJpy = priceJpy > 0 ? estimateStripeFeeJpy(priceJpy) : 0;
  const maxDirectVariableCostJpy = roundJpy(aiCostJpy + xCostJpy + stripeFeeJpy);
  const infraReserveJpy = roundJpy(priceJpy * INFRA_RESERVE_RATE);
  const contributionMarginJpy = roundJpy(
    priceJpy - maxDirectVariableCostJpy - infraReserveJpy,
  );

  return {
    planId,
    planName: plan.name,
    priceJpy,
    aiBudgetUsd,
    aiCostJpy,
    xNormalPosts,
    xUrlPosts,
    xCostUsd,
    xCostJpy,
    stripeFeeJpy,
    maxDirectVariableCostJpy,
    infraReserveJpy,
    contributionMarginJpy,
    contributionMarginPositive: contributionMarginJpy > 0,
  };
}

export function simulatePaidPlanProfitSafety(): readonly PlanProfitSafetyRow[] {
  return listPlanDefinitions()
    .filter((plan) => plan.monthlyPriceJpy > 0)
    .map((plan) => simulatePlanProfitSafety(plan.planId));
}

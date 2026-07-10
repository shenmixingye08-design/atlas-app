import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";

import { estimateStripeFeeJpy, simulateProfit } from "./engine";
import type { PlanSubscriberCounts, ProfitSimulatorScenario } from "./types";

const JPY_PER_USD = 150;

function usdToJpy(usd: number): number {
  return Math.round(usd * JPY_PER_USD);
}

export function buildLiveProfitScenario(now = new Date()): ProfitSimulatorScenario {
  const billing = getOwnerBillingMetrics();
  const eco = getMonthlyCostSavingsSummary(now);

  const subscribers: PlanSubscriberCounts = {
    free: billing.freeSubscribers,
    light:
      billing.planBreakdown.find((row) => row.planId === "light")
        ?.activeSubscribers ?? 0,
    standard:
      billing.planBreakdown.find((row) => row.planId === "standard")
        ?.activeSubscribers ?? 0,
    premium:
      billing.planBreakdown.find((row) => row.planId === "premium")
        ?.activeSubscribers ?? 0,
  };

  const apiCostJpy =
    eco.actualCostUsd > 0 ? usdToJpy(eco.actualCostUsd) : 28_000;
  const serverCostJpy = 13_500;

  const input = {
    subscribers,
    apiCostJpy,
    serverCostJpy,
    stripeFeeJpy: estimateStripeFeeJpy(billing.mrrJpy),
    apiCostIsMonthToDate: eco.actualCostUsd > 0,
  };

  return {
    input,
    result: simulateProfit(input, { now }),
    label: "現在の実績ベース",
    source: "live",
  };
}

export function buildCustomProfitScenario(
  overrides: Partial<ProfitSimulatorScenario["input"]> = {},
  now = new Date(),
): ProfitSimulatorScenario {
  const baseline = buildLiveProfitScenario(now);
  const input = { ...baseline.input, ...overrides };

  return {
    input,
    result: simulateProfit(input, { now }),
    label: "カスタムシナリオ",
    source: "custom",
  };
}

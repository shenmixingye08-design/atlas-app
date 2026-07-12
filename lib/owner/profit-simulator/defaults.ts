import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";

import { estimateStripeFeeJpy, simulateProfit } from "./engine";
import type { PlanSubscriberCounts, ProfitSimulatorScenario } from "./types";

function usdToJpy(usd: number): number {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(usd * rate);
}

function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthAiCostUsd(now: Date): number {
  const prefix = monthKey(now);
  return listAiUsageEvents()
    .filter((event) => event.timestamp.startsWith(prefix))
    .reduce((sum, event) => sum + event.estimatedCostUsd, 0);
}

/**
 * Baseline scenario from live subscription / AI usage stores.
 * Stripe fee uses the simulator rate (3.6%) for what-if modeling only —
 * Owner dashboard cash fees come from Stripe BalanceTransaction, not here.
 */
export function buildLiveProfitScenario(now = new Date()): ProfitSimulatorScenario {
  const billing = getOwnerBillingMetrics();
  const eco = getMonthlyCostSavingsSummary(now);
  const aiCostUsd = Math.max(eco.actualCostUsd, monthAiCostUsd(now));

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

  const apiCostJpy = aiCostUsd > 0 ? usdToJpy(aiCostUsd) : 0;
  const serverCostJpy = 0;

  const input = {
    subscribers,
    apiCostJpy,
    serverCostJpy,
    stripeFeeJpy: estimateStripeFeeJpy(billing.mrrJpy),
    apiCostIsMonthToDate: aiCostUsd > 0,
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

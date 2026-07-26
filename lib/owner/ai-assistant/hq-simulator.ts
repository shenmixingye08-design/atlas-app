import { getPlanDefinition } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

import type { AssistantFacts } from "./facts";
import { estimateHqRunJpy } from "./insights";
import type { HqSimulationRow, PriceChangeScenario } from "./types";

const HQ_RUN_SCENARIOS = [1, 3, 5, 8, 10, 15, 20] as const;

export function buildHqSimulations(facts: AssistantFacts): HqSimulationRow[] {
  if (facts.usdJpyRate == null) return [];

  const hqCost = estimateHqRunJpy(facts.usdJpyRate);
  const planIds: PlanId[] = ["light", "standard", "premium"];
  const rows: HqSimulationRow[] = [];

  for (const planId of planIds) {
    const plan = getPlanDefinition(planId);
    for (const hqRuns of HQ_RUN_SCENARIOS) {
      const estimatedApiCostJpy = hqCost * hqRuns;
      const profitJpy = plan.monthlyPriceJpy - estimatedApiCostJpy;
      const marginPercent =
        plan.monthlyPriceJpy > 0
          ? Math.round((profitJpy / plan.monthlyPriceJpy) * 1000) / 10
          : 0;
      const isDeficit = profitJpy < 0;
      rows.push({
        planId,
        planName: plan.name,
        planPriceJpy: plan.monthlyPriceJpy,
        hqRuns,
        estimatedApiCostJpy,
        profitJpy,
        marginPercent,
        isDeficit,
        summary: isDeficit
          ? `${plan.name}（¥${plan.monthlyPriceJpy}）で高品質${hqRuns}回 → 赤字になります`
          : `${plan.name}（¥${plan.monthlyPriceJpy}）で高品質${hqRuns}回 → 利益率${marginPercent}%`,
      });
    }
  }

  return rows;
}

export function buildPriceChangeScenarios(
  facts: AssistantFacts,
): PriceChangeScenario[] {
  const fx = facts.usdJpyRate;
  const scenarios: PriceChangeScenario[] = [];

  for (const plan of facts.planBreakdown) {
    if (plan.planId === "free" || plan.subscribers === 0) continue;
    const currentRevenue = plan.subscribers * plan.priceJpy;
    const costJpy = fx != null ? Math.round(plan.aiCostUsd * fx) : null;
    const currentMargin =
      currentRevenue > 0 && costJpy != null
        ? Math.round(((currentRevenue - costJpy) / currentRevenue) * 1000) / 10
        : null;

    for (const factor of [0.9, 1.1, 1.2]) {
      const proposedPriceJpy = Math.round(plan.priceJpy * factor);
      const proposedRevenue = plan.subscribers * proposedPriceJpy;
      const proposedMargin =
        proposedRevenue > 0 && costJpy != null
          ? Math.round(
              ((proposedRevenue - costJpy) / proposedRevenue) * 1000,
            ) / 10
          : null;
      const deltaProfitJpy =
        costJpy != null
          ? proposedRevenue - costJpy - (currentRevenue - costJpy)
          : null;

      const pct = Math.round((factor - 1) * 100);
      scenarios.push({
        planId: plan.planId,
        planName: plan.planName,
        currentPriceJpy: plan.priceJpy,
        proposedPriceJpy,
        currentMarginPercent: currentMargin,
        proposedMarginPercent: proposedMargin,
        deltaProfitJpy,
        summary:
          pct === 0
            ? `${plan.planName} 現状維持`
            : `${plan.planName} を ${pct > 0 ? "+" : ""}${pct}%（¥${plan.priceJpy}→¥${proposedPriceJpy}）した場合の利益差分は ${
                deltaProfitJpy != null
                  ? `¥${deltaProfitJpy.toLocaleString("ja-JP")}`
                  : "未確定"
              }`,
      });
    }
  }

  return scenarios;
}

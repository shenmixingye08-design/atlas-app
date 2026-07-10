import { getPlanDefinition } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

import type {
  ProfitCostRow,
  ProfitPlanRow,
  ProfitSimulatorInput,
  ProfitSimulatorOptions,
  ProfitSimulatorResult,
} from "./types";

const PAID_PLANS: readonly PlanId[] = ["light", "standard", "premium"];
const ALL_PLANS: readonly PlanId[] = ["free", "light", "standard", "premium"];

function roundJpy(value: number): number {
  return Math.round(value);
}

function getMonthProgress(now: Date): number {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  return daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;
}

function projectApiCostJpy(
  input: ProfitSimulatorInput,
  monthProgress: number,
): number {
  const apiCostJpy = Math.max(0, input.apiCostJpy);

  if (
    input.apiCostIsMonthToDate &&
    monthProgress > 0 &&
    monthProgress < 1
  ) {
    return roundJpy(apiCostJpy / monthProgress);
  }

  return apiCostJpy;
}

export function simulateProfit(
  input: ProfitSimulatorInput,
  options: ProfitSimulatorOptions = {},
): ProfitSimulatorResult {
  const now = options.now ?? new Date();
  const monthProgress = getMonthProgress(now);

  const planRows: ProfitPlanRow[] = ALL_PLANS.map((planId) => {
    const plan = getPlanDefinition(planId);
    const subscribers = Math.max(0, input.subscribers[planId] ?? 0);
    return {
      planId,
      planName: plan.name,
      subscribers,
      unitPriceJpy: plan.monthlyPriceJpy,
      revenueJpy: roundJpy(subscribers * plan.monthlyPriceJpy),
    };
  });

  const revenueJpy = planRows.reduce((sum, row) => sum + row.revenueJpy, 0);
  const paidSubscribers = PAID_PLANS.reduce(
    (sum, planId) => sum + Math.max(0, input.subscribers[planId] ?? 0),
    0,
  );
  const totalSubscribers = ALL_PLANS.reduce(
    (sum, planId) => sum + Math.max(0, input.subscribers[planId] ?? 0),
    0,
  );

  const apiCostJpy = Math.max(0, input.apiCostJpy);
  const projectedApiCostJpy = projectApiCostJpy(input, monthProgress);
  const serverCostJpy = Math.max(0, input.serverCostJpy);
  const stripeFeeJpy = Math.max(0, input.stripeFeeJpy);

  const totalCostJpy = roundJpy(
    apiCostJpy + serverCostJpy + stripeFeeJpy,
  );
  const projectedTotalCostJpy = roundJpy(
    projectedApiCostJpy + serverCostJpy + stripeFeeJpy,
  );

  const profitJpy = roundJpy(revenueJpy - totalCostJpy);
  const endOfMonthProfitForecastJpy = roundJpy(
    revenueJpy - projectedTotalCostJpy,
  );
  const profitMarginPercent =
    revenueJpy > 0 ? roundJpy((profitJpy / revenueJpy) * 100) : 0;

  const avgRevenuePerPaidUserJpy =
    paidSubscribers > 0 ? roundJpy(revenueJpy / paidSubscribers) : 0;
  const avgCostPerUserJpy =
    totalSubscribers > 0 ? roundJpy(totalCostJpy / totalSubscribers) : 0;

  const breakEvenPaidSubscribers =
    avgRevenuePerPaidUserJpy > 0
      ? Math.ceil(projectedTotalCostJpy / avgRevenuePerPaidUserJpy)
      : null;

  const costRows: ProfitCostRow[] = [
    { id: "api", label: "API費用", amountJpy: apiCostJpy },
    { id: "server", label: "サーバー費用", amountJpy: serverCostJpy },
    { id: "stripe", label: "Stripe手数料", amountJpy: stripeFeeJpy },
  ];

  return {
    revenueJpy,
    mrrJpy: revenueJpy,
    apiCostJpy,
    projectedApiCostJpy,
    totalCostJpy,
    profitJpy,
    profitMarginPercent,
    endOfMonthProfitForecastJpy,
    paidSubscribers,
    totalSubscribers,
    planRows,
    costRows,
    breakEvenPaidSubscribers,
    avgRevenuePerPaidUserJpy,
    avgCostPerUserJpy,
    monthProgressPercent: roundJpy(monthProgress * 100),
  };
}

export function compareProfitResults(
  baseline: ProfitSimulatorResult,
  scenario: ProfitSimulatorResult,
): {
  revenueDeltaJpy: number;
  costDeltaJpy: number;
  profitDeltaJpy: number;
  marginDeltaPoints: number;
  forecastDeltaJpy: number;
} {
  return {
    revenueDeltaJpy: scenario.revenueJpy - baseline.revenueJpy,
    costDeltaJpy: scenario.totalCostJpy - baseline.totalCostJpy,
    profitDeltaJpy: scenario.profitJpy - baseline.profitJpy,
    marginDeltaPoints:
      scenario.profitMarginPercent - baseline.profitMarginPercent,
    forecastDeltaJpy:
      scenario.endOfMonthProfitForecastJpy -
      baseline.endOfMonthProfitForecastJpy,
  };
}

/** Default Stripe fee estimate: 3.6% of monthly revenue. */
export function estimateStripeFeeJpy(revenueJpy: number): number {
  return roundJpy(Math.max(0, revenueJpy) * 0.036);
}

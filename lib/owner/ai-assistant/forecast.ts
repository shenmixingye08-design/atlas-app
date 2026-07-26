import type { AssistantFacts } from "./facts";
import type { ForecastHorizon, ForecastPoint } from "./types";

const HORIZONS: { horizon: ForecastHorizon; months: number; label: string }[] =
  [
    { horizon: "1m", months: 1, label: "1か月後" },
    { horizon: "3m", months: 3, label: "3か月後" },
    { horizon: "6m", months: 6, label: "6か月後" },
    { horizon: "12m", months: 12, label: "1年後" },
  ];

function compound(base: number, monthlyRate: number, months: number): number {
  return Math.round(base * (1 + monthlyRate) ** months);
}

/**
 * Forecast from observed monthly growth rates only.
 * Never invents a positive growth when data is missing.
 */
export function buildForecasts(facts: AssistantFacts): ForecastPoint[] {
  const revenueBase = facts.mrrJpy;
  const usersBase = facts.paidUsers + facts.freeUsers;
  const apiCostJpy =
    facts.usdJpyRate != null
      ? Math.round(facts.current.apiCostUsd * facts.usdJpyRate)
      : null;

  const growth =
    facts.growthRateMonthly != null ? facts.growthRateMonthly / 100 : null;
  const userGrowth =
    facts.userGrowthRateMonthly != null
      ? facts.userGrowthRateMonthly / 100
      : growth;

  if (growth == null && userGrowth == null) {
    return HORIZONS.map((h) => ({
      horizon: h.horizon,
      label: h.label,
      revenueJpy: null,
      profitJpy: null,
      apiCostJpy: null,
      users: null,
      availability: "empty" as const,
      note: "成長率を算出する実データが不足しています",
    }));
  }

  return HORIZONS.map((h) => {
    const revenueJpy =
      growth != null && revenueBase > 0
        ? compound(revenueBase, growth, h.months)
        : null;
    const users =
      userGrowth != null && usersBase > 0
        ? compound(usersBase, userGrowth, h.months)
        : null;
    const projectedApi =
      apiCostJpy != null && growth != null
        ? compound(apiCostJpy, growth, h.months)
        : null;
    const profitJpy =
      revenueJpy != null && projectedApi != null
        ? revenueJpy - projectedApi
        : null;

    const availability =
      revenueJpy != null || users != null ? "ok" : "incomplete";

    return {
      horizon: h.horizon,
      label: h.label,
      revenueJpy,
      profitJpy,
      apiCostJpy: projectedApi,
      users,
      availability,
      note:
        growth != null
          ? `月次成長率 ${Math.round(growth * 1000) / 10}% を適用（実系列）`
          : "ユーザー成長率のみ適用",
    };
  });
}

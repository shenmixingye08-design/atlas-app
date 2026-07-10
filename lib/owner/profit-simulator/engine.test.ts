import { describe, expect, it } from "vitest";

import { compareProfitResults, simulateProfit } from "./engine";

describe("profit simulator engine", () => {
  const baseInput = {
    subscribers: { free: 300, light: 20, standard: 25, premium: 5 },
    apiCostJpy: 30_000,
    serverCostJpy: 15_000,
    stripeFeeJpy: 5_000,
  };

  it("calculates revenue from plan prices", () => {
    const result = simulateProfit(baseInput);
    expect(result.revenueJpy).toBe(980 * 20 + 2980 * 25 + 9800 * 5);
    expect(result.paidSubscribers).toBe(50);
    expect(result.totalSubscribers).toBe(350);
  });

  it("includes api, server, and stripe in total cost", () => {
    const result = simulateProfit(baseInput);
    expect(result.totalCostJpy).toBe(30_000 + 15_000 + 5_000);
  });

  it("computes profit, margin, and end-of-month forecast", () => {
    const result = simulateProfit(baseInput);
    expect(result.profitJpy).toBe(result.revenueJpy - result.totalCostJpy);
    expect(result.endOfMonthProfitForecastJpy).toBe(result.profitJpy);
    expect(result.profitMarginPercent).toBeGreaterThan(0);
  });

  it("extrapolates month-to-date api cost for month-end forecast", () => {
    const now = new Date("2026-07-08T12:00:00.000Z");
    const result = simulateProfit(
      {
        ...baseInput,
        apiCostJpy: 8_000,
        apiCostIsMonthToDate: true,
      },
      { now },
    );

    expect(result.projectedApiCostJpy).toBeGreaterThan(8_000);
    expect(result.endOfMonthProfitForecastJpy).toBeLessThan(result.profitJpy);
  });

  it("compares baseline vs scenario deltas", () => {
    const baseline = simulateProfit(baseInput);
    const scaled = simulateProfit({
      ...baseInput,
      subscribers: { ...baseInput.subscribers, premium: 20 },
    });
    const delta = compareProfitResults(baseline, scaled);
    expect(delta.revenueDeltaJpy).toBeGreaterThan(0);
    expect(delta.profitDeltaJpy).toBeGreaterThan(0);
  });

  it("estimates break-even paid subscribers", () => {
    const result = simulateProfit({
      ...baseInput,
      subscribers: { free: 0, light: 10, standard: 10, premium: 0 },
    });
    expect(result.breakEvenPaidSubscribers).not.toBeNull();
    expect(result.breakEvenPaidSubscribers!).toBeGreaterThan(0);
  });
});

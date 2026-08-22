import { describe, expect, it } from "vitest";

import { estimateStripeFeeJpy } from "./engine";
import {
  INFRA_RESERVE_RATE,
  simulatePlanProfitSafety,
  USD_JPY_SAFETY_RATE,
  X_COST_USD,
} from "./plan-safety";

describe("plan profit-safety envelope", () => {
  it("uses simulation-only FX 170 and Stripe 3.6%", () => {
    expect(USD_JPY_SAFETY_RATE).toBe(170);
    expect(estimateStripeFeeJpy(980)).toBe(35);
    expect(estimateStripeFeeJpy(2980)).toBe(107);
    expect(estimateStripeFeeJpy(9800)).toBe(353);
    expect(INFRA_RESERVE_RATE).toBe(0.1);
  });

  it("computes Light worst-case variable cost ~¥366 with positive CM", () => {
    const row = simulatePlanProfitSafety("light");
    expect(row.aiCostJpy).toBe(255);
    expect(row.xNormalPosts).toBe(30);
    expect(row.xUrlPosts).toBe(0);
    expect(row.xCostUsd).toBeCloseTo(30 * X_COST_USD.normalCreate);
    expect(row.stripeFeeJpy).toBe(35);
    expect(row.maxDirectVariableCostJpy).toBe(366);
    expect(row.contributionMarginJpy).toBeGreaterThan(0);
  });

  it("computes Standard worst-case X mix $2.30 and ~¥1,348", () => {
    const row = simulatePlanProfitSafety("standard");
    expect(row.xNormalPosts).toBe(20);
    expect(row.xUrlPosts).toBe(10);
    expect(row.xCostUsd).toBeCloseTo(
      20 * X_COST_USD.normalCreate + 10 * X_COST_USD.createWithUrl,
    );
    expect(row.xCostUsd).toBeCloseTo(2.3);
    expect(row.aiCostJpy).toBe(850);
    expect(row.xCostJpy).toBe(391);
    expect(row.stripeFeeJpy).toBe(107);
    expect(row.maxDirectVariableCostJpy).toBe(1348);
    expect(row.contributionMarginPositive).toBe(true);
  });

  it("computes Premium worst-case X mix $7.80 and ~¥4,229", () => {
    const row = simulatePlanProfitSafety("premium");
    expect(row.xNormalPosts).toBe(120);
    expect(row.xUrlPosts).toBe(30);
    expect(row.xCostUsd).toBeCloseTo(7.8);
    expect(row.aiCostJpy).toBe(2550);
    expect(row.xCostJpy).toBe(1326);
    expect(row.stripeFeeJpy).toBe(353);
    expect(row.maxDirectVariableCostJpy).toBe(4229);
    expect(row.contributionMarginPositive).toBe(true);
  });
});

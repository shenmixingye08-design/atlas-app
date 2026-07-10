import { describe, expect, it } from "vitest";

import { buildCreateInputFromForm, defaultAutomationFormState } from "@/lib/automations/form-utils";
import { SEED_AUTOMATIONS } from "@/lib/automations/domain";
import {
  EXECUTION_MODE_OPTIONS,
  executionModeToCostSavingMode,
  normalizeExecutionMode,
} from "@/lib/cost-optimization/execution-mode";
import { resolveAutomationExecutionMode } from "@/lib/cost-optimization/resolve-mode";
import { buildSnsBatchAssignment } from "@/lib/cost-optimization/sns-batch";
import {
  getMonthlyCostSavingsSummary,
  recordCostRun,
} from "@/lib/cost-optimization/cost-savings-tracker";

describe("execution mode", () => {
  it("defaults to eco mode", () => {
    expect(normalizeExecutionMode(undefined)).toBe("eco");
  });

  it("maps eco mode to low cost policy", () => {
    expect(executionModeToCostSavingMode("eco")).toBe("low");
    expect(executionModeToCostSavingMode("high_quality")).toBe("high");
  });

  it("includes three execution mode options", () => {
    expect(EXECUTION_MODE_OPTIONS).toHaveLength(3);
    expect(EXECUTION_MODE_OPTIONS[0]?.mode).toBe("eco");
  });

  it("persists execution mode in automation form", () => {
    const input = buildCreateInputFromForm(
      defaultAutomationFormState({ executionMode: "high_quality", snsBatchDays: 7 }),
    );
    expect(input.executionMode).toBe("high_quality");
    expect(input.snsBatchDays).toBe(7);
  });

  it("resolves seed automation execution modes", () => {
    const sns = SEED_AUTOMATIONS.find((item) => item.id === "habit-x-post");
    const email = SEED_AUTOMATIONS.find((item) => item.id === "habit-email-check");
    expect(sns?.executionMode).toBe("eco");
    expect(sns?.snsBatchDays).toBe(7);
    expect(email?.executionMode).toBe("high_quality");
    expect(resolveAutomationExecutionMode(sns!)).toBe("eco");
  });
});

describe("SNS batch assignment", () => {
  it("augments assignment for batch generation", () => {
    const result = buildSnsBatchAssignment("SNS投稿を作成", 7);
    expect(result).toContain("7日分");
    expect(result).toContain("予約投稿");
  });

  it("leaves assignment unchanged without batch days", () => {
    expect(buildSnsBatchAssignment("SNS投稿を作成", null)).toBe("SNS投稿を作成");
  });
});

describe("cost savings tracker", () => {
  it("computes monthly reduction percent", () => {
    recordCostRun({
      executionMode: "eco",
      estimatedCostUsd: 0.001,
      fromCache: true,
      cacheHits: 2,
    });
    recordCostRun({
      executionMode: "eco",
      estimatedCostUsd: 0.002,
      fromCache: false,
      cacheHits: 0,
    });

    const summary = getMonthlyCostSavingsSummary();
    expect(summary.reductionPercent).toBeGreaterThan(0);
    expect(summary.ecoRunCount).toBeGreaterThanOrEqual(2);
  });
});

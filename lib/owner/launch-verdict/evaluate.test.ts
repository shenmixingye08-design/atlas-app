import { describe, expect, it } from "vitest";

import {
  aggregateLaunchVerdict,
  evaluateLaunchKpi,
} from "@/lib/owner/launch-verdict/evaluate";

describe("launch verdict evaluate", () => {
  it("bands first completion go / delay / kill", () => {
    expect(evaluateLaunchKpi("firstCompletionRate", 95, 50).band).toBe("go");
    expect(evaluateLaunchKpi("firstCompletionRate", 90, 50).band).toBe(
      "delay"
    );
    expect(evaluateLaunchKpi("firstCompletionRate", 84, 50).band).toBe("kill");
  });

  it("bands error rate (lower better)", () => {
    expect(evaluateLaunchKpi("errorRate", 2, 50).band).toBe("go");
    expect(evaluateLaunchKpi("errorRate", 5, 50).band).toBe("delay");
    expect(evaluateLaunchKpi("errorRate", 9, 50).band).toBe("kill");
  });

  it("marks insufficient sample as delay overall", () => {
    const result = aggregateLaunchVerdict([
      evaluateLaunchKpi("jobCompletionRate", 95, 10),
      evaluateLaunchKpi("firstCompletionRate", 96, 10),
      evaluateLaunchKpi("avgCompletionSeconds", 60, 10),
      evaluateLaunchKpi("errorRate", 1, 10),
      evaluateLaunchKpi("retention7", 50, 10),
      evaluateLaunchKpi("retention30", 30, 10),
      evaluateLaunchKpi("referralRate", 30, 10),
      evaluateLaunchKpi("paidConversionRate", 10, 10),
      evaluateLaunchKpi("nps", 40, 5),
    ]);
    expect(result.overall).toBe("delay");
    expect(result.signal).toBe("🟡");
    expect(result.needsImprovement.length).toBeGreaterThan(0);
  });

  it("requires all go for formal publish", () => {
    const result = aggregateLaunchVerdict([
      evaluateLaunchKpi("jobCompletionRate", 92, 50),
      evaluateLaunchKpi("firstCompletionRate", 96, 50),
      evaluateLaunchKpi("avgCompletionSeconds", 120, 50),
      evaluateLaunchKpi("errorRate", 1.5, 50),
      evaluateLaunchKpi("retention7", 45, 50),
      evaluateLaunchKpi("retention30", 28, 50),
      evaluateLaunchKpi("referralRate", 30, 50),
      evaluateLaunchKpi("paidConversionRate", 10, 50),
      evaluateLaunchKpi("nps", 35, 30),
    ]);
    expect(result.overall).toBe("go");
    expect(result.signal).toBe("🟢");
    expect(result.needsImprovement).toEqual([]);
  });

  it("critical kill blocks publish", () => {
    const result = aggregateLaunchVerdict([
      evaluateLaunchKpi("jobCompletionRate", 95, 50),
      evaluateLaunchKpi("firstCompletionRate", 80, 50),
      evaluateLaunchKpi("avgCompletionSeconds", 60, 50),
      evaluateLaunchKpi("errorRate", 1, 50),
      evaluateLaunchKpi("retention7", 50, 50),
      evaluateLaunchKpi("retention30", 30, 50),
      evaluateLaunchKpi("referralRate", 30, 50),
      evaluateLaunchKpi("paidConversionRate", 10, 50),
      evaluateLaunchKpi("nps", 40, 30),
    ]);
    expect(result.overall).toBe("kill");
    expect(result.signal).toBe("🔴");
    expect(result.overallLabel).toBe("公開禁止");
  });

  it("non-critical kill becomes delay not kill", () => {
    const result = aggregateLaunchVerdict([
      evaluateLaunchKpi("jobCompletionRate", 95, 50),
      evaluateLaunchKpi("firstCompletionRate", 96, 50),
      evaluateLaunchKpi("avgCompletionSeconds", 500, 50),
      evaluateLaunchKpi("errorRate", 1, 50),
      evaluateLaunchKpi("retention7", 50, 50),
      evaluateLaunchKpi("retention30", 30, 50),
      evaluateLaunchKpi("referralRate", 30, 50),
      evaluateLaunchKpi("paidConversionRate", 10, 50),
      evaluateLaunchKpi("nps", 40, 30),
    ]);
    expect(result.overall).toBe("delay");
    expect(result.signal).toBe("🟡");
  });
});

import { describe, expect, it } from "vitest";

import {
  REFERENCE_CANNED_COFFEE_JPY,
  coffeeCansForLightPlan,
  minutesToHoursLabel,
  sampleMonthlyCombinedMinutes,
  sampleMonthlyEmailMinutes,
} from "./pay-reason";

describe("pay-reason sample math", () => {
  it("uses declared sample baselines only", () => {
    // email 10min * 20 workdays
    expect(sampleMonthlyEmailMinutes()).toBe(200);
    // email workdays + sns 15*30
    expect(sampleMonthlyCombinedMinutes()).toBe(200 + 450);
    expect(minutesToHoursLabel(200)).toBe("3.3時間");
  });

  it("labels coffee comparison from reference retail price", () => {
    expect(REFERENCE_CANNED_COFFEE_JPY).toBe(130);
    expect(coffeeCansForLightPlan()).toBe(7.5);
  });
});

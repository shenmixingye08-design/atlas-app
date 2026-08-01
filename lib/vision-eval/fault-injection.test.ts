import { describe, expect, it } from "vitest";

import {
  FAULT_SCENARIOS,
  gateStatusForTimeoutFailure,
  runFaultScenario,
} from "@/lib/vision-eval/fault-injection";

describe("vision fault injection (safe)", () => {
  it("maps timeout to vision_failed, never needs_input", () => {
    expect(gateStatusForTimeoutFailure()).toBe("vision_failed");
    expect(gateStatusForTimeoutFailure()).not.toBe("needs_input");
  });

  it("covers timeout/429/5xx recovery scenarios", async () => {
    for (const id of FAULT_SCENARIOS) {
      const result = await runFaultScenario(id);
      expect(result.pass, `${id} ${result.failureReason}`).toBe(true);
      if (id === "timeout_not_needs_input" || id === "timeout_x3") {
        expect(result.finalStatus).toBe("vision_failed");
      }
    }
  });
});

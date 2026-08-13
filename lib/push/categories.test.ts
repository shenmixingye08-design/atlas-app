import { describe, expect, it } from "vitest";

import { isDefaultPushEventEnabled, isSpamCategory, resolvePushEventCategory } from "@/lib/push/categories";

describe("push categories", () => {
  it("defaults final success ON", () => {
    expect(isDefaultPushEventEnabled("final_success")).toBe(true);
  });

  it("defaults mid_retry OFF", () => {
    expect(isDefaultPushEventEnabled("mid_retry")).toBe(false);
  });

  it("marks mid_retry as spam", () => {
    expect(isSpamCategory("mid_retry")).toBe(true);
  });

  it("does not treat generic automation type as a failure push", () => {
    expect(
      resolvePushEventCategory({ type: "automation" }),
    ).toBe("internal_step");
    expect(
      resolvePushEventCategory({ type: "automation", lineEvent: "error" }),
    ).toBe("final_failure");
    expect(
      resolvePushEventCategory({
        type: "automation",
        lineEvent: "automation_completed",
      }),
    ).toBe("final_success");
  });
});

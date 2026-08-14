import { describe, expect, it } from "vitest";

import { shouldOpenPortalForPlanChange } from "./checkout-intent";

describe("shouldOpenPortalForPlanChange", () => {
  it("sends Free → paid to Checkout, not Portal", () => {
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "free",
        targetPlanId: "light",
        isPaid: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "free",
        targetPlanId: "standard",
        isPaid: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "free",
        targetPlanId: "premium",
        isPaid: false,
      }),
    ).toBe(false);
  });

  it("sends paid → different paid to Portal to avoid a second subscription", () => {
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "light",
        targetPlanId: "standard",
        isPaid: true,
      }),
    ).toBe(true);
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "premium",
        targetPlanId: "standard",
        isPaid: true,
      }),
    ).toBe(true);
  });

  it("does not open Portal for the current plan", () => {
    expect(
      shouldOpenPortalForPlanChange({
        currentPlanId: "light",
        targetPlanId: "light",
        isPaid: true,
      }),
    ).toBe(false);
  });
});

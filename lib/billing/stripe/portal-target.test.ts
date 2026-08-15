import { describe, expect, it } from "vitest";

import { parsePortalTargetPlanId } from "./portal-target";

describe("parsePortalTargetPlanId", () => {
  it("treats an empty body as generic portal home", () => {
    expect(parsePortalTargetPlanId(null)).toEqual({
      ok: true,
      targetPlanId: undefined,
    });
    expect(parsePortalTargetPlanId(undefined)).toEqual({
      ok: true,
      targetPlanId: undefined,
    });
    expect(parsePortalTargetPlanId({})).toEqual({
      ok: true,
      targetPlanId: undefined,
    });
  });

  it("accepts paid targetPlanId values only", () => {
    expect(parsePortalTargetPlanId({ targetPlanId: "standard" })).toEqual({
      ok: true,
      targetPlanId: "standard",
    });
    expect(parsePortalTargetPlanId({ targetPlanId: "premium" })).toEqual({
      ok: true,
      targetPlanId: "premium",
    });
    expect(parsePortalTargetPlanId({ targetPlanId: "light" })).toEqual({
      ok: true,
      targetPlanId: "light",
    });
  });

  it("rejects free and unknown plan ids", () => {
    expect(parsePortalTargetPlanId({ targetPlanId: "free" })).toEqual({
      ok: false,
    });
    expect(parsePortalTargetPlanId({ targetPlanId: "enterprise" })).toEqual({
      ok: false,
    });
    expect(parsePortalTargetPlanId({ targetPlanId: 2980 })).toEqual({
      ok: false,
    });
  });

  it("ignores client-supplied customer and price ids", () => {
    expect(
      parsePortalTargetPlanId({
        targetPlanId: "standard",
        stripeCustomerId: "cus_injected",
        priceId: "price_injected",
        stripePriceId: "price_injected",
      }),
    ).toEqual({ ok: true, targetPlanId: "standard" });
  });
});

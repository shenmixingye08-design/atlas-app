import { beforeEach, describe, expect, it } from "vitest";

import {
  checkAutomationTaskLimit,
  checkFeatureAccess,
  canUseGoogleIntegration,
  canUseHighQualityMode,
} from "@/lib/billing/plans/policy";

describe("billing plan policy", () => {
  it("allows Standard plan to use Google integration", () => {
    expect(canUseGoogleIntegration("standard")).toBe(true);
    expect(checkFeatureAccess("standard", "google_integration")).toEqual({
      allowed: true,
    });
  });

  it("blocks Free plan from Google integration", () => {
    expect(canUseGoogleIntegration("free")).toBe(false);
    expect(checkFeatureAccess("free", "google_integration").allowed).toBe(false);
  });

  it("allows Premium high quality mode only", () => {
    expect(canUseHighQualityMode("premium")).toBe(true);
    expect(canUseHighQualityMode("standard")).toBe(false);
  });

  it("limits Free automation tasks to one", () => {
    expect(checkAutomationTaskLimit("free", 0).allowed).toBe(true);
    expect(checkAutomationTaskLimit("free", 1).allowed).toBe(false);
  });

  it("allows Light SNS assist but not auto post", () => {
    expect(checkFeatureAccess("light", "sns_assist").allowed).toBe(true);
    expect(checkFeatureAccess("light", "sns_auto_post").allowed).toBe(false);
  });
});

describe("billing subscriptions", () => {
  beforeEach(async () => {
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    resetSubscriptionStore();
  });

  it("defaults new users to Free", async () => {
    const { getUserSubscriptionView } = await import(
      "@/lib/billing/subscriptions/service"
    );
    const view = getUserSubscriptionView("user_test_1");
    expect(view.planId).toBe("free");
    expect(view.status).toBe("active");
  });

  it("stores stripe subscription fields", async () => {
    const { applySubscriptionFromStripe, getUserSubscriptionView } = await import(
      "@/lib/billing/subscriptions/service"
    );

    applySubscriptionFromStripe({
      userId: "user_test_2",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_456",
      planId: "standard",
      status: "active",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      stripePriceId: "price_standard_test",
    });

    const view = getUserSubscriptionView("user_test_2");
    expect(view.planId).toBe("standard");
    expect(view.stripeCustomerId).toBe("cus_123");
    expect(view.stripeSubscriptionId).toBe("sub_456");
    expect(view.stripePriceId).toBe("price_standard_test");
    expect(view.isPaid).toBe(true);
  });

  it("treats trialing as paid-capable and past_due as not", async () => {
    const {
      applySubscriptionFromStripe,
      getUserSubscriptionView,
      isPaidCapableStatus,
    } = await import("@/lib/billing/subscriptions/service");
    const { evaluatePlanAccess } = await import("@/lib/billing/policy");

    applySubscriptionFromStripe({
      userId: "user_trial",
      stripeCustomerId: "cus_trial",
      stripeSubscriptionId: "sub_trial",
      planId: "standard",
      status: "trialing",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(isPaidCapableStatus("trialing")).toBe(true);
    expect(getUserSubscriptionView("user_trial").isPaid).toBe(true);
    expect(evaluatePlanAccess("user_trial", "google_integration").allowed).toBe(
      true,
    );

    applySubscriptionFromStripe({
      userId: "user_past",
      stripeCustomerId: "cus_past",
      stripeSubscriptionId: "sub_past",
      planId: "standard",
      status: "past_due",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(getUserSubscriptionView("user_past").isPaid).toBe(false);
    expect(evaluatePlanAccess("user_past", "google_integration").allowed).toBe(
      false,
    );
  });
});

describe("owner billing metrics", () => {
  it("exposes MRR and plan breakdown", async () => {
    const { getOwnerBillingMetrics } = await import(
      "@/lib/billing/analytics/owner-metrics"
    );
    const metrics = getOwnerBillingMetrics();
    expect(metrics.mrrJpy).toBeGreaterThan(0);
    expect(metrics.planBreakdown.length).toBe(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSubscriptionStore, saveUserSubscription } from "@/lib/billing/subscriptions/store";
import { incrementUsageCounter, resetUsageStore } from "@/lib/billing/usage/store";
import { invoicePaidDedupeKey } from "@/lib/owner/revenue-agent/events";
import { observeStripeRevenueEvent } from "@/lib/owner/revenue-agent/observe";
import { listRevenueEvents, resetRevenueAgentStoreForTests } from "@/lib/owner/revenue-agent/store";
import { resetRevenueAgentHydrationForTests } from "@/lib/owner/revenue-agent/durable";

import { cancelAlternatives } from "./cancel-options";
import { classifyCheckoutFailure, shouldShowCheckoutResume } from "./checkout";
import { resetRevenueMaxHydrationForTests } from "./durable";
import {
  assignVariant,
  EXPERIMENT_MIN_DAYS,
  EXPERIMENT_MIN_SAMPLES,
  resolveExperimentStatus,
  stickyVariant,
} from "./experiments";
import { resolveLifecycleState } from "./lifecycle";
import { buildMeasuredValueView, previousUsageMonthKey } from "./measured";
import {
  applyFirstRequest,
  applyFirstSuccess,
  applyOnboardingStarted,
  applyUsecaseSelected,
} from "./record";
import { getRevenueMaxSnapshot, handleRevenueMaxAction } from "./service";
import { getRevenueMaxState, resetRevenueMaxStoreForTests, setRevenueMaxState } from "./store";
import {
  buildContextualUpgrade,
  canStartCheckout,
  classifyUpgradeTrigger,
  usageReached80,
} from "./upgrade";
import { FIRST_USECASES, usecasesForPain } from "./usecases";
import { buildOwnerImproveSnapshot } from "./owner";

function emptyState(userId: string) {
  return getRevenueMaxState(userId);
}

function paidSub(userId: string, planId: "light" | "standard" | "premium" = "light") {
  const now = new Date().toISOString();
  saveUserSubscription({
    userId,
    stripeCustomerId: `cus_${userId}`,
    stripeSubscriptionId: `sub_${userId}`,
    stripePriceId: `price_${planId}`,
    planId,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  });
}

describe("revenue maximize", () => {
  beforeEach(() => {
    resetRevenueMaxStoreForTests();
    resetRevenueMaxHydrationForTests();
    resetRevenueAgentStoreForTests();
    resetRevenueAgentHydrationForTests();
    resetUsageStore();
    resetSubscriptionStore();
  });

  afterEach(() => {
    resetRevenueMaxStoreForTests();
    resetRevenueMaxHydrationForTests();
    vi.unstubAllEnvs();
  });

  it("counts first success once", () => {
    applyOnboardingStarted("u1");
    applyUsecaseSelected("u1", "sns_posting", "sns");
    applyFirstRequest("u1", "sns");
    applyFirstSuccess("u1", "SNS投稿文");
    applyFirstSuccess("u1", "もう一度");
    const state = getRevenueMaxState("u1");
    expect(
      state.events.filter((event) => event.eventName === "first_request_succeeded"),
    ).toHaveLength(1);
    expect(state.firstSuccessAt).toBeTruthy();
  });

  it("keeps first-job options to implemented Free paths", () => {
    const ids: string[] = FIRST_USECASES.map((row) => row.id);
    expect(ids.includes("blog")).toBe(false);
    expect(FIRST_USECASES.every((row) => !row.label.includes("PowerPoint"))).toBe(true);
    expect(usecasesForPain("sns_posting").map((row) => row.id)).toEqual(["sns"]);
  });

  it("detects 80% usage without treating it as exhausted", () => {
    expect(usageReached80(8, 10)).toBe(true);
    expect(usageReached80(10, 10)).toBe(false);
    expect(usageReached80(0, 10)).toBe(false);
    expect(classifyUpgradeTrigger({ used: 8, limit: 10, meterId: "aiRuns" })).toBe(
      "usage_80",
    );
    expect(classifyUpgradeTrigger({ used: 10, limit: 10, meterId: "aiRuns" })).toBe(
      "ai_limit",
    );
  });

  it("shows upgrade only when a real trigger exists", () => {
    expect(
      classifyUpgradeTrigger({ used: 0, limit: 30, meterId: "aiRuns" }),
    ).toBeNull();
    const hidden = buildContextualUpgrade({
      currentPlanId: "free",
      trigger: null,
    });
    expect(hidden.show).toBe(false);
    expect(canStartCheckout(hidden)).toBe(false);
  });

  it("does not start Checkout when Price ID is missing", () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", "");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "");
    const view = buildContextualUpgrade({
      currentPlanId: "free",
      trigger: "usage_exhausted",
      meterId: "aiRuns",
      used: 1,
      limit: 1,
    });
    expect(view.show).toBe(true);
    expect(view.recommendedPlanId).toBe("light");
    expect(view.priceIdReady).toBe(false);
    expect(canStartCheckout(view)).toBe(false);
  });

  it("starts Checkout only when Price ID matches the recommended plan", () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light_ok");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_ok");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_premium_ok");
    const view = buildContextualUpgrade({
      currentPlanId: "free",
      trigger: "ai_limit",
      meterId: "aiRuns",
      used: 1,
      limit: 1,
    });
    expect(view.recommendedPlanId).toBe("light");
    expect(view.recommendedPriceJpy).toBe(980);
    expect(view.priceIdReady).toBe(true);
    expect(canStartCheckout(view)).toBe(true);
  });

  it("classifies checkout outcomes without treating cancel as paid", () => {
    expect(classifyCheckoutFailure({ cancelled: true })).toBe("user_cancelled");
    expect(classifyCheckoutFailure({ message: "card declined" })).toBe(
      "stripe_payment_failed",
    );
    expect(classifyCheckoutFailure({ message: "price allowlist mismatch" })).toBe(
      "price_mismatch",
    );
    expect(classifyCheckoutFailure({ authenticated: false })).toBe("auth_expired");
    expect(classifyCheckoutFailure({ status: 0, message: "network" })).toBe("network");
    expect(
      classifyCheckoutFailure({ webhookSynced: false, status: 200 }),
    ).toBe("webhook_pending");
    expect(classifyCheckoutFailure({})).toBe("unknown");
    expect(
      shouldShowCheckoutResume({
        checkoutOutcome: "started",
        resumeShownAt: null,
        planId: "free",
      }),
    ).toBe(true);
    expect(
      shouldShowCheckoutResume({
        checkoutOutcome: "completed",
        resumeShownAt: null,
        planId: "free",
      }),
    ).toBe(false);
  });

  it("marks paid_at_risk after configurable idle days", () => {
    const userId = "u_risk";
    applyFirstSuccess(userId, "資料アウトライン");
    const state = getRevenueMaxState(userId);
    const now = new Date("2026-08-24T00:00:00.000Z");
    expect(
      resolveLifecycleState({
        state,
        planId: "light",
        subscriptionStatus: "active",
        lastValueAt: "2026-08-01T00:00:00.000Z",
        hadPaid: true,
        now,
        idleDays: 14,
      }),
    ).toBe("paid_at_risk");
    expect(
      resolveLifecycleState({
        state,
        planId: "light",
        subscriptionStatus: "active",
        lastValueAt: "2026-08-20T00:00:00.000Z",
        hadPaid: true,
        now,
        idleDays: 14,
      }),
    ).toBe("active_paid");
  });

  it("records a cancellation reason without blocking cancel", async () => {
    const result = await handleRevenueMaxAction("u_cancel", {
      action: "cancellation_reason_selected",
      reasonId: "price",
    });
    expect(result.ok).toBe(true);
    const state = getRevenueMaxState("u_cancel");
    expect(
      state.events.some((event) => event.eventName === "cancellation_reason_selected"),
    ).toBe(true);
    expect(cancelAlternatives({ planId: "light", reasonId: "price" }).some((row) => row.id === "lower_plan")).toBe(
      false,
    );
    expect(
      cancelAlternatives({ planId: "standard", reasonId: "too_difficult" }).map((row) => row.id),
    ).toContain("guide");
    expect(
      cancelAlternatives({ planId: "premium", reasonId: "not_used" }).map((row) => row.id),
    ).toContain("lower_plan");
  });

  it("keeps the same experiment variant for the same user", () => {
    const first = assignVariant("user_a", "onboarding_usecase");
    const second = assignVariant("user_a", "onboarding_usecase");
    expect(first).toBe(second);
    expect(stickyVariant("b", "user_a", "onboarding_usecase")).toBe("b");
    expect(
      resolveExperimentStatus({
        sampleSize: 10,
        startedAt: "2026-08-01T00:00:00.000Z",
        now: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ).toBe("insufficient_data");
    expect(
      resolveExperimentStatus({
        sampleSize: EXPERIMENT_MIN_SAMPLES,
        startedAt: "2026-08-01T00:00:00.000Z",
        now: new Date("2026-08-20T00:00:00.000Z"),
        firstSuccessRateA: 0.5,
        firstSuccessRateB: 0.3,
        paidRateA: 0.1,
        paidRateB: 0.2,
      }),
    ).toBe("rejected");
    expect(
      resolveExperimentStatus({
        sampleSize: EXPERIMENT_MIN_SAMPLES,
        startedAt: new Date(
          Date.now() - EXPERIMENT_MIN_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        firstSuccessRateA: 0.4,
        firstSuccessRateB: 0.4,
        paidRateA: 0.1,
        paidRateB: 0.2,
      }),
    ).toBe("candidate_winner");
    expect(
      resolveExperimentStatus({
        sampleSize: EXPERIMENT_MIN_SAMPLES,
        startedAt: "2026-01-01T00:00:00.000Z",
        paidRateA: 0.1,
        paidRateB: 0.3,
        adopted: true,
      }),
    ).toBe("adopted");
  });

  it("does not coerce missing measured values to 0", () => {
    const view = buildMeasuredValueView({
      usage: {
        planId: "free",
        month: "2026-08",
        aiRuns: { used: 1, limit: 1, remaining: 0 },
        snsPosts: { used: 0, limit: 1, remaining: 1 },
        xUrlPosts: { used: 0, limit: 0, remaining: 0 },
        wordpressPosts: { used: 0, limit: 0, remaining: 0 },
        automationTasks: { used: 0, limit: 1, remaining: 1 },
        aiDetail: {
          today: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
          month: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
          allTime: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
          byModel: {},
          byFeature: {},
        },
      },
      previousMonthKnown: false,
    });
    expect(view.completedJobs).toBeNull();
    expect(view.previousMonthJobs).toBeNull();
    expect(view.usageThisMonth).toBe(1);
    expect(previousUsageMonthKey("2026-08")).toBe("2026-07");
  });

  it("hides upgrade for a free user under the limit", async () => {
    const snapshot = await getRevenueMaxSnapshot("u_quiet");
    expect(snapshot.upgrade.show).toBe(false);
    expect(snapshot.lifecycle).toBe("registered_not_activated");
  });

  it("shows upgrade for a free user who exhausted the AI meter", async () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light_ok");
    incrementUsageCounter("u_limit", "aiRuns", 1);
    const snapshot = await getRevenueMaxSnapshot("u_limit");
    expect(snapshot.upgrade.show).toBe(true);
    expect(snapshot.upgrade.trigger).toBe("ai_limit");
    expect(snapshot.upgrade.recommendedPlanId).toBe("light");
    expect(canStartCheckout(snapshot.upgrade)).toBe(true);
  });

  it("keeps Price ID and display plan aligned for Light users near the cap", async () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_ok");
    paidSub("u_light80", "light");
    incrementUsageCounter("u_light80", "aiRuns", 24);
    const snapshot = await getRevenueMaxSnapshot("u_light80");
    expect(snapshot.upgrade.trigger).toBe("usage_80");
    expect(snapshot.upgrade.recommendedPlanId).toBe("standard");
    expect(snapshot.upgrade.recommendedPriceJpy).toBe(2980);
    expect(snapshot.upgrade.priceDeltaYen).toBe(2000);
  });

  it("does not treat checkout failure as a paid conversion", async () => {
    await handleRevenueMaxAction("u_fail", {
      action: "checkout_failed",
      failClass: "stripe_payment_failed",
    });
    const state = getRevenueMaxState("u_fail");
    expect(state.checkoutOutcome).toBe("failed");
    expect(state.hadPaid).toBe(false);
    expect(
      resolveLifecycleState({
        state,
        planId: "free",
        subscriptionStatus: null,
        lastValueAt: null,
      }),
    ).not.toMatch(/paid/);
  });

  it("dedupes Stripe invoice.paid on webhook replay", async () => {
    await observeStripeRevenueEvent({
      eventId: "evt_paid_1",
      eventType: "invoice.paid",
      livemode: false,
      userId: "u_invoice",
      object: { id: "in_1", amount_paid: 980, currency: "jpy" },
    });
    await observeStripeRevenueEvent({
      eventId: "evt_paid_1",
      eventType: "invoice.paid",
      livemode: false,
      userId: "u_invoice",
      object: { id: "in_1", amount_paid: 980, currency: "jpy" },
    });
    const paid = listRevenueEvents().filter((event) => event.eventName === "invoice_paid");
    expect(paid).toHaveLength(1);
    expect(invoicePaidDedupeKey("evt_paid_1")).toBe(paid[0]?.dedupeKey);
  });

  it("leaves LTV and split MRR as unknown instead of 0", () => {
    const improve = buildOwnerImproveSnapshot(new Date("2026-08-24T00:00:00.000Z"));
    expect(improve.ltvYen).toBeNull();
    expect(improve.ltvLabel).toBe("データ不足");
    expect(improve.newMrrYen).toBeNull();
    expect(improve.churnMrrYen).toBeNull();
    expect(improve.expansionMrrYen).toBeNull();
    expect(improve.contractionMrrYen).toBeNull();
    expect(improve.netMrrYen).toBeNull();
    expect(improve.d7Retention).toBeNull();
    expect(improve.d30Retention).toBeNull();
  });

  it("does not count idle free users as paid_at_risk", () => {
    applyFirstSuccess("u_free_old", "SNS投稿文");
    const improve = buildOwnerImproveSnapshot(new Date("2026-08-24T00:00:00.000Z"));
    expect(improve.paidAtRisk).toBe(0);
  });

  it("counts a paid idle user as paid_at_risk", () => {
    paidSub("u_paid_idle", "light");
    applyFirstSuccess("u_paid_idle", "SNS投稿文");
    const state = getRevenueMaxState("u_paid_idle");
    state.lastValueAt = "2026-08-01T00:00:00.000Z";
    state.hadPaid = true;
    setRevenueMaxState(state);
    const improve = buildOwnerImproveSnapshot(new Date("2026-08-24T00:00:00.000Z"));
    expect(improve.paidAtRisk).toBe(1);
  });
});

describe("revenue maximize empty state helper", () => {
  it("creates an isolated user record", () => {
    resetRevenueMaxStoreForTests();
    expect(emptyState("fresh").events).toEqual([]);
  });
});

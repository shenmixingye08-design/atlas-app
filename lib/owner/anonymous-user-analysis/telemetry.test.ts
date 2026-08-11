import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { saveUserSubscription } from "@/lib/billing/subscriptions/store";

import {
  resetAnonymousUserAnalysisStore,
  listAnonymousUsageEvents,
} from "./store";
import { recordAnonymousUserActivity } from "./telemetry";

describe("recordAnonymousUserActivity", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");
  const originalSalt = process.env.ATLAS_ANON_SALT;
  const originalVercel = process.env.VERCEL_ENV;

  beforeEach(() => {
    resetAnonymousUserAnalysisStore();
    resetSubscriptionStore();
    saveUserSubscription({
      userId: "clerk_user_secret_123",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      planId: "standard",
      status: "active",
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now.toISOString(),
    });
  });

  afterEach(() => {
    resetAnonymousUserAnalysisStore();
    resetSubscriptionStore();
    if (originalSalt === undefined) {
      delete process.env.ATLAS_ANON_SALT;
    } else {
      process.env.ATLAS_ANON_SALT = originalSalt;
    }
    if (originalVercel === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercel;
    }
    vi.restoreAllMocks();
  });

  it("records activity when salt is available", () => {
    process.env.ATLAS_ANON_SALT = "test-salt-for-telemetry";
    process.env.VERCEL_ENV = "production";

    recordAnonymousUserActivity({
      userId: "clerk_user_secret_123",
      assignment: "SNS投稿案を作成",
      costUsd: 0.05,
      source: "orchestration",
    });

    const events = listAnonymousUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.anonymousUserId).toMatch(/^anon_/);
    expect(events[0]?.costUsd).toBe(0.05);
  });

  it("does not throw when ATLAS_ANON_SALT is missing in production", () => {
    delete process.env.ATLAS_ANON_SALT;
    process.env.VERCEL_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      recordAnonymousUserActivity({
        userId: "clerk_user_secret_123",
        assignment: "報告書を作成",
        costUsd: 0.01,
        source: "orchestration",
      }),
    ).not.toThrow();

    expect(listAnonymousUsageEvents()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    const joined = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(joined).toMatch(/ATLAS_ANON_SALT/);
  });

  it("no-ops without userId", () => {
    recordAnonymousUserActivity({
      userId: null,
      assignment: "x",
      costUsd: 0,
    });
    expect(listAnonymousUsageEvents()).toHaveLength(0);
  });
});

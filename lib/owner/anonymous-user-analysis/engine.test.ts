import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { saveUserSubscription } from "@/lib/billing/subscriptions/store";

import { buildAnonymousUserAnalysisSnapshot } from "./engine";
import { toAnonymousUserId } from "./id";
import {
  recordAnonymousUsageEvent,
  resetAnonymousUserAnalysisStore,
} from "./store";

describe("anonymous user analysis engine", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  beforeEach(() => {
    resetAnonymousUserAnalysisStore();
    resetSubscriptionStore();
  });

  afterEach(() => {
    resetAnonymousUserAnalysisStore();
    resetSubscriptionStore();
  });

  it("returns empty rows without PII when no live data exists", () => {
    const snapshot = buildAnonymousUserAnalysisSnapshot(now);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.isEstimated).toBe(false);
    expect(snapshot.users).toHaveLength(0);
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/email/i);
    expect(serialized).not.toMatch(/user_[a-z]/i);
  });

  it("aggregates live usage by anonymous ID only", () => {
    saveUserSubscription({
      userId: "clerk_user_secret_123",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      planId: "standard",
      status: "active",
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now.toISOString(),
    });

    const anonymousUserId = toAnonymousUserId("clerk_user_secret_123");

    recordAnonymousUsageEvent({
      anonymousUserId,
      planId: "standard",
      featureId: "sns",
      costUsd: 0.12,
      timestamp: "2026-07-08T10:00:00.000Z",
      source: "orchestration",
    });
    recordAnonymousUsageEvent({
      anonymousUserId,
      planId: "standard",
      featureId: "blog",
      costUsd: 0.08,
      timestamp: "2026-07-07T10:00:00.000Z",
      source: "orchestration",
    });

    const snapshot = buildAnonymousUserAnalysisSnapshot(now);
    const serialized = JSON.stringify(snapshot);
    const user = snapshot.users.find(
      (entry) => entry.anonymousUserId === anonymousUserId,
    );

    expect(snapshot.isEstimated).toBe(false);
    expect(user?.planLabel).toBe("Standard");
    expect(user?.apiCostUsd).toBe(0.2);
    expect(user?.usageCount).toBe(2);
    expect(user?.featuresUsed).toEqual(["SNS", "ブログ"]);
    expect(serialized).not.toContain("clerk_user_secret_123");
    expect(serialized).not.toMatch(/@/);
  });

  it("flags high cost users", () => {
    recordAnonymousUsageEvent({
      anonymousUserId: "anon_test_high_cost",
      planId: "light",
      featureId: "video",
      costUsd: 0.35,
      timestamp: "2026-07-08T10:00:00.000Z",
      source: "automation",
    });

    const snapshot = buildAnonymousUserAnalysisSnapshot(now);
    const user = snapshot.users.find(
      (entry) => entry.anonymousUserId === "anon_test_high_cost",
    );

    expect(user?.isHighCost).toBe(true);
    expect(snapshot.highCostCount).toBeGreaterThan(0);
  });
});

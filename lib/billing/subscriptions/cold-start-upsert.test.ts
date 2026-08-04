import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserSubscriptionRecord } from "./types";

const paidStandard: UserSubscriptionRecord = {
  userId: "user_paid_cold",
  stripeCustomerId: "cus_paid_cold",
  stripeSubscriptionId: "sub_paid_cold",
  stripePriceId: "price_standard_test",
  planId: "standard",
  status: "active",
  currentPeriodStart: "2026-07-01T00:00:00.000Z",
  currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("P0-1 cold-start Free overwrite", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("./persistence");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("./persistence");
  });

  it("wouldOverwriteDurablePaidWithFreeInvent detects Free invent clobber", async () => {
    const { wouldOverwriteDurablePaidWithFreeInvent, createDefaultSubscription } =
      await import("./store");

    const invented = createDefaultSubscription("user_paid_cold");
    expect(
      wouldOverwriteDurablePaidWithFreeInvent(invented, paidStandard),
    ).toBe(true);

    const explicitDowngrade: UserSubscriptionRecord = {
      ...invented,
      status: "canceled",
      stripeSubscriptionId: null,
    };
    expect(
      wouldOverwriteDurablePaidWithFreeInvent(explicitDowngrade, paidStandard),
    ).toBe(false);
  });

  it("upsert on empty memory hydrates durable paid before patch (no Free invent)", async () => {
    vi.doMock("./persistence", async () => {
      const actual = await vi.importActual<typeof import("./persistence")>(
        "./persistence",
      );
      return {
        ...actual,
        isBillingSupabaseConfigured: () => true,
        loadSubscriptionFromSupabase: vi.fn(async (userId: string) =>
          userId === paidStandard.userId ? { ...paidStandard } : null,
        ),
        loadSubscriptionFromClerk: vi.fn(async () => null),
        persistSubscriptionToSupabase: vi.fn(async () => true),
        persistSubscriptionToClerk: vi.fn(async () => undefined),
        readSubscriptionsFromDisk: () => new Map(),
        writeSubscriptionsToDisk: () => undefined,
      };
    });

    const { resetSubscriptionStore, getUserSubscription } = await import(
      "./store"
    );
    const { upsertUserSubscription, resolveUserSubscription } = await import(
      "./service"
    );

    resetSubscriptionStore();
    expect(getUserSubscription(paidStandard.userId)).toBeNull();

    // Cold-start write that previously invented Free + past_due and wiped paid.
    const next = await upsertUserSubscription(paidStandard.userId, {
      status: "past_due",
    });

    expect(next.planId).toBe("standard");
    expect(next.stripeSubscriptionId).toBe("sub_paid_cold");
    expect(next.status).toBe("past_due");
    expect(resolveUserSubscription(paidStandard.userId).planId).toBe(
      "standard",
    );
  });

  it("saveUserSubscription refuses Free invent overwrite against durable paid", async () => {
    const persist = vi.fn(async () => true);

    vi.doMock("./persistence", async () => {
      const actual = await vi.importActual<typeof import("./persistence")>(
        "./persistence",
      );
      return {
        ...actual,
        isBillingSupabaseConfigured: () => true,
        loadSubscriptionFromSupabase: vi.fn(async (userId: string) =>
          userId === paidStandard.userId ? { ...paidStandard } : null,
        ),
        loadSubscriptionFromClerk: vi.fn(async () => null),
        persistSubscriptionToSupabase: persist,
        persistSubscriptionToClerk: vi.fn(async () => undefined),
        readSubscriptionsFromDisk: () => new Map(),
        writeSubscriptionsToDisk: () => undefined,
      };
    });

    const {
      resetSubscriptionStore,
      saveUserSubscription,
      createDefaultSubscription,
      getUserSubscription,
    } = await import("./store");

    resetSubscriptionStore();
    const invented = createDefaultSubscription(paidStandard.userId);
    saveUserSubscription(invented);

    // Guard is async; allow microtask to run.
    await vi.waitFor(() => {
      expect(persist).not.toHaveBeenCalled();
    });

    const restored = getUserSubscription(paidStandard.userId);
    expect(restored?.planId).toBe("standard");
    expect(restored?.stripeSubscriptionId).toBe("sub_paid_cold");
  });
});

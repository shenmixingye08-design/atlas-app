import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserSubscriptionRecord } from "./types";

const light: UserSubscriptionRecord = {
  userId: "user_split",
  stripeCustomerId: "cus_light",
  stripeSubscriptionId: "sub_light",
  stripePriceId: "price_light",
  planId: "light",
  status: "active",
  currentPeriodStart: "2026-08-01T00:00:00.000Z",
  currentPeriodEnd: "2026-09-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const standard: UserSubscriptionRecord = {
  ...light,
  userId: "user_std",
  stripeSubscriptionId: "sub_std",
  stripePriceId: "price_standard",
  planId: "standard",
};

const premium: UserSubscriptionRecord = {
  ...light,
  userId: "user_prem",
  stripeSubscriptionId: "sub_prem",
  stripePriceId: "price_premium",
  planId: "premium",
};

const canceledLight: UserSubscriptionRecord = {
  ...light,
  userId: "user_cancel",
  planId: "free",
  status: "canceled",
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  updatedAt: "2026-08-12T00:00:00.000Z",
};

const downgradeScheduled: UserSubscriptionRecord = {
  ...standard,
  userId: "user_down",
  cancelAtPeriodEnd: true,
  updatedAt: "2026-08-08T00:00:00.000Z",
};

function durableMap(rows: UserSubscriptionRecord[]) {
  const byUser = new Map(rows.map((row) => [row.userId, row]));
  return {
    isBillingSupabaseConfigured: () => true,
    loadSubscriptionFromSupabase: vi.fn(async (userId: string) => {
      return byUser.get(userId) ? { ...byUser.get(userId)! } : null;
    }),
    loadSubscriptionFromClerk: vi.fn(async () => null),
    persistSubscriptionToSupabase: vi.fn(async () => true),
    persistSubscriptionToClerk: vi.fn(async () => undefined),
    findSubscriptionByStripeCustomerIdFromSupabase: vi.fn(async () => null),
    listSubscriptionsFromSupabase: vi.fn(async () =>
      rows.map((row) => ({ ...row })),
    ),
    readSubscriptionsFromDisk: () => new Map(),
    writeSubscriptionsToDisk: () => undefined,
  };
}

async function loadBilling(rows: UserSubscriptionRecord[]) {
  vi.resetModules();
  vi.doMock("./persistence", async () => {
    const actual = await vi.importActual<typeof import("./persistence")>(
      "./persistence",
    );
    return { ...actual, ...durableMap(rows) };
  });

  const store = await import("./store");
  const service = await import("./service");
  const billing = await import("../service");
  const access = await import("../access/snapshot");
  const checkout = await import("../stripe/checkout");
  store.resetSubscriptionStore();
  return { store, service, billing, access, checkout };
}

describe("subscription split-brain / single SoT", () => {
  beforeEach(() => {
    vi.unmock("./persistence");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("./persistence");
    vi.resetModules();
  });

  async function expectAligned(
    userId: string,
    planId: UserSubscriptionRecord["planId"],
    mods: Awaited<ReturnType<typeof loadBilling>>,
  ) {
    const summary = await mods.billing.getUserBillingSummary(userId);
    const snapshot = await mods.access.getBillingAccessSnapshot(userId);
    const authority = await mods.store.resolveUserSubscriptionAuthority(userId);

    expect(summary.subscription.planId).toBe(planId);
    expect(summary.plan.planId).toBe(planId);
    expect(summary.usageAwareness.subscribedPlanId ?? planId).toBe(planId);
    expect(snapshot.subscribedPlanId).toBe(planId);
    expect(authority.record.planId).toBe(planId);
    expect(summary.subscriptionConsistency).toBe("ok");

    if (planId === "free") {
      expect(summary.usage.planId).toBe("free");
      expect(snapshot.effectivePlanId).toBe("free");
    } else if (
      authority.record.status === "active" ||
      authority.record.status === "trialing"
    ) {
      expect(summary.usage.planId).toBe(planId);
      expect(snapshot.effectivePlanId).toBe(planId);
    }

    return { summary, snapshot, authority };
  }

  it("1. new Free user is Free everywhere", async () => {
    const mods = await loadBilling([]);
    await expectAligned("user_new", "free", mods);
  });

  it("2. active Light is Light everywhere", async () => {
    const mods = await loadBilling([light]);
    await expectAligned("user_split", "light", mods);
  });

  it("3. active Standard is Standard everywhere", async () => {
    const mods = await loadBilling([standard]);
    await expectAligned("user_std", "standard", mods);
  });

  it("4. active Premium is Premium everywhere", async () => {
    const mods = await loadBilling([premium]);
    await expectAligned("user_prem", "premium", mods);
  });

  it("5. after upgrade durable Standard wins", async () => {
    const upgraded: UserSubscriptionRecord = {
      ...light,
      planId: "standard",
      stripeSubscriptionId: "sub_upgraded",
      stripePriceId: "price_standard",
      updatedAt: "2026-08-14T11:00:00.000Z",
    };
    const mods = await loadBilling([upgraded]);
    await expectAligned("user_split", "standard", mods);
  });

  it("6. downgrade reservation keeps Standard until period end", async () => {
    const mods = await loadBilling([downgradeScheduled]);
    const { summary } = await expectAligned("user_down", "standard", mods);
    expect(summary.subscription.cancelAtPeriodEnd).toBe(true);
    expect(summary.subscription.isPaid).toBe(true);
  });

  it("7. canceled projects to Free", async () => {
    const mods = await loadBilling([canceledLight]);
    await expectAligned("user_cancel", "free", mods);
  });

  it("8. webhook-shaped durable row is used immediately", async () => {
    const webhooked: UserSubscriptionRecord = {
      ...light,
      userId: "user_wh",
      updatedAt: new Date().toISOString(),
    };
    const mods = await loadBilling([webhooked]);
    await expectAligned("user_wh", "light", mods);
  });

  it("9. cold start with empty memory reads durable Light", async () => {
    const mods = await loadBilling([light]);
    expect(mods.store.getUserSubscription(light.userId)).toBeNull();
    await expectAligned("user_split", "light", mods);
  });

  it("10. stale memory Free / durable Light → Light", async () => {
    const mods = await loadBilling([light]);
    mods.store.putSubscriptionInMemoryCache({
      ...mods.store.createDefaultSubscription(light.userId),
      updatedAt: "2026-08-14T15:00:00.000Z",
    });
    expect(mods.store.getUserSubscription(light.userId)?.planId).toBe("free");
    await expectAligned("user_split", "light", mods);
  });

  it("11. stale memory Light / durable Free canceled → Free", async () => {
    const mods = await loadBilling([canceledLight]);
    mods.store.putSubscriptionInMemoryCache({
      ...light,
      userId: canceledLight.userId,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await expectAligned("user_cancel", "free", mods);
  });

  it("12. two serverless instances: A cache Free, B durable Light", async () => {
    const mods = await loadBilling([light]);
    // Instance A warm cache
    mods.store.putSubscriptionInMemoryCache(
      mods.store.createDefaultSubscription(light.userId),
    );
    const summaryA = await mods.billing.getUserBillingSummary(light.userId);
    const snapshotA = await mods.access.getBillingAccessSnapshot(light.userId);
    const checkoutCurrent = await mods.store.resolveUserSubscriptionDurable(
      light.userId,
    );
    expect(summaryA.subscription.planId).toBe("light");
    expect(snapshotA.subscribedPlanId).toBe("light");
    expect(snapshotA.effectivePlanId).toBe("light");
    expect(summaryA.usage.planId).toBe("light");
    expect(checkoutCurrent.planId).toBe("light");
  });

  it("13-14. webhook retry / duplicate apply stays Light", async () => {
    const mods = await loadBilling([light]);
    await mods.service.applySubscriptionFromStripe({
      userId: light.userId,
      stripeCustomerId: light.stripeCustomerId!,
      stripeSubscriptionId: light.stripeSubscriptionId!,
      planId: "light",
      status: "active",
      currentPeriodStart: light.currentPeriodStart!,
      currentPeriodEnd: light.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      stripePriceId: light.stripePriceId,
    });
    await mods.service.applySubscriptionFromStripe({
      userId: light.userId,
      stripeCustomerId: light.stripeCustomerId!,
      stripeSubscriptionId: light.stripeSubscriptionId!,
      planId: "light",
      status: "active",
      currentPeriodStart: light.currentPeriodStart!,
      currentPeriodEnd: light.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      stripePriceId: light.stripePriceId,
    });
    await expectAligned("user_split", "light", mods);
  });

  it("15. Billing Summary then Checkout current plan stay aligned", async () => {
    const mods = await loadBilling([light]);
    const summary = await mods.billing.getUserBillingSummary(light.userId);
    const checkoutCurrent = await mods.store.resolveUserSubscriptionDurable(
      light.userId,
    );
    expect(summary.subscription.planId).toBe(checkoutCurrent.planId);
    expect(summary.plan.planId).toBe(checkoutCurrent.planId);
    expect(summary.usage.planId).toBe(checkoutCurrent.planId);

    await expect(
      mods.checkout.assertNoDuplicatePaidSubscription({
        userId: light.userId,
        planId: "light",
        stripe: null,
      }),
    ).rejects.toMatchObject({ code: "already_same_plan" });

    await expect(
      mods.checkout.assertNoDuplicatePaidSubscription({
        userId: light.userId,
        planId: "standard",
        stripe: null,
      }),
    ).rejects.toMatchObject({ code: "use_portal_for_plan_change" });
  });

  it("Free user can start Light checkout (no already_same_plan)", async () => {
    const mods = await loadBilling([]);
    const summary = await mods.billing.getUserBillingSummary("user_new");
    expect(summary.subscription.planId).toBe("free");
    await expect(
      mods.checkout.assertNoDuplicatePaidSubscription({
        userId: "user_new",
        planId: "light",
        stripe: null,
      }),
    ).resolves.toBeUndefined();
  });
});

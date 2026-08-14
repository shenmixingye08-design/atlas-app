import { describe, expect, it } from "vitest";

import {
  isEphemeralFreeInvent,
  pickAuthoritativeSubscription,
} from "./authority";
import type { UserSubscriptionRecord } from "./types";

function record(
  patch: Partial<UserSubscriptionRecord> &
    Pick<UserSubscriptionRecord, "userId" | "planId" | "status" | "updatedAt">,
): UserSubscriptionRecord {
  return {
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodStart: patch.updatedAt,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...patch,
  };
}

describe("pickAuthoritativeSubscription", () => {
  it("returns null when both sides are empty (new Free user)", () => {
    const picked = pickAuthoritativeSubscription({
      memory: null,
      durable: null,
    });
    expect(picked.record).toBeNull();
    expect(picked.consistency).toBe("ok");
  });

  it("prefers durable Light over stale memory Free invent", () => {
    const memory = record({
      userId: "u1",
      planId: "free",
      status: "active",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const durable = record({
      userId: "u1",
      planId: "light",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_light",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    expect(isEphemeralFreeInvent(memory)).toBe(true);
    const picked = pickAuthoritativeSubscription({
      memory,
      durable,
      durableSource: "supabase",
    });
    expect(picked.record?.planId).toBe("light");
    expect(picked.source).toBe("supabase");
    expect(picked.consistency).toBe("ok");
  });

  it("prefers newer durable Free/canceled over stale memory Light", () => {
    const memory = record({
      userId: "u1",
      planId: "light",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_light",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const durable = record({
      userId: "u1",
      planId: "free",
      status: "canceled",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: null,
      updatedAt: "2026-08-10T00:00:00.000Z",
    });

    const picked = pickAuthoritativeSubscription({
      memory,
      durable,
      durableSource: "supabase",
    });
    expect(picked.record?.planId).toBe("free");
    expect(picked.record?.status).toBe("canceled");
    expect(picked.source).toBe("supabase");
  });

  it("keeps a strictly newer memory write when persist is in flight", () => {
    const durable = record({
      userId: "u1",
      planId: "light",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      updatedAt: "2026-08-14T10:00:00.000Z",
    });
    const memory = record({
      ...durable,
      planId: "standard",
      stripeSubscriptionId: "sub_2",
      stripePriceId: "price_standard",
      updatedAt: "2026-08-14T10:00:05.000Z",
    });

    const picked = pickAuthoritativeSubscription({
      memory,
      durable,
      durableSource: "supabase",
    });
    expect(picked.record?.planId).toBe("standard");
    expect(picked.source).toBe("memory_cache");
    expect(picked.consistency).toBe("ok");
  });

  it("marks conflict when two paid plans disagree within 2s", () => {
    const memory = record({
      userId: "u1",
      planId: "light",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_a",
      updatedAt: "2026-08-14T12:00:00.000Z",
    });
    const durable = record({
      userId: "u1",
      planId: "standard",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_b",
      updatedAt: "2026-08-14T12:00:01.000Z",
    });

    const picked = pickAuthoritativeSubscription({
      memory,
      durable,
      durableSource: "supabase",
    });
    expect(picked.consistency).toBe("conflict");
    expect(picked.record?.planId).toBe("standard");
  });
});

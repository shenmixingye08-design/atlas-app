import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deactivatePushSubscription,
  listActivePushSubscriptions,
  resetPushSubscriptionStoreForTests,
  upsertPushSubscription,
} from "./subscription-store";

describe("push subscription store", () => {
  beforeEach(() => {
    resetPushSubscriptionStoreForTests();
  });

  it("5: creates a durable subscription for a user", async () => {
    const created = await upsertPushSubscription({
      userId: "user_a",
      endpoint: "https://push.example/a",
      p256dh: "p256",
      authKey: "auth",
      platform: "android",
      browser: "chrome",
    });
    expect(created?.userId).toBe("user_a");
    expect(created?.endpoint).toBe("https://push.example/a");
    expect(created?.isActive).toBe(true);
    expect(created?.createdAt).toBeTruthy();
    expect(created?.updatedAt).toBeTruthy();
    expect(await listActivePushSubscriptions("user_a")).toHaveLength(1);
  });

  it("6: updates the same endpoint instead of duplicating", async () => {
    const first = await upsertPushSubscription({
      userId: "user_a",
      endpoint: "https://push.example/same",
      p256dh: "old",
      authKey: "old",
    });
    const second = await upsertPushSubscription({
      userId: "user_a",
      endpoint: "https://push.example/same",
      p256dh: "new",
      authKey: "new",
    });
    expect(second?.id).toBe(first?.id);
    expect(second?.p256dh).toBe("new");
    expect(await listActivePushSubscriptions("user_a")).toHaveLength(1);
  });

  it("7: deactivates a subscription for the owning user only", async () => {
    await upsertPushSubscription({
      userId: "user_a",
      endpoint: "https://push.example/a",
      p256dh: "p",
      authKey: "a",
    });
    expect(
      await deactivatePushSubscription({
        userId: "user_b",
        endpoint: "https://push.example/a",
      }),
    ).toBe(false);
    expect(await listActivePushSubscriptions("user_a")).toHaveLength(1);

    expect(
      await deactivatePushSubscription({
        userId: "user_a",
        endpoint: "https://push.example/a",
      }),
    ).toBe(true);
    expect(await listActivePushSubscriptions("user_a")).toHaveLength(0);
  });
});

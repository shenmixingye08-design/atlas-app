import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const lineDeliveries: string[] = [];
const pushDeliveries: string[] = [];

vi.mock("@/lib/notifications/delivery", () => ({
  deliverLineWithAck: vi.fn(async (input: { notificationId: string; skipDlq?: boolean }) => {
    lineDeliveries.push(input.notificationId);
    return {
      ok: true,
      status: "delivered" as const,
      attempts: 1,
      sentCount: 1,
      skipReason: null,
      error: null,
      softSuccess: false as const,
    };
  }),
  deliverWebPushWithAck: vi.fn(async (input: {
    record: { notificationId: string };
    skipDlq?: boolean;
  }) => {
    pushDeliveries.push(input.record.notificationId);
    return {
      ok: true,
      status: "delivered" as const,
      attempts: 1,
      sentCount: 1,
      skipReason: null,
      error: null,
      softSuccess: false as const,
    };
  }),
}));

import { deliverLineWithAck, deliverWebPushWithAck } from "@/lib/notifications/delivery";
import {
  claimDueDeliveryRetry,
  listDueDeliveryRetries,
  resetDurableInboxForTests,
  scheduleDurableDeliveryRetry,
  updateDurableDeliveryState,
} from "@/lib/notifications/durable-inbox";
import { listNotificationDlq } from "@/lib/notifications/dlq";
import { processDurableNotificationRetries } from "@/lib/notifications/retry-drain";
import { createUserNotification } from "@/lib/notifications/service";
import { resetNotificationStore } from "@/lib/notifications/store";
import { resetSideEffectStoreForTests } from "@/lib/side-effects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const USER_A = "user_p102_a";
const USER_B = "user_p102_b";

async function seedRetry(input: {
  userId: string;
  requestId: string;
  lineEvent?: boolean;
  maxFailOnce?: boolean;
}) {
  const created = await createUserNotification(
    {
      audience: "user",
      userId: input.userId,
      type: "automation",
      title: "retry-me",
      message: "body",
      requestId: input.requestId,
      lineEvent: input.lineEvent === false ? null : "automation_completed",
      automationId: "auto_p102",
    },
    { skipDelivery: true },
  );
  expect(created?.notificationId).toBeTruthy();
  await scheduleDurableDeliveryRetry({
    notificationId: created!.notificationId,
    ownerId: input.userId,
    errorMessage: "transient",
    delayMs: 0,
  });
  return created!;
}

describe("P1-02 notification retry/DLQ → automation tick", () => {
  beforeEach(() => {
    resetNotificationStore();
    resetDurableInboxForTests();
    resetSideEffectStoreForTests();
    lineDeliveries.length = 0;
    pushDeliveries.length = 0;
    vi.mocked(deliverLineWithAck).mockClear();
    vi.mocked(deliverWebPushWithAck).mockClear();
    vi.mocked(deliverLineWithAck).mockImplementation(async (input) => {
      lineDeliveries.push(input.notificationId);
      return {
        ok: true,
        status: "delivered",
        attempts: 1,
        sentCount: 1,
        skipReason: null,
        error: null,
        softSuccess: false,
      };
    });
    vi.mocked(deliverWebPushWithAck).mockImplementation(async (input) => {
      pushDeliveries.push(input.record.notificationId);
      return {
        ok: true,
        status: "delivered",
        attempts: 1,
        sentCount: 1,
        skipReason: null,
        error: null,
        softSuccess: false,
      };
    });
  });

  it("1: tick drain processes due retries", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_drain_1" });
    const dueBefore = await listDueDeliveryRetries({ nowMs: Date.now() + 1000 });
    expect(dueBefore.some((r) => r.notificationId === n.notificationId)).toBe(true);

    const result = await processDurableNotificationRetries({
      nowMs: Date.now() + 1000,
      leaseOwner: "tick_1",
    });
    expect(result.due).toBeGreaterThanOrEqual(1);
    expect(result.claimed).toBeGreaterThanOrEqual(1);
    expect(result.delivered).toBeGreaterThanOrEqual(1);
    expect(result.dlqReinjected).toBe(0);
    expect(lineDeliveries).toContain(n.notificationId);
    expect(pushDeliveries).toContain(n.notificationId);

    const dueAfter = await listDueDeliveryRetries({ nowMs: Date.now() + 1000 });
    expect(dueAfter.some((r) => r.notificationId === n.notificationId)).toBe(false);
  });

  it("2: successful retry does not double-send on second drain", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_once" });
    await processDurableNotificationRetries({
      nowMs: Date.now() + 1000,
      leaseOwner: "tick_a",
    });
    const firstLine = lineDeliveries.filter((id) => id === n.notificationId).length;
    const firstPush = pushDeliveries.filter((id) => id === n.notificationId).length;
    expect(firstLine).toBe(1);
    expect(firstPush).toBe(1);

    await processDurableNotificationRetries({
      nowMs: Date.now() + 1000,
      leaseOwner: "tick_b",
    });
    expect(lineDeliveries.filter((id) => id === n.notificationId)).toHaveLength(1);
    expect(pushDeliveries.filter((id) => id === n.notificationId)).toHaveLength(1);
  });

  it("3: max retries → DLQ dead, not infinite reschedule", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_dlq" });
    vi.mocked(deliverLineWithAck).mockImplementation(async () => ({
      ok: false,
      status: "failed" as const,
      attempts: 3,
      sentCount: 0,
      skipReason: null,
      error: "line_down",
      softSuccess: false as const,
    }));
    vi.mocked(deliverWebPushWithAck).mockImplementation(async () => ({
      ok: false,
      status: "failed" as const,
      attempts: 3,
      sentCount: 0,
      skipReason: null,
      error: "push_down",
      softSuccess: false as const,
    }));

    // Force retryCount to max so next failure dead-letters.
    await updateDurableDeliveryState({
      notificationId: n.notificationId,
      ownerId: USER_A,
      status: "retry_scheduled",
      retryCount: 5,
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
      pushFailureReason: "force_max",
    });

    const result = await processDurableNotificationRetries({
      nowMs: Date.now(),
      leaseOwner: "tick_dlq",
    });
    expect(result.deadLettered).toBeGreaterThanOrEqual(1);
    expect(result.dlqReinjected).toBe(0);

    const dlq = await listNotificationDlq(50);
    expect(
      dlq.some(
        (row) =>
          row.notificationId === n.notificationId &&
          row.userId === USER_A &&
          row.status === "dead",
      ),
    ).toBe(true);

    // DLQ items must not reappear as due retries.
    const due = await listDueDeliveryRetries({ nowMs: Date.now() + 60_000 });
    expect(due.some((r) => r.notificationId === n.notificationId)).toBe(false);
  });

  it("4: concurrent claim → single winner", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_race" });
    const [a, b] = await Promise.all([
      claimDueDeliveryRetry({
        notificationId: n.notificationId,
        ownerId: USER_A,
        leaseOwner: "w1",
        nowMs: Date.now() + 1000,
      }),
      claimDueDeliveryRetry({
        notificationId: n.notificationId,
        ownerId: USER_A,
        leaseOwner: "w2",
        nowMs: Date.now() + 1000,
      }),
    ]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it("5: cross-user isolation — B cannot claim A retry", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_owner" });
    const stolen = await claimDueDeliveryRetry({
      notificationId: n.notificationId,
      ownerId: USER_B,
      leaseOwner: "evil",
      nowMs: Date.now() + 1000,
    });
    expect(stolen).toBeNull();
    const owned = await claimDueDeliveryRetry({
      notificationId: n.notificationId,
      ownerId: USER_A,
      leaseOwner: "ok",
      nowMs: Date.now() + 1000,
    });
    expect(owned?.ownerId).toBe(USER_A);
  });

  it("6: idempotent create reuse does not re-deliver", async () => {
    const first = await createUserNotification({
      audience: "user",
      userId: USER_A,
      type: "automation",
      title: "once",
      message: "m",
      requestId: "req_idem_create",
      lineEvent: "automation_completed",
    });
    expect(first).toBeTruthy();
    const lineAfterFirst = lineDeliveries.length;
    const pushAfterFirst = pushDeliveries.length;

    const second = await createUserNotification({
      audience: "user",
      userId: USER_A,
      type: "automation",
      title: "once",
      message: "m",
      requestId: "req_idem_create",
      lineEvent: "automation_completed",
    });
    expect(second?.notificationId).toBe(first?.notificationId);
    expect(lineDeliveries.length).toBe(lineAfterFirst);
    expect(pushDeliveries.length).toBe(pushAfterFirst);
  });

  it("7: automation tick route wires processDurableNotificationRetries", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/automations/tick/route.ts"),
      "utf8",
    );
    expect(src).toContain("processDurableNotificationRetries");
    expect(src).toContain("notificationRetries");
  });

  it("8b: forceDeliveryFailureForOwner at max retries → DLQ (prod smoke path)", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_force_dlq" });
    await updateDurableDeliveryState({
      notificationId: n.notificationId,
      ownerId: USER_A,
      status: "retry_scheduled",
      retryCount: 5,
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
    });
    // Soft-success LINE would otherwise mark delivered; force failure like prod smoke.
    vi.mocked(deliverLineWithAck).mockImplementation(async () => ({
      ok: true,
      status: "skipped" as const,
      attempts: 1,
      sentCount: 0,
      skipReason: "not_configured",
      error: null,
      softSuccess: false as const,
    }));
    vi.mocked(deliverWebPushWithAck).mockImplementation(async () => ({
      ok: true,
      status: "skipped" as const,
      attempts: 1,
      sentCount: 0,
      skipReason: "no_subscription_or_disabled",
      error: null,
      softSuccess: false as const,
    }));
    const result = await processDurableNotificationRetries({
      nowMs: Date.now(),
      leaseOwner: "force_dlq",
      forceDeliveryFailureForOwner: USER_A,
    });
    expect(result.deadLettered).toBeGreaterThanOrEqual(1);
    expect(result.dlqReinjected).toBe(0);
    const dlq = await listNotificationDlq(50);
    expect(
      dlq.some(
        (row) =>
          row.notificationId === n.notificationId && row.status === "dead",
      ),
    ).toBe(true);
  });

  it("8: crash-after-success style reclaim does not double-send (P1-04)", async () => {
    const n = await seedRetry({ userId: USER_A, requestId: "req_crash" });
    await processDurableNotificationRetries({
      nowMs: Date.now() + 1000,
      leaseOwner: "w_crash_1",
    });
    expect(lineDeliveries.filter((id) => id === n.notificationId)).toHaveLength(1);

    // Force back to due (simulate status confusion) — side-effect claim blocks resend.
    await updateDurableDeliveryState({
      notificationId: n.notificationId,
      ownerId: USER_A,
      status: "retry_scheduled",
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 1000).toISOString(),
    });
    await processDurableNotificationRetries({
      nowMs: Date.now(),
      leaseOwner: "w_crash_2",
    });
    // Provider mock not called again because P1-04 reuses succeeded claim.
    expect(lineDeliveries.filter((id) => id === n.notificationId)).toHaveLength(1);
    expect(pushDeliveries.filter((id) => id === n.notificationId)).toHaveLength(1);
  });
});

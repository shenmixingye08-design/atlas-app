import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildNotificationIdempotencyKey,
  cleanupExpiredDurableNotifications,
  countDurableUnread,
  getDurableNotification,
  insertDurableNotification,
  listDueDeliveryRetries,
  listDurableNotifications,
  markAllDurableNotificationsRead,
  markDurableNotificationRead,
  NotificationInboxUnavailableError,
  resetDurableInboxForTests,
  scheduleDurableDeliveryRetry,
  softDeleteDurableNotification,
  updateDurableDeliveryState,
} from "./durable-inbox";
import { resolveNotificationStorageBackend } from "./notification-backend";
import {
  countUnreadUserNotifications,
  createUserNotification,
  getUserNotificationById,
  listUserNotifications,
  markAllUserNotificationsRead,
  markNotificationRead,
  removeUserNotification,
} from "./service";
import { MAX_NOTIFICATIONS_PER_USER, resetNotificationStore } from "./store";
import type { NotificationRecord } from "./types";

const USER_A = "user_p04_a";
const USER_B = "user_p04_b";
const ORG_A = "org_p04_a";
const ORG_B = "org_p04_b";

function draft(
  ownerId: string,
  extras?: Partial<NotificationRecord> & { requestId?: string },
): NotificationRecord {
  const notificationId = extras?.notificationId ?? `ntf_${ownerId}_${Math.random().toString(16).slice(2)}`;
  return {
    notificationId,
    userId: ownerId,
    audience: "user",
    type: extras?.type ?? "completed",
    title: extras?.title ?? "完了",
    message: extras?.message ?? "本文",
    relatedTaskId: extras?.relatedTaskId ?? null,
    relatedService: null,
    isRead: false,
    createdAt: extras?.createdAt ?? new Date().toISOString(),
    actionUrl: extras?.actionUrl ?? "/workspace",
    requestId: extras?.requestId ?? null,
    deliverableId: extras?.deliverableId ?? null,
    workflowRunId: extras?.workflowRunId ?? null,
    readAt: null,
  };
}

describe("P0-4 durable user notification inbox", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    resetNotificationStore();
    resetDurableInboxForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetNotificationStore();
    resetDurableInboxForTests();
  });

  it("0: backend is memory_durable for these tests", () => {
    expect(resolveNotificationStorageBackend()).toBe("memory_durable");
  });

  it("1+2: User A and User B create isolated notifications", async () => {
    await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "A完了",
        message: "A",
        requestId: "req_a_1",
      },
      { skipDelivery: true },
    );
    await createUserNotification(
      {
        audience: "user",
        userId: USER_B,
        type: "completed",
        title: "B完了",
        message: "B",
        requestId: "req_b_1",
      },
      { skipDelivery: true },
    );
    const a = await listUserNotifications(USER_A);
    const b = await listUserNotifications(USER_B);
    expect(a.every((n) => n.userId === USER_A)).toBe(true);
    expect(b.every((n) => n.userId === USER_B)).toBe(true);
    expect(a.some((n) => n.title === "B完了")).toBe(false);
    expect(b.some((n) => n.title === "A完了")).toBe(false);
  });

  it("3: User B cannot fetch User A notificationId", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "秘密",
        message: "A only",
        requestId: "req_secret",
      },
      { skipDelivery: true },
    );
    expect(created).toBeTruthy();
    const stolen = await getUserNotificationById(
      created!.notificationId,
      USER_B,
    );
    expect(stolen).toBeNull();
    const marked = await markNotificationRead(created!.notificationId, USER_B);
    expect(marked).toBeNull();
    const deleted = await removeUserNotification(
      created!.notificationId,
      USER_B,
    );
    expect(deleted).toBe(false);
    expect(
      await getUserNotificationById(created!.notificationId, USER_A),
    ).toBeTruthy();
  });

  it("4: forged ownerId cannot read another user's row", async () => {
    const row = draft(USER_A, { requestId: "req_forge" });
    await insertDurableNotification(row, {
      idempotencyKey: buildNotificationIdempotencyKey({
        ownerId: USER_A,
        eventType: "completed",
        sourceId: "req_forge",
        channel: "in_app",
      }),
      organizationId: ORG_A,
      sourceId: "req_forge",
    });
    expect(
      await getDurableNotification({
        notificationId: row.notificationId,
        ownerId: "forged_owner",
      }),
    ).toBeNull();
  });

  it("5: ownerId missing rejects durable insert / list", async () => {
    await expect(
      insertDurableNotification(
        { ...draft(USER_A), userId: null },
        {
          idempotencyKey: "k",
          sourceId: "x",
        },
      ),
    ).rejects.toBeInstanceOf(NotificationInboxUnavailableError);

    await expect(
      listDurableNotifications({ ownerId: "" }),
    ).rejects.toBeInstanceOf(NotificationInboxUnavailableError);

    expect(await listUserNotifications("")).toEqual([]);
    expect(await countUnreadUserNotifications("")).toBe(0);
  });

  it("6: organization boundary filters inbox", async () => {
    const a = draft(USER_A, { requestId: "org_a" });
    const b = draft(USER_A, { requestId: "org_b", notificationId: "ntf_org_b" });
    await insertDurableNotification(a, {
      idempotencyKey: "idem_org_a",
      organizationId: ORG_A,
      sourceId: "org_a",
    });
    await insertDurableNotification(b, {
      idempotencyKey: "idem_org_b",
      organizationId: ORG_B,
      sourceId: "org_b",
    });
    const onlyA = await listDurableNotifications({
      ownerId: USER_A,
      organizationId: ORG_A,
    });
    expect(onlyA).toHaveLength(1);
    expect(onlyA[0]?.notificationId).toBe(a.notificationId);
  });

  it("7: 100 concurrent creates for distinct users stay isolated", async () => {
    const users = Array.from({ length: 100 }, (_, i) => `user_p04_mass_${i}`);
    await Promise.all(
      users.map((userId, i) =>
        createUserNotification(
          {
            audience: "user",
            userId,
            type: "completed",
            title: `u${i}`,
            message: "m",
            requestId: `req_mass_${i}`,
          },
          { skipDelivery: true },
        ),
      ),
    );
    let leaked = 0;
    for (const userId of users) {
      const list = await listUserNotifications(userId);
      leaked += list.filter((n) => n.userId !== userId).length;
      expect(list).toHaveLength(1);
    }
    expect(leaked).toBe(0);
  });

  it("8: same event 100 times → 1 durable notification (idempotency)", async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        createUserNotification(
          {
            audience: "user",
            userId: USER_A,
            type: "completed",
            title: "同一",
            message: "同一イベント",
            requestId: "req_idem_100",
          },
          { skipDelivery: true, eventVersion: "v1" },
        ),
      ),
    );
    const ids = new Set(results.filter(Boolean).map((r) => r!.notificationId));
    expect(ids.size).toBe(1);
    expect(await listUserNotifications(USER_A)).toHaveLength(1);
  });

  it("9: Cold Start (process cache cleared) still returns durable inbox", async () => {
    await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "cold",
        message: "survive",
        requestId: "req_cold",
      },
      { skipDelivery: true },
    );
    resetNotificationStore(); // process cache gone
    const list = await listUserNotifications(USER_A);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("cold");
  });

  it("10: alternate-instance equivalent reads same durable rows", async () => {
    await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "multi",
        message: "instance",
        requestId: "req_multi",
      },
      { skipDelivery: true },
    );
    resetNotificationStore();
    const fromDurable = await listDurableNotifications({ ownerId: USER_A });
    const fromService = await listUserNotifications(USER_A);
    expect(fromDurable.map((n) => n.notificationId)).toEqual(
      fromService.map((n) => n.notificationId),
    );
  });

  it("11: mark read twice is idempotent", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "read",
        message: "x",
        requestId: "req_read",
      },
      { skipDelivery: true },
    );
    const first = await markNotificationRead(created!.notificationId, USER_A);
    const second = await markNotificationRead(created!.notificationId, USER_A);
    expect(first?.isRead).toBe(true);
    expect(second?.isRead).toBe(true);
    expect(first?.readAt).toBe(second?.readAt);
    expect(await countUnreadUserNotifications(USER_A)).toBe(0);
  });

  it("12: mark all read under concurrency keeps unread=0", async () => {
    for (let i = 0; i < 20; i += 1) {
      await createUserNotification(
        {
          audience: "user",
          userId: USER_A,
          type: "completed",
          title: `n${i}`,
          message: "m",
          requestId: `req_all_${i}`,
        },
        { skipDelivery: true },
      );
    }
    await Promise.all([
      markAllUserNotificationsRead(USER_A),
      markAllUserNotificationsRead(USER_A),
      markAllDurableNotificationsRead({ ownerId: USER_A }),
    ]);
    expect(await countUnreadUserNotifications(USER_A)).toBe(0);
    expect(await countDurableUnread(USER_A)).toBe(0);
  });

  it("13: unread count stays consistent under concurrent marks", async () => {
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createUserNotification(
          {
            audience: "user",
            userId: USER_A,
            type: "completed",
            title: `u${i}`,
            message: "m",
            requestId: `req_unread_${i}`,
          },
          { skipDelivery: true },
        ),
      ),
    );
    expect(await countUnreadUserNotifications(USER_A)).toBe(10);
    await Promise.all(
      created.map((n) => markNotificationRead(n!.notificationId, USER_A)),
    );
    expect(await countUnreadUserNotifications(USER_A)).toBe(0);
  });

  it("14: Production forbids memory_durable backend", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "memory_durable");
    expect(() => resolveNotificationStorageBackend()).toThrow(
      /forbidden in Production/,
    );
  });

  it("15: delivery failure schedules durable retry; in-app row remains", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "retry",
        message: "keep",
        requestId: "req_retry",
      },
      { skipDelivery: true },
    );
    await scheduleDurableDeliveryRetry({
      notificationId: created!.notificationId,
      ownerId: USER_A,
      errorMessage: "transient_push",
      delayMs: 0,
    });
    const due = await listDueDeliveryRetries({ nowMs: Date.now() + 1_000 });
    expect(due.some((r) => r.notificationId === created!.notificationId)).toBe(
      true,
    );
    expect(
      await getUserNotificationById(created!.notificationId, USER_A),
    ).toBeTruthy();
  });

  it("16: delivery success updates state without losing inbox row", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "delivered",
        message: "ok",
        requestId: "req_deliv",
      },
      { skipDelivery: true },
    );
    await updateDurableDeliveryState({
      notificationId: created!.notificationId,
      ownerId: USER_A,
      status: "delivered",
      pushSentAt: new Date().toISOString(),
    });
    const list = await listUserNotifications(USER_A);
    expect(list).toHaveLength(1);
  });

  it("17+18+19: channel idempotency keys differ per channel; same channel dedupes", async () => {
    const base = {
      ownerId: USER_A,
      eventType: "completed",
      sourceId: "req_ch",
      eventVersion: "v1",
    };
    const inApp = buildNotificationIdempotencyKey({ ...base, channel: "in_app" });
    const push = buildNotificationIdempotencyKey({ ...base, channel: "push" });
    const line = buildNotificationIdempotencyKey({ ...base, channel: "line" });
    const email = buildNotificationIdempotencyKey({ ...base, channel: "email" });
    expect(new Set([inApp, push, line, email]).size).toBe(4);

    const row = draft(USER_A, { requestId: "req_ch" });
    const first = await insertDurableNotification(row, {
      idempotencyKey: inApp,
      channel: "in_app",
      sourceId: "req_ch",
    });
    const second = await insertDurableNotification(
      { ...row, notificationId: "ntf_dup_should_not" },
      {
        idempotencyKey: inApp,
        channel: "in_app",
        sourceId: "req_ch",
      },
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.notificationId).toBe(first.record.notificationId);
  });

  it("20: retry schedule survives process-cache clear (restart equivalent)", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "restart",
        message: "r",
        requestId: "req_restart",
      },
      { skipDelivery: true },
    );
    await scheduleDurableDeliveryRetry({
      notificationId: created!.notificationId,
      ownerId: USER_A,
      errorMessage: "boom",
      delayMs: 0,
    });
    resetNotificationStore();
    const due = await listDueDeliveryRetries({ nowMs: Date.now() + 5_000 });
    expect(due.some((r) => r.notificationId === created!.notificationId)).toBe(
      true,
    );
  });

  it("21: retention cleanup soft-deletes expired rows only for owner", async () => {
    const expired = draft(USER_A, {
      requestId: "req_exp",
      notificationId: "ntf_exp",
    });
    await insertDurableNotification(expired, {
      idempotencyKey: "idem_exp",
      sourceId: "req_exp",
    });
    // Directly mutate memory row expiresAt (test-only memory_durable bucket)
    const bucket = (
      globalThis as typeof globalThis & {
        __atlasDurableNotificationInbox?: Map<string, { expiresAt: string | null }>;
      }
    ).__atlasDurableNotificationInbox;
    const row = bucket?.get("ntf_exp");
    expect(row).toBeTruthy();
    row!.expiresAt = new Date(Date.now() - 1000).toISOString();

    await createUserNotification(
      {
        audience: "user",
        userId: USER_B,
        type: "completed",
        title: "keep",
        message: "b",
        requestId: "req_b_keep",
      },
      { skipDelivery: true },
    );

    const cleaned = await cleanupExpiredDurableNotifications({
      ownerId: USER_A,
      nowMs: Date.now(),
    });
    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(await listUserNotifications(USER_A)).toHaveLength(0);
    expect(await listUserNotifications(USER_B)).toHaveLength(1);
  });

  it("22: expiresAt filters list before cleanup", async () => {
    const row = draft(USER_A, { notificationId: "ntf_exp2", requestId: "e2" });
    await insertDurableNotification(row, {
      idempotencyKey: "idem_e2",
      sourceId: "e2",
    });
    const bucket = (
      globalThis as typeof globalThis & {
        __atlasDurableNotificationInbox?: Map<string, { expiresAt: string | null }>;
      }
    ).__atlasDurableNotificationInbox;
    bucket!.get("ntf_exp2")!.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(await listDurableNotifications({ ownerId: USER_A })).toHaveLength(0);
  });

  it("23: pagination-stable ordering when new notifications arrive", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await insertDurableNotification(
        draft(USER_A, {
          notificationId: `ntf_page_${i}`,
          requestId: `page_${i}`,
          createdAt: new Date(t0 + i).toISOString(),
        }),
        {
          idempotencyKey: `idem_page_${i}`,
          sourceId: `page_${i}`,
        },
      );
    }
    const firstPage = await listDurableNotifications({
      ownerId: USER_A,
      limit: 3,
    });
    await insertDurableNotification(
      draft(USER_A, {
        notificationId: "ntf_page_new",
        requestId: "page_new",
        createdAt: new Date(t0 + 100).toISOString(),
        title: "newest",
      }),
      { idempotencyKey: "idem_page_new", sourceId: "page_new" },
    );
    const second = await listDurableNotifications({ ownerId: USER_A, limit: 3 });
    expect(second[0]?.title).toBe("newest");
    expect(firstPage).toHaveLength(3);
    expect(second).toHaveLength(3);
  });

  it("24: soft-delete hides notification from subsequent fetches", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "del",
        message: "x",
        requestId: "req_del",
      },
      { skipDelivery: true },
    );
    expect(
      await softDeleteDurableNotification({
        notificationId: created!.notificationId,
        ownerId: USER_A,
      }),
    ).toBe(true);
    expect(
      await getUserNotificationById(created!.notificationId, USER_A),
    ).toBeNull();
    expect(await listUserNotifications(USER_A)).toHaveLength(0);
  });

  it("25: per-user retention does not evict other users (global 500 abolished)", async () => {
    // Fill user A to cap
    for (let i = 0; i < MAX_NOTIFICATIONS_PER_USER + 10; i += 1) {
      await insertDurableNotification(
        draft(USER_A, {
          notificationId: `ntf_cap_a_${i}`,
          requestId: `cap_a_${i}`,
          createdAt: new Date(Date.now() + i).toISOString(),
        }),
        {
          idempotencyKey: `idem_cap_a_${i}`,
          sourceId: `cap_a_${i}`,
        },
      );
    }
    await insertDurableNotification(
      draft(USER_B, {
        notificationId: "ntf_cap_b_1",
        requestId: "cap_b_1",
      }),
      { idempotencyKey: "idem_cap_b_1", sourceId: "cap_b_1" },
    );
    const a = await listDurableNotifications({
      ownerId: USER_A,
      limit: MAX_NOTIFICATIONS_PER_USER,
    });
    const b = await listDurableNotifications({ ownerId: USER_B });
    expect(a.length).toBeLessThanOrEqual(MAX_NOTIFICATIONS_PER_USER);
    expect(b).toHaveLength(1);
    expect(b[0]?.userId).toBe(USER_B);
  });

  it("admin-without-owner-guard: cross-user get by notificationId alone is impossible", async () => {
    const created = await createUserNotification(
      {
        audience: "user",
        userId: USER_A,
        type: "completed",
        title: "admin",
        message: "x",
        requestId: "req_admin",
      },
      { skipDelivery: true },
    );
    // API surface requires ownerId — missing owner returns null/empty
    expect(
      await markDurableNotificationRead({
        notificationId: created!.notificationId,
        ownerId: "",
      }),
    ).toBeNull();
  });
});

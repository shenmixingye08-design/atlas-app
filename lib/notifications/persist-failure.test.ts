import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistDomain = vi.fn();

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: (...args: unknown[]) => persistDomain(...args),
  loadDurableDomain: vi.fn(async () => null),
}));

import {
  NotificationPersistenceFailedError,
  persistNotificationsNow,
} from "./durable";
import {
  insertDurableNotification,
  resetDurableInboxForTests,
} from "./durable-inbox";
import { ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL } from "./migration-sql";
import { classifyNotificationPersistError } from "./persist-log";
import type { NotificationRecord } from "./types";

function draft(ownerId: string): NotificationRecord {
  return {
    notificationId: `ntf_${ownerId}_1`,
    userId: ownerId,
    audience: "user",
    type: "completed",
    title: "完了",
    message: "本文",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: null,
    requestId: "req_1",
    deliverableId: null,
    workflowRunId: null,
    readAt: null,
  };
}

describe("notification persistence failure behavior", () => {
  beforeEach(() => {
    persistDomain.mockReset();
    resetDurableInboxForTests();
    vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetDurableInboxForTests();
  });

  it("inserts a valid notification into the durable inbox", async () => {
    const result = await insertDurableNotification(draft("user_p04_a"), {
      idempotencyKey: "idem_1",
      sourceId: "req_1",
    });
    expect(result.created).toBe(true);
    expect(result.record.notificationId).toBe("ntf_user_p04_a_1");
  });

  it("treats duplicate idempotency as upsert reuse, not loss", async () => {
    const first = await insertDurableNotification(draft("user_p04_a"), {
      idempotencyKey: "idem_dup",
      sourceId: "req_1",
    });
    const second = await insertDurableNotification(
      { ...draft("user_p04_a"), notificationId: "ntf_other" },
      { idempotencyKey: "idem_dup", sourceId: "req_1" },
    );
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.notificationId).toBe(first.record.notificationId);
  });

  it("allows missing optional values", async () => {
    const result = await insertDurableNotification(draft("user_p04_a"), {
      idempotencyKey: "idem_opt",
    });
    expect(result.created).toBe(true);
    expect(result.record.relatedTaskId).toBeNull();
  });

  it("does not treat blob persist skip as success", async () => {
    persistDomain.mockResolvedValue("skipped");
    await expect(persistNotificationsNow("user_2abcRealClerkId")).rejects.toBeInstanceOf(
      NotificationPersistenceFailedError,
    );
  });

  it("succeeds blob persist when Supabase writes", async () => {
    persistDomain.mockResolvedValue("supabase");
    await expect(persistNotificationsNow("user_2abcRealClerkId")).resolves.toBeUndefined();
  });

  it("classifies schema-cache and permission errors", () => {
    expect(
      classifyNotificationPersistError(
        "Could not find the table 'public.atlas_user_notifications' in the schema cache",
      ),
    ).toBe("schema_cache_missing");
    expect(classifyNotificationPersistError("42501 permission denied")).toBe(
      "permission_denied",
    );
  });

  it("keeps inbox RLS deny-all for anon/authenticated; service_role only", () => {
    expect(ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL).toMatch(
      /atlas_user_notifications_deny_anon/,
    );
    expect(ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL).toMatch(
      /for all to anon, authenticated/,
    );
    expect(ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL).toMatch(
      /using \(false\) with check \(false\)/,
    );
    expect(ATLAS_NOTIFICATION_RETRY_DLQ_MIGRATION_SQL).toMatch(
      /grant all on public\.atlas_user_notifications to service_role/,
    );
  });
});

describe("notification persistence when Supabase is unavailable", () => {
  beforeEach(() => {
    resetDurableInboxForTests();
    vi.stubEnv("ATLAS_NOTIFICATION_STORAGE", "supabase");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetDurableInboxForTests();
  });

  it("fail-closes inbox insert instead of succeeding in memory", async () => {
    await expect(
      insertDurableNotification(draft("user_2abcRealClerkId"), {
        idempotencyKey: "idem_prod",
        sourceId: "req_prod",
      }),
    ).rejects.toThrow(/P0-4|service role|durable insert|memory fallback disabled/);
  });
});

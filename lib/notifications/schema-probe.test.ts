import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  getMigrationEnvPresence: vi.fn(() => ({
    serviceRole: true,
    postgresUrl: true,
    supabaseAccessToken: false,
    projectRef: "test",
    postgresEnvKeys: ["POSTGRES_URL"],
  })),
  applyMigrationSql: vi.fn(async () => ({
    appliedViaPostgres: true,
    appliedViaManagementApi: false,
    error: null,
    envPresence: {
      serviceRole: true,
      postgresUrl: true,
      supabaseAccessToken: false,
      projectRef: "test",
      postgresEnvKeys: ["POSTGRES_URL"],
    },
  })),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(),
}));

vi.mock("@/lib/health/version-info", () => ({
  getHealthVersionPayload: () => ({
    commitShaShort: "testsha",
    environment: "test",
    commitSha: "testsha",
    buildTime: null,
    appVersion: "0.0.0",
  }),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(() =>
      [
        'import { processDurableNotificationRetries } from "@/lib/notifications/retry-drain";',
        "const notificationRetries = await processDurableNotificationRetries();",
      ].join("\n"),
    ),
  };
});

import { applyMigrationSql } from "@/lib/supabase/apply-migration-sql";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { probeNotificationRetrySchema } from "./schema-probe";

function mockClient(opts: {
  inboxError?: { message: string } | null;
  dlqError?: { message: string } | null;
  afterApply?: boolean;
}) {
  let calls = 0;
  const from = vi.fn((table: string) => {
    calls += 1;
    const isInbox = table === "atlas_user_notifications";
    const useApplied = opts.afterApply && calls > 2;
    const error = useApplied
      ? null
      : isInbox
        ? (opts.inboxError ?? null)
        : (opts.dlqError ?? null);
    return {
      select: () => ({
        limit: async () => ({ data: [], error }),
      }),
    };
  });
  return { from };
}

describe("probeNotificationRetrySchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok when inbox + dlq present and tick wired", async () => {
    vi.mocked(createServiceRoleClientIfConfigured).mockReturnValue(
      mockClient({}) as never,
    );
    const result = await probeNotificationRetrySchema();
    expect(result.ok).toBe(true);
    expect(result.inboxTableOk).toBe(true);
    expect(result.dlqTableOk).toBe(true);
    expect(result.tickWired).toBe(true);
    expect(result.retryDrainReady).toBe(true);
    expect(result.memoryNotSot).toBe(true);
    expect(applyMigrationSql).not.toHaveBeenCalled();
  });

  it("auto-applies migration when tables are missing", async () => {
    vi.mocked(createServiceRoleClientIfConfigured).mockReturnValue(
      mockClient({
        inboxError: {
          message:
            "Could not find the table 'public.atlas_user_notifications' in the schema cache",
        },
        dlqError: {
          message:
            "Could not find the table 'public.atlas_notification_dlq' in the schema cache",
        },
        afterApply: true,
      }) as never,
    );
    const result = await probeNotificationRetrySchema();
    expect(applyMigrationSql).toHaveBeenCalled();
    expect(result.appliedViaPostgres).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.inboxTableOk).toBe(true);
    expect(result.dlqTableOk).toBe(true);
  });

  it("applies when apply=1 is requested", async () => {
    vi.mocked(createServiceRoleClientIfConfigured).mockReturnValue(
      mockClient({}) as never,
    );
    const result = await probeNotificationRetrySchema({ apply: true });
    expect(applyMigrationSql).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

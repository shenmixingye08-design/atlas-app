import { describe, expect, it, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  getMigrationEnvPresence: () => ({
    serviceRole: true,
    postgresUrl: false,
    supabaseAccessToken: false,
    projectRef: "testref",
    postgresEnvKeys: [],
  }),
  applyMigrationSql: vi.fn(async () => ({
    appliedViaPostgres: false,
    appliedViaManagementApi: false,
    error: "no_postgres_url_or_management_token",
    envPresence: {
      serviceRole: true,
      postgresUrl: false,
      supabaseAccessToken: false,
      projectRef: "testref",
      postgresEnvKeys: [],
    },
  })),
}));

vi.mock("@/lib/health/version-info", () => ({
  getHealthVersionPayload: () => ({
    ok: true,
    environment: "test",
    commitSha: "abc",
    commitShaShort: "abc",
    buildTime: null,
    appVersion: "0.0.0",
    vercelUrl: null,
  }),
}));

describe("billing schema probe", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("reports missing atlas_billing_subscriptions from schema cache error", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: {
              message:
                "Could not find the table 'public.atlas_billing_subscriptions' in the schema cache",
            },
          }),
        }),
        limit: async () => ({
          data: null,
          error: {
            message:
              "Could not find the table 'public.atlas_billing_subscriptions' in the schema cache",
          },
        }),
      }),
      upsert: async () => ({ error: null }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    });

    const { probeBillingSubscriptionsSchema } = await import("./schema-probe");
    const result = await probeBillingSubscriptionsSchema({ apply: true });
    expect(result.ok).toBe(false);
    expect(result.subscriptionsTableExists).toBe(false);
    expect(result.usingDurableFallback).toBe(true);
    expect(result.error).toMatch(/atlas_billing_subscriptions|schema cache|no_postgres/i);
  });
});

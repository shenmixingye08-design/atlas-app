import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const applyMigrationSql = vi.fn();
const createServiceRoleClientIfConfigured = vi.fn();

vi.mock("@/lib/supabase/apply-migration-sql", () => ({
  applyMigrationSql: (...args: unknown[]) => applyMigrationSql(...args),
  getMigrationEnvPresence: () => ({
    serviceRole: true,
    postgresUrl: true,
    supabaseAccessToken: false,
    projectRef: null,
    postgresEnvKeys: ["DATABASE_URL"],
  }),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () =>
    createServiceRoleClientIfConfigured(),
}));

import {
  isMissingUsageIncrementRpc,
  probeBillingUsageIncrementRpc,
  resetUsageIncrementRpcEnsureForTests,
} from "./increment-rpc-probe";

describe("billing usage increment RPC probe", () => {
  beforeEach(() => {
    resetUsageIncrementRpcEnsureForTests();
    applyMigrationSql.mockReset();
    createServiceRoleClientIfConfigured.mockReset();
  });

  it("is ready when the empty-user increment call is accepted as user_id required", async () => {
    createServiceRoleClientIfConfigured.mockReturnValue({
      from() {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
        return builder;
      },
      async rpc(name: string) {
        if (name === "atlas_probe_usage_increment_rpc") {
          return {
            data: {
              ok: true,
              expectedArgNames: [
                "p_user_id",
                "p_month_key",
                "p_claim_key",
                "p_meter",
                "p_amount",
              ],
            },
            error: null,
          };
        }
        return { data: null, error: { message: "user_id required" } };
      },
    });
    const result = await probeBillingUsageIncrementRpc();
    expect(result.ok).toBe(true);
    expect(result.rpcReady).toBe(true);
    expect(result.signatureMatches).toBe(true);
  });

  it("reports missing RPC on the Production PGRST202 signature", async () => {
    createServiceRoleClientIfConfigured.mockReturnValue({
      from() {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
        };
        return builder;
      },
      async rpc() {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message:
              "Could not find the function public.atlas_increment_usage_counter_once(p_amount, p_claim_key, p_meter, p_month_key, p_user_id) in the schema cache",
          },
        };
      },
    });
    const result = await probeBillingUsageIncrementRpc();
    expect(result.ok).toBe(false);
    expect(result.rpcReady).toBe(false);
    expect(
      isMissingUsageIncrementRpc({
        code: "PGRST202",
        message:
          "Could not find the function public.atlas_increment_usage_counter_once(p_amount, p_claim_key, p_meter, p_month_key, p_user_id) in the schema cache",
      }),
    ).toBe(true);
  });
});

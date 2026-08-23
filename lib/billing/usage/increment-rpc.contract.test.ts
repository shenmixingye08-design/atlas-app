import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ATLAS_BILLING_USAGE_INCREMENT_RPC_SQL,
  ATLAS_INCREMENT_USAGE_RPC_ARG_NAMES,
  ATLAS_INCREMENT_USAGE_RPC_MIGRATION_FILE,
  ATLAS_INCREMENT_USAGE_RPC_NAME,
  buildIncrementUsageRpcArgs,
} from "./increment-once-sql";
import { classifyUsageIncrementFailure, isMissingUsageIncrementRpc } from "./increment-rpc-probe";

describe("billing usage increment RPC contract", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations", ATLAS_INCREMENT_USAGE_RPC_MIGRATION_FILE),
    "utf8",
  );

  it("keeps the TS apply bundle identical to the migration file", () => {
    expect(ATLAS_BILLING_USAGE_INCREMENT_RPC_SQL).toBe(sql);
  });

  it("declares the exact PostgREST named signature the app calls", () => {
    expect(sql).toContain(
      `create or replace function public.${ATLAS_INCREMENT_USAGE_RPC_NAME}(`,
    );
    expect(sql).toContain("p_user_id text");
    expect(sql).toContain("p_month_key text");
    expect(sql).toContain("p_claim_key text");
    expect(sql).toContain("p_meter text");
    expect(sql).toContain("p_amount integer default 1");
    expect(sql).toContain("returns jsonb");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain(
      "grant execute on function public.atlas_increment_usage_counter_once(text, text, text, text, integer)",
    );
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql).toContain("atlas_probe_usage_increment_rpc");
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
  });

  it("builds the exact RPC payload keys PostgREST reported in PGRST202", () => {
    const args = buildIncrementUsageRpcArgs({
      userId: "user_1",
      monthKey: "2026-08",
      claimKey: "x:2090824341797654951",
      meter: "sns_posts",
      amount: 1,
    });
    expect(Object.keys(args)).toEqual([...ATLAS_INCREMENT_USAGE_RPC_ARG_NAMES]);
    expect(Object.keys(args).sort()).toEqual(
      ["p_amount", "p_claim_key", "p_meter", "p_month_key", "p_user_id"],
    );
    const src = readFileSync(
      join(process.cwd(), "lib/billing/usage/durable-counters.ts"),
      "utf8",
    );
    expect(src).toContain("buildIncrementUsageRpcArgs");
    expect(src).toContain("ATLAS_INCREMENT_USAGE_RPC_NAME");
  });

  it("classifies the Production PGRST202 as a missing RPC, not a silent 0", () => {
    expect(
      isMissingUsageIncrementRpc({
        code: "PGRST202",
        message:
          "Could not find the function public.atlas_increment_usage_counter_once(p_amount, p_claim_key, p_meter, p_month_key, p_user_id) in the schema cache",
      }),
    ).toBe(true);
    expect(
      classifyUsageIncrementFailure({
        code: "PGRST202",
        message:
          "Could not find the function public.atlas_increment_usage_counter_once(p_amount, p_claim_key, p_meter, p_month_key, p_user_id) in the schema cache",
      }),
    ).toBe("usage_rpc_missing");
  });
});

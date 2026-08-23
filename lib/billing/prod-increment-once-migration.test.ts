import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("20260823 billing usage increment-once migration", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260823_billing_usage_increment_once.sql",
    ),
    "utf8",
  );

  it("is additive and does not reset counters", () => {
    expect(sql).toContain("atlas_increment_usage_counter_once");
    expect(sql).toContain("atlas_sync_ai_runs_from_claims");
    expect(sql).toContain("create or replace function");
    expect(sql).toContain("unique_violation");
    expect(sql).toMatch(/insert into public\.atlas_billing_usage_counters[\s\S]*for update/);
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bai_runs\s*=\s*0\b/);
    expect(sql).not.toMatch(/\bsns_posts\s*=\s*0\b/);
  });
});

describe("20260824 billing usage increment RPC PGRST repair", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260824_billing_usage_increment_rpc_pgrst.sql",
    ),
    "utf8",
  );

  it("redeclares the app signature and reloads PostgREST without resetting usage", () => {
    expect(sql).toContain("atlas_increment_usage_counter_once");
    expect(sql).toContain("p_user_id text");
    expect(sql).toContain("p_month_key text");
    expect(sql).toContain("p_claim_key text");
    expect(sql).toContain("p_meter text");
    expect(sql).toContain("p_amount integer default 1");
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql).toContain("atlas_probe_usage_increment_rpc");
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bai_runs\s*=\s*0\b/);
  });
});

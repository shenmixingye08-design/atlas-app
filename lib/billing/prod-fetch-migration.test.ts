import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("20260821 production fetch schema ensure", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260821_prod_fetch_schema_ensure.sql",
    ),
    "utf8",
  );

  it("is additive and idempotent", () => {
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).toMatch(/create table if not exists/i);
    expect(statements).toMatch(/add column if not exists/i);
    expect(statements).toMatch(/create index if not exists/i);
    expect(statements).toMatch(/create or replace function/i);
    expect(statements).not.toMatch(/\bdrop table\b/i);
    expect(statements).not.toMatch(/\btruncate\b/i);
    expect(statements).not.toMatch(/\bdrop function\b/i);
  });

  it("ensures billing + automation relations the two APIs need", () => {
    expect(sql).toContain("atlas_billing_usage_counters");
    expect(sql).toContain("atlas_billing_usage_claims");
    expect(sql).toContain("atlas_billing_automation_slots");
    expect(sql).toContain("atlas_reserve_ai_run");
    expect(sql).toContain("atlas_automation_definitions");
    expect(sql).toContain("atlas_automation_executions");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("service_role");
  });
});

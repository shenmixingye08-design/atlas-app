import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL } from "./production-schema-migration-sql";

describe("production automation schema ensure SQL", () => {
  it("matches the checked-in idempotent migration", () => {
    const fromDisk = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260822_prod_automation_schema_ensure.sql",
      ),
      "utf8",
    );
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toBe(fromDisk);
  });

  it("is additive and covers the Production-missing objects", () => {
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/create table if not exists public\.atlas_deliverable_files/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/create table if not exists public\.atlas_automation_jobs/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/create table if not exists public\.atlas_x_autopost_settings/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/create or replace function public\.atlas_claim_x_post_jobs/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/notify pgrst, 'reload schema'/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).not.toMatch(
      /^\s*drop table\b/im,
    );
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/grant all on public\.atlas_deliverable_files to service_role/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(/grant all on public\.atlas_automation_jobs to service_role/);
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(
      /grant execute on function public\.atlas_claim_x_post_jobs/,
    );
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(
      /atlas_deliverable_files_storage_status_check/,
    );
    expect(ATLAS_PRODUCTION_SCHEMA_ENSURE_SQL).toMatch(
      /atlas_deliverable_files_size_nonneg/,
    );
  });
});

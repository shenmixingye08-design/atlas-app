import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
  type DurableSotPool,
} from "./db";
import {
  applyDurableSotMigrationDown,
  applyDurableSotMigrationUp,
  listDurableSotTables,
  loadDurableSotJobsMigrationDownSql,
  loadDurableSotJobsMigrationUpSql,
  loadDurableSotLeaseMigrationDownSql,
  loadDurableSotLeaseMigrationUpSql,
  loadDurableSotMigrationDownSql,
  loadDurableSotMigrationUpSql,
} from "./migration";
import {
  DURABLE_QUEUE_STATUSES,
  DURABLE_SOT_FOUNDATION_TABLES,
  DURABLE_SOT_REQUIRED_INDEX_FRAGMENTS,
  DURABLE_SOT_TABLES,
  DURABLE_SOT_UNIQUE_CONSTRAINTS,
} from "./schema";

const dbUrl =
  process.env.DURABLE_SOT_MIGRATION_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_TEST_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

const foundationTables = [...DURABLE_SOT_FOUNDATION_TABLES];

describe("Durable SoT migration SQL (always)", () => {
  it("foundation up migration declares Phase 1-2 entity tables", () => {
    const sql = loadDurableSotMigrationUpSql();
    for (const table of foundationTables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
  });

  it("jobs up migration declares Phase 1-3 jobs/queue table", () => {
    const sql = loadDurableSotJobsMigrationUpSql();
    expect(sql).toContain(
      `create table if not exists public.${DURABLE_SOT_TABLES.jobs}`,
    );
    for (const status of DURABLE_QUEUE_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain("unique (idempotency_key)");
    expect(sql).toContain("unique (run_id)");
    expect(sql).toContain("unique (automation_id, occurrence_key)");
  });

  it("up migrations declare required indexes", () => {
    const sql =
      loadDurableSotMigrationUpSql() +
      loadDurableSotJobsMigrationUpSql() +
      loadDurableSotLeaseMigrationUpSql();
    for (const idx of DURABLE_SOT_REQUIRED_INDEX_FRAGMENTS) {
      expect(sql, idx).toContain(idx);
    }
  });

  it("lease migration declares fencing + recovery ledger", () => {
    const sql = loadDurableSotLeaseMigrationUpSql();
    expect(sql).toContain("lease_token");
    expect(sql).toContain("lease_version");
    expect(sql).toContain("atlas_durable_job_recoveries");
    expect(sql).toContain("'detected'");
    expect(sql).toContain("'manual_review'");
    const down = loadDurableSotLeaseMigrationDownSql();
    expect(down).toContain("atlas_durable_job_recoveries");
  });

  it("up migration includes unique / PK constraints for duplicates", () => {
    const sql = loadDurableSotMigrationUpSql();
    expect(sql).toContain("unique (automation_id, occurrence_key)");
    expect(sql).toContain(
      "unique (run_id, evidence_kind, evidence_fingerprint)",
    );
    expect(sql).toContain("primary key (scope, idempotency_key)");
    expect(sql).toContain(
      "run_id uuid primary key references public.atlas_durable_runs",
    );
    expect(sql).toMatch(/Retention|TTL|expires_at/);
  });

  it("up migration wraps work in a transaction", () => {
    const sql = loadDurableSotMigrationUpSql();
    expect(sql.trim().startsWith("begin;") || sql.includes("\nbegin;")).toBe(
      true,
    );
    expect(sql).toContain("commit;");
    const jobsSql = loadDurableSotJobsMigrationUpSql();
    expect(jobsSql).toContain("begin;");
    expect(jobsSql).toContain("commit;");
  });

  it("down migrations drop all durable tables", () => {
    const foundationDown = loadDurableSotMigrationDownSql();
    const jobsDown = loadDurableSotJobsMigrationDownSql();
    const leaseDown = loadDurableSotLeaseMigrationDownSql();
    expect(foundationDown).toContain("begin;");
    expect(jobsDown).toContain("begin;");
    expect(jobsDown).toContain(`drop table if exists public.${DURABLE_SOT_TABLES.jobs}`);
    expect(leaseDown).toContain(
      `drop table if exists public.${DURABLE_SOT_TABLES.jobRecoveries}`,
    );
    for (const table of foundationTables) {
      expect(foundationDown).toContain(`drop table if exists public.${table}`);
    }
  });

  it("documents unique constraint catalog", () => {
    expect(DURABLE_SOT_UNIQUE_CONSTRAINTS.length).toBeGreaterThanOrEqual(5);
  });
});

describe.skipIf(!dbUrl)("Durable SoT migration apply/rollback (Postgres)", () => {
  let pool: DurableSotPool;

  beforeAll(async () => {
    pool = createDurableSotPool(dbUrl);
    await applyDurableSotMigrationDown(pool);
  });

  afterAll(async () => {
    await applyDurableSotMigrationDown(pool);
    await pool.end();
  });

  it("applies up and creates all tables including jobs", async () => {
    await applyDurableSotMigrationUp(pool);
    const tables = await listDurableSotTables(pool);
    expect(tables.sort()).toEqual(Object.values(DURABLE_SOT_TABLES).sort());
  });

  it("rollback down removes all tables", async () => {
    await applyDurableSotMigrationUp(pool);
    await applyDurableSotMigrationDown(pool);
    const tables = await listDurableSotTables(pool);
    expect(tables).toEqual([]);
  });

  it("up is idempotent enough to re-apply after down", async () => {
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
    const tables = await listDurableSotTables(pool);
    expect(tables).toHaveLength(Object.keys(DURABLE_SOT_TABLES).length);
  });
});

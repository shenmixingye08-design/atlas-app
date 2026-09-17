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
  loadDurableSotMigrationDownSql,
  loadDurableSotMigrationUpSql,
} from "./migration";
import {
  DURABLE_SOT_REQUIRED_INDEX_FRAGMENTS,
  DURABLE_SOT_TABLES,
  DURABLE_SOT_UNIQUE_CONSTRAINTS,
} from "./schema";

const dbUrl =
  process.env.DURABLE_SOT_MIGRATION_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_TEST_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

describe("Durable SoT migration SQL (always)", () => {
  it("up migration declares all entity tables", () => {
    const sql = loadDurableSotMigrationUpSql();
    for (const table of Object.values(DURABLE_SOT_TABLES)) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
  });

  it("up migration declares required indexes", () => {
    const sql = loadDurableSotMigrationUpSql();
    for (const idx of DURABLE_SOT_REQUIRED_INDEX_FRAGMENTS) {
      expect(sql, idx).toContain(idx);
    }
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
  });

  it("down migration drops all durable tables", () => {
    const sql = loadDurableSotMigrationDownSql();
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    for (const table of Object.values(DURABLE_SOT_TABLES)) {
      expect(sql).toContain(`drop table if exists public.${table}`);
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

  it("applies up and creates all tables", async () => {
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

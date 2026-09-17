import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DurableSotPool } from "./db";
import {
  DURABLE_SOT_MIGRATION_DOWN,
  DURABLE_SOT_MIGRATION_UP,
  DURABLE_SOT_TABLES,
} from "./schema";

export function loadDurableSotMigrationUpSql(
  root: string = process.cwd(),
): string {
  return readFileSync(join(root, DURABLE_SOT_MIGRATION_UP), "utf8");
}

export function loadDurableSotMigrationDownSql(
  root: string = process.cwd(),
): string {
  return readFileSync(join(root, DURABLE_SOT_MIGRATION_DOWN), "utf8");
}

export async function applyDurableSotMigrationUp(
  pool: DurableSotPool,
  root?: string,
): Promise<void> {
  const sql = loadDurableSotMigrationUpSql(root);
  await pool.query(sql);
}

export async function applyDurableSotMigrationDown(
  pool: DurableSotPool,
  root?: string,
): Promise<void> {
  const sql = loadDurableSotMigrationDownSql(root);
  await pool.query(sql);
}

export async function listDurableSotTables(
  pool: DurableSotPool,
): Promise<string[]> {
  const expected = Object.values(DURABLE_SOT_TABLES);
  const res = await pool.query<{ tablename: string }>(
    `select tablename
     from pg_tables
     where schemaname = 'public'
       and tablename = any($1::text[])
     order by tablename`,
    [expected],
  );
  return res.rows.map((r) => r.tablename);
}

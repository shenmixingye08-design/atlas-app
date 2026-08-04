#!/usr/bin/env node
/**
 * Apply / probe atlas_reliability_events migrations.
 *
 * Usage:
 *   node scripts/apply-reliability-events-migration.mjs
 *
 * Prefers POSTGRES_URL / POSTGRES_URL_NON_POOLING / SUPABASE_DB_URL / DATABASE_URL
 * for DDL. Falls back to printing SQL when only the service role is available.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const files = [
  "20260726_atlas_reliability_events.sql",
  "20260730_atlas_reliability_events_diagnostics.sql",
];

const sql = files
  .map((file) =>
    readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"),
  )
  .join("\n\n");

const connectionString =
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

if (connectionString) {
  const pg = await import("pg");
  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied reliability events SQL via Postgres URL");
  } finally {
    await client.end();
  }
} else {
  console.log("No POSTGRES_URL/SUPABASE_DB_URL — printing SQL for manual apply:");
  console.log("---");
  console.log(sql);
  console.log("---");
}

const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.warn(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skip insert probe",
  );
  process.exit(connectionString ? 0 : 1);
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const probeJobId = `probe_cli_${Date.now().toString(36)}`;
const { error } = await client.from("atlas_reliability_events").insert({
  metric_key: "work_job",
  outcome: "success",
  job_id: probeJobId,
  diagnostic_id: `diag_${probeJobId}`,
  user_id: "__atlas_reliability_probe__",
  stage: "cli_probe",
  severity: "info",
  message: "cli reliability schema probe",
  error_message: "cli reliability schema probe",
  metadata: { probe: true },
});

if (error) {
  console.error("Insert probe failed:", error.message);
  console.error("Apply SQL in Supabase SQL Editor, then re-run this script.");
  process.exit(1);
}

console.log("Insert probe OK:", probeJobId);
process.exit(0);

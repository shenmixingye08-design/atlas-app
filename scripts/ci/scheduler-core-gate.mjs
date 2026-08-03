#!/usr/bin/env node
/**
 * Architecture Gate — Scheduler Core Unification (Phase 2-2)
 * Fails CI on NEW architectural regressions.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const errors = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

// 1) Formal Scheduler route is exactly one cron path
const vercel = JSON.parse(read("vercel.json"));
assert(Array.isArray(vercel.crons) && vercel.crons.length === 1, "vercel.json must have exactly 1 cron");
assert(
  vercel.crons[0].path === "/api/internal/scheduler/tick",
  `formal cron path must be /api/internal/scheduler/tick, got ${vercel.crons[0]?.path}`,
);

const pro = JSON.parse(read("vercel.cron.pro.json"));
assert(
  pro.crons?.[0]?.path === "/api/internal/scheduler/tick",
  "vercel.cron.pro.json must target formal scheduler path",
);

const minuteYml = read(".github/workflows/minute-scheduler.yml");
assert(
  minuteYml.includes("/api/internal/scheduler/tick"),
  "minute-scheduler.yml must call formal path",
);
assert(
  !minuteYml.includes("/api/automations/tick"),
  "minute-scheduler.yml must not call deprecated automations/tick",
);

// 2) Formal route + health exist
assert(
  existsSync(join(root, "app/api/internal/scheduler/tick/route.ts")),
  "missing formal tick route",
);
assert(
  existsSync(join(root, "app/api/internal/scheduler/health/route.ts")),
  "missing health route",
);

// 3) calculateNextRunAt SoT exists; client must not be the production SoT
const calc = read("lib/scheduler-core/calculate-next-run-at.ts");
assert(calc.includes("export function calculateNextRunAt"), "missing calculateNextRunAt");

const client = read("lib/automations/client.ts");
assert(
  !/calculateNextRunAt|computeNextRunIso\s*\(/.test(client),
  "client.ts must not compute nextRunAt",
);

// 4) Production secret primary name documented in auth
const auth = read("lib/scheduler-core/auth.ts");
assert(auth.includes("SCHEDULER_CRON_SECRET"), "auth must use SCHEDULER_CRON_SECRET");
assert(auth.includes("timingSafeEqual"), "auth must be timing-safe");

// 5) Occurrence unique constraint migration present
const wqMig = read("supabase/migrations/20260802_atlas_work_queue.sql");
assert(
  wqMig.includes("unique (automation_id, occurrence_key)"),
  "work-queue occurrence unique constraint required",
);
const coreMig = read("supabase/migrations/20260803_atlas_scheduler_core.sql");
assert(coreMig.includes("atlas_scheduler_outbox"), "outbox table required");
assert(coreMig.includes("atlas_scheduler_ticks"), "scheduler history table required");
assert(
  coreMig.includes("atlas_scheduler_schedules_due_idx"),
  "due schedules index required",
);

// 6) Deprecated route must not be an independent cron executor in production
const deprecated = read("app/api/automations/tick/route.ts");
assert(deprecated.includes("410"), "deprecated tick must 410 for prod cron secret");
assert(deprecated.includes("@deprecated") || deprecated.includes("deprecated"), "mark deprecated");

// 7) Preview gate
const env = read("lib/scheduler-core/env.ts");
assert(env.includes("SCHEDULER_ALLOW_PREVIEW_TICK"), "preview separation required");

// 8) No process-memory SoT claim in durable index
const durable = read("lib/scheduler-core/durable/index.ts");
assert(
  durable.includes("no memory fallback") || durable.includes("memory"),
  "durable store must document no memory fallback",
);

if (errors.length) {
  console.error("scheduler-core-gate FAIL:");
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log("scheduler-core-gate PASS");

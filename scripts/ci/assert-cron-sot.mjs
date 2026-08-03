#!/usr/bin/env node
/**
 * CI: Cron SoT must match vercel.json + GitHub Actions minute scheduler.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}

const sotPath = join(ROOT, "lib/work-queue/cron-sot.ts");
const sot = readFileSync(sotPath, "utf8");
if (!sot.includes('schedule: "* * * * *"')) {
  fail("cron-sot must declare minute tick * * * * *");
}
if (!sot.includes('schedule: "0 0 * * *"')) {
  fail("cron-sot must declare daily hobby tick 0 0 * * *");
}
if (!sot.includes("minutely") || !sot.includes("hourly")) {
  fail("cron-sot must include minutely/hourly product presets");
}

const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const hobby = vercel.crons?.[0];
if (!hobby || hobby.schedule !== "0 0 * * *" || hobby.path !== "/api/automations/tick") {
  fail("vercel.json hobby cron must be 0 0 * * * → /api/automations/tick (SoT)");
}

const pro = JSON.parse(readFileSync(join(ROOT, "vercel.cron.pro.json"), "utf8"));
if (pro.crons?.[0]?.schedule !== "* * * * *") {
  fail("vercel.cron.pro.json must be * * * * * for Pro minute SoT");
}

const actions = readFileSync(
  join(ROOT, ".github/workflows/minute-scheduler.yml"),
  "utf8",
);
if (!actions.includes('cron: "* * * * *"')) {
  fail("minute-scheduler.yml must use cron: \"* * * * *\"");
}
if (!actions.includes("/api/automations/tick")) {
  fail("minute-scheduler.yml must call /api/automations/tick");
}

const migration = readFileSync(
  join(ROOT, "supabase/migrations/20260804_atlas_scheduler_registry.sql"),
  "utf8",
);
for (const col of [
  "next_run",
  "last_run",
  "last_success",
  "last_failure",
  "retry_count",
  "execution_time",
  "duration_ms",
  "status",
]) {
  if (!migration.includes(col)) {
    fail(`scheduler registry migration missing column ${col}`);
  }
}

if (failed > 0) {
  console.error(`assert-cron-sot: ${failed} violation(s)`);
  process.exit(1);
}
console.log("assert-cron-sot CI gate PASS");

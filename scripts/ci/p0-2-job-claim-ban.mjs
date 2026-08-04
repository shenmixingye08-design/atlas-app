#!/usr/bin/env node
/**
 * CI gate (P0-2): Production job-claim paths must not silently fall back to
 * process memory / Map / file stores.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const storeIndex = read("lib/work-queue/store/index.ts");
if (
  !/isAtlasProduction/.test(storeIndex) ||
  !/WorkQueueStoreUnavailableError/.test(storeIndex)
) {
  violations.push(
    "lib/work-queue/store/index.ts: Production fail-closed WorkQueueStoreUnavailableError missing",
  );
}
if (storeIndex.includes("isAtlasProduction()")) {
  const prodBlock = storeIndex.split("if (isAtlasProduction())")[1] ?? "";
  const beforeElse = prodBlock.split("\n  }")[0] ?? "";
  if (beforeElse.includes("createFileWorkQueueStore")) {
    violations.push(
      "lib/work-queue/store/index.ts: Production branch must not call createFileWorkQueueStore",
    );
  }
}

const postgres = read("lib/work-queue/store/postgres-store.ts");
if (!/for update skip locked/i.test(postgres) && !/atlas_claim_work_queue_jobs/.test(postgres)) {
  violations.push(
    "lib/work-queue/store/postgres-store.ts: atomic claim (SKIP LOCKED / RPC) missing",
  );
}
if (!/allowedFromStatuses|WORK_JOB_TRANSITIONS/.test(postgres)) {
  violations.push(
    "lib/work-queue/store/postgres-store.ts: status FSM guard on updateJob missing",
  );
}
if (!/reclaimStuckJob/.test(postgres)) {
  violations.push(
    "lib/work-queue/store/postgres-store.ts: reclaimStuckJob missing",
  );
}

const worker = read("lib/work-queue/worker.ts");
if (/reclaimStuckJob[\s\S]{0,80}else\s*\{[\s\S]{0,40}updateJob/.test(worker)) {
  violations.push(
    "lib/work-queue/worker.ts: non-atomic stuck updateJob fallback must be removed",
  );
}
if (!/reclaimStuckJob/.test(worker)) {
  violations.push("lib/work-queue/worker.ts: must use reclaimStuckJob");
}

const jobStore = read("lib/jobs/job-store.ts");
if (!/AutomationJobClaimUnavailableError/.test(jobStore)) {
  violations.push(
    "lib/jobs/job-store.ts: Production Map-claim refusal missing",
  );
}
if (!/assertDurableJobClientOrThrow/.test(jobStore)) {
  violations.push(
    "lib/jobs/job-store.ts: assertDurableJobClientOrThrow missing on claim path",
  );
}
if (/using memory fallback/.test(jobStore)) {
  violations.push(
    "lib/jobs/job-store.ts: memory fallback log/path after durable claim must not exist",
  );
}

const word = read("lib/deliverables/word-job-stages.ts");
if (!/WordJobClaimUnavailableError/.test(word)) {
  violations.push(
    "lib/deliverables/word-job-stages.ts: Production Map-only claim refusal missing",
  );
}
if (!/isAtlasProduction\(\) && !createServiceRoleClientIfConfigured\(\)/.test(word)) {
  violations.push(
    "lib/deliverables/word-job-stages.ts: Production claimWordJob gate missing",
  );
}

const workJobsRun = read("lib/work-jobs/run.ts");
if (!/work_job_claim_unavailable|Map-only work-job claim/.test(workJobsRun)) {
  violations.push(
    "lib/work-jobs/run.ts: Production Map-only work-job claim refusal missing",
  );
}

const migration = read(
  "supabase/migrations/20260804_p0_2_durable_job_claim.sql",
);
for (const needle of [
  "atlas_claim_work_queue_jobs",
  "for update skip locked",
  "atlas_reclaim_stuck_work_queue_job",
]) {
  if (!migration.toLowerCase().includes(needle)) {
    violations.push(
      `supabase/migrations/20260804_p0_2_durable_job_claim.sql: missing ${needle}`,
    );
  }
}

if (violations.length) {
  console.error("P0-2 job-claim CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-2 job-claim CI ban OK");

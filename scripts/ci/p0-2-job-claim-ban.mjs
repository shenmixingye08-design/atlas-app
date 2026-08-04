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
if (
  /isAtlasProduction\(\)[\s\S]{0,400}createFileWorkQueueStore\(\)/.test(
    storeIndex.replace(/\s+/g, " "),
  )
) {
  // Production branch must throw before createFileWorkQueueStore.
  const prodBlock = storeIndex.split("if (isAtlasProduction())")[1] ?? "";
  const beforeElse = prodBlock.split("\n  }")[0] ?? "";
  if (beforeElse.includes("createFileWorkQueueStore")) {
    violations.push(
      "lib/work-queue/store/index.ts: Production branch must not call createFileWorkQueueStore",
    );
  }
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

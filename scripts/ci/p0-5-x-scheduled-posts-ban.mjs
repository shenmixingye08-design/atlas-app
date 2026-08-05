#!/usr/bin/env node
/**
 * CI gate (P0-5): Production X drafts/schedules must not use Map/array SoT,
 * stub success, or claim-without-DB.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const backend = read("lib/integrations/x/post/x-post-backend.ts");
if (!/memory_durable schedule\/draft store is forbidden in Production/.test(backend)) {
  violations.push(
    "x-post-backend.ts: Production must forbid memory_durable",
  );
}
if (!/Map fallback disabled/.test(backend)) {
  violations.push("x-post-backend.ts: Map fallback disabled message missing");
}

const schedule = read("lib/integrations/x/post/schedule-store.ts");
if (/__atlasXScheduledPostsStore/.test(schedule)) {
  violations.push(
    "schedule-store.ts: module-level __atlasXScheduledPostsStore must be removed",
  );
}
if (!/claimDueXPostJobs|claimDueScheduledXPosts/.test(schedule)) {
  violations.push("schedule-store.ts: durable claim façade missing");
}

const drafts = read("lib/integrations/x/post/draft-store.ts");
if (/__atlasXDraftPostStore/.test(drafts)) {
  violations.push(
    "draft-store.ts: module-level __atlasXDraftPostStore must be removed",
  );
}
if (!/upsertDurableXDraft|listDurableXDrafts/.test(drafts)) {
  violations.push("draft-store.ts: durable draft façade missing");
}

const jobs = read("lib/integrations/x/post/durable-x-post-jobs.ts");
if (!/XPostStoreUnavailableError/.test(jobs)) {
  violations.push("durable-x-post-jobs.ts: fail-closed error missing");
}
if (!/memory fallback disabled/.test(jobs)) {
  violations.push("durable-x-post-jobs.ts: memory fallback disabled missing");
}
if (!/providerPostId required for posted/.test(jobs)) {
  violations.push("durable-x-post-jobs.ts: providerPostId required for posted");
}
if (!/unknown_outcome/.test(jobs)) {
  violations.push("durable-x-post-jobs.ts: unknown_outcome missing");
}
if (!/atlas_claim_x_post_jobs/.test(jobs)) {
  violations.push("durable-x-post-jobs.ts: claim RPC name missing");
}

const service = read("lib/integrations/x/post/service.ts");
if (!/claimDueScheduledXPosts/.test(service)) {
  violations.push(
    "service.ts: processDue must claim before post (claimDueScheduledXPosts)",
  );
}
if (/listDueXScheduledPosts\(\)/.test(service)) {
  violations.push(
    "service.ts: must not list-due-without-claim (race / double post)",
  );
}
if (!/markXPostUnknownOutcome/.test(service)) {
  violations.push(
    "service.ts: provider-success / DB-fail must enter unknown_outcome",
  );
}

const migration = read(
  "supabase/migrations/20260804_p0_5_durable_x_scheduled_posts.sql",
);
for (const needle of [
  "atlas_x_post_jobs",
  "atlas_x_post_drafts",
  "idempotency_key",
  "provider_post_id",
  "atlas_claim_x_post_jobs",
  "for update skip locked",
  "owner_id",
]) {
  if (!migration.toLowerCase().includes(needle.toLowerCase())) {
    violations.push(
      `migration 20260804_p0_5_durable_x_scheduled_posts.sql: missing ${needle}`,
    );
  }
}

// Production stub success ban in api-client / service
const apiClient = read("lib/integrations/x/post/api-client.ts");
if (/ok:\s*true/.test(apiClient) && /stub|fake success/i.test(apiClient)) {
  violations.push("api-client.ts: stub success pattern forbidden");
}
if (!/did not return a tweet id/.test(apiClient)) {
  violations.push("api-client.ts: tweet id required check missing");
}

if (violations.length) {
  console.error("P0-5 X scheduled posts CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-5 X scheduled posts CI ban OK");

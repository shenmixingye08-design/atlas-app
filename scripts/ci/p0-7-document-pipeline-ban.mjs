#!/usr/bin/env node
/**
 * CI gate (P0-7): Document generation must use unified durable pipeline.
 * Ban completed-without-artifact, format-split paths, fire-and-forget export.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const backend = read("lib/deliverables/document-pipeline-backend.ts");
if (!/memory_durable pipeline store is forbidden in Production/.test(backend)) {
  violations.push(
    "document-pipeline-backend.ts: Production must forbid memory_durable",
  );
}
if (!/Map fallback disabled/.test(backend)) {
  violations.push(
    "document-pipeline-backend.ts: Map fallback disabled message missing",
  );
}

const exportDoc = read("lib/deliverables/server-document-export.ts");
if (!/exportDocumentsOnServer/.test(exportDoc)) {
  violations.push("server-document-export.ts: exportDocumentsOnServer missing");
}
if (!/pipelineHasCompleteArtifacts/.test(exportDoc)) {
  violations.push(
    "server-document-export.ts: must require complete artifacts before success",
  );
}
if (!/hasVerifiedArtifactEvidence/.test(exportDoc)) {
  violations.push(
    "server-document-export.ts: must verify artifact evidence",
  );
}

const word = read("lib/deliverables/server-word-export.ts");
if (!/exportDocumentsOnServer/.test(word)) {
  violations.push(
    "server-word-export.ts: must delegate to exportDocumentsOnServer",
  );
}

const commander = read("lib/commander/execute.ts");
if (!/exportDocumentsOnServer/.test(commander)) {
  violations.push(
    "commander/execute.ts: must call unified exportDocumentsOnServer",
  );
}
if (/exportWordDeliverableOnServer/.test(commander)) {
  violations.push(
    "commander/execute.ts: must not call Word-only export helper",
  );
}
if (!/artifactsRequired/.test(commander)) {
  violations.push("commander/execute.ts: artifactsRequired missing");
}

const gate = read("lib/work-jobs/run.ts");
if (!/completed without artifact/.test(gate)) {
  violations.push(
    "work-jobs/run.ts: completed-without-artifact gate missing",
  );
}
if (!/artifactsRequired/.test(gate)) {
  violations.push("work-jobs/run.ts: artifactsRequired gate missing");
}

const download = read("lib/deliverables/download-client.ts");
if (!/format === "txt"/.test(download)) {
  violations.push("download-client.ts: txt MIME allow missing");
}
if (!/format === "md"/.test(download)) {
  violations.push("download-client.ts: md MIME allow missing");
}

const persist = read("lib/deliverables/artifact-persist.ts");
if (!/completionEvidenceId/.test(persist)) {
  violations.push("artifact-persist.ts: completion evidence write-back missing");
}
if (!/verified_at/.test(persist)) {
  violations.push("artifact-persist.ts: verified_at write-back missing");
}

const migration = read(
  "supabase/migrations/20260805_p0_7_document_generation_pipeline.sql",
);
for (const needle of [
  "atlas_document_generation_jobs",
  "requested_formats",
  "completion_evidence_ids",
  "retry_count",
  "cancelled_at",
  "progress_pct",
  "owner_user_id",
]) {
  if (!migration.toLowerCase().includes(needle.toLowerCase())) {
    violations.push(
      `migration 20260805_p0_7_document_generation_pipeline.sql: missing ${needle}`,
    );
  }
}

const resolve = read("lib/deliverables/resolve-requested-export-formats.ts");
if (!/preferredDeliverableFormat/.test(resolve)) {
  violations.push(
    "resolve-requested-export-formats.ts: preferredDeliverableFormat missing",
  );
}

if (violations.length) {
  console.error("P0-7 document pipeline CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-7 document pipeline CI ban OK");

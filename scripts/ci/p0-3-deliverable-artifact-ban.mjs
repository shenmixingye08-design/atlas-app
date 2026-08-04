#!/usr/bin/env node
/**
 * CI gate (P0-3): Production deliverable paths must not use local disk / Map
 * as source of truth, and must await durable persist before completed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const store = read("lib/deliverables/store.ts");
// saveDeliverableFile body must not fire-and-forget persist.
const saveFn = store.split("export function saveDeliverableFile")[1] ?? "";
const saveBody = saveFn.split("export async function saveDeliverableFileDurable")[0] ?? "";
if (/void persistDurableDeliverable/.test(saveBody)) {
  violations.push(
    "lib/deliverables/store.ts: saveDeliverableFile must not fire-and-forget persist",
  );
}
if (!/saveDeliverableArtifact/.test(store)) {
  violations.push(
    "lib/deliverables/store.ts: must route Durable save through saveDeliverableArtifact",
  );
}

const artifact = read("lib/deliverables/artifact-persist.ts");
for (const needle of [
  "saveDeliverableArtifact",
  "checksum_mismatch",
  "zero_byte",
  "hasVerifiedArtifactEvidence",
]) {
  if (!artifact.includes(needle)) {
    violations.push(`lib/deliverables/artifact-persist.ts: missing ${needle}`);
  }
}

const backend = read("lib/deliverables/storage-backend.ts");
if (!/memory_durable/.test(backend) || !/isAtlasProduction/.test(backend)) {
  violations.push(
    "lib/deliverables/storage-backend.ts: Production must forbid memory_durable / require supabase",
  );
}
// Production / preview branch must return supabase before any local default.
const prodIdx = backend.indexOf("isAtlasProduction()");
const localReturnIdx = backend.lastIndexOf('return "local"');
if (prodIdx < 0 || localReturnIdx < prodIdx) {
  violations.push(
    "lib/deliverables/storage-backend.ts: Production check must precede local default",
  );
}
if (!/return "supabase"/.test(backend)) {
  violations.push(
    "lib/deliverables/storage-backend.ts: supabase backend return missing",
  );
}

const objectStorage = read("lib/deliverables/object-storage.ts");
if (!/deliverable-artifacts/.test(objectStorage)) {
  violations.push(
    "lib/deliverables/object-storage.ts: P0-3 path prefix deliverable-artifacts missing",
  );
}

const durable = read("lib/deliverables/durable-store.ts");
if (
  !/storageStatus === "stored"/.test(durable) ||
  !/memory_durable/.test(durable)
) {
  violations.push(
    "lib/deliverables/durable-store.ts: Production durable requires stored object",
  );
}

const engine = read("lib/deliverables/engine.ts");
if (!/P0-3: all formats require durable/.test(engine)) {
  violations.push(
    "lib/deliverables/engine.ts: non-docx formats must gate on persist.durable",
  );
}

const migration = read(
  "supabase/migrations/20260804_p0_3_durable_deliverable_artifacts.sql",
);
for (const needle of [
  "verified_at",
  "completion_evidence_id",
  "atlas_deliverable_files_storage_path_uidx",
  "content_sha256",
]) {
  if (!migration.includes(needle)) {
    violations.push(
      `supabase/migrations/20260804_p0_3_durable_deliverable_artifacts.sql: missing ${needle}`,
    );
  }
}

if (violations.length) {
  console.error("P0-3 deliverable artifact CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-3 deliverable artifact CI ban OK");

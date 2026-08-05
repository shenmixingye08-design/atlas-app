#!/usr/bin/env node
/**
 * CI gate (P0-6): Production Automation must not use Map/setInterval/localStorage
 * as SoT, fire-and-forget persist on mutation paths, or memory fallback.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const backend = read("lib/automations/automation-backend.ts");
if (!/memory_durable automation store is forbidden in Production/.test(backend)) {
  violations.push(
    "automation-backend.ts: Production must forbid memory_durable",
  );
}
if (!/Map fallback disabled/.test(backend)) {
  violations.push("automation-backend.ts: Map fallback disabled message missing");
}

const durable = read("lib/automations/durable.ts");
if (!/persistAutomationsNow/.test(durable)) {
  violations.push("durable.ts: persistAutomationsNow missing");
}
if (!/replaceDurableAutomationsForOwner/.test(durable)) {
  violations.push("durable.ts: must write durable definition rows");
}
if (!/listDurableAutomationsForOwner/.test(durable)) {
  violations.push("durable.ts: must hydrate from durable definition rows");
}

const definitions = read("lib/automations/durable-automation-definitions.ts");
if (!/AutomationStoreUnavailableError/.test(definitions)) {
  violations.push("durable-automation-definitions.ts: fail-closed error missing");
}
if (!/memory fallback disabled/.test(definitions)) {
  violations.push(
    "durable-automation-definitions.ts: memory fallback disabled missing",
  );
}
if (!/atlas_automation_definitions/.test(definitions)) {
  violations.push(
    "durable-automation-definitions.ts: atlas_automation_definitions missing",
  );
}

const executions = read("lib/automations/durable-automation-executions.ts");
if (!/atlas_automation_executions/.test(executions)) {
  violations.push(
    "durable-automation-executions.ts: atlas_automation_executions missing",
  );
}
if (!/retry_scheduled/.test(executions)) {
  violations.push("durable-automation-executions.ts: durable retry missing");
}

const service = read("lib/automations/automation-service.ts");
if (/schedulePersistAutomations/.test(service)) {
  violations.push(
    "automation-service.ts: must not use fire-and-forget schedulePersistAutomations",
  );
}
if (!/await persistAutomationsNow/.test(service)) {
  violations.push(
    "automation-service.ts: must await persistAutomationsNow on mutations",
  );
}

const tick = read("lib/work-queue/tick.ts");
if (!/persistAutomationsNow/.test(tick)) {
  violations.push(
    "work-queue/tick.ts: advanceNextRun must persistAutomationsNow",
  );
}
if (/setInterval|setTimeout/.test(tick) && /scheduler|automation/i.test(tick)) {
  // tick should not be a process-memory timer scheduler
  if (/setInterval\s*\(/.test(tick) || /setTimeout\s*\(/.test(tick)) {
    violations.push(
      "work-queue/tick.ts: process timer scheduler forbidden",
    );
  }
}

const execLog = read("lib/automations/execution-log/store.ts");
if (!/upsertDurableAutomationExecution/.test(execLog)) {
  violations.push(
    "execution-log/store.ts: must write-through durable executions",
  );
}

const migration = read(
  "supabase/migrations/20260805_p0_6_durable_automation_engine.sql",
);
for (const needle of [
  "atlas_automation_definitions",
  "atlas_automation_executions",
  "next_run_at",
  "retry_count",
  "paused",
  "idempotency_key",
  "occurrence_key",
  "owner_user_id",
  "organization_id",
]) {
  if (!migration.toLowerCase().includes(needle.toLowerCase())) {
    violations.push(
      `migration 20260805_p0_6_durable_automation_engine.sql: missing ${needle}`,
    );
  }
}

// Ban localStorage SoT in automation engine modules
for (const rel of [
  "lib/automations/durable.ts",
  "lib/automations/automation-service.ts",
  "lib/automations/durable-automation-definitions.ts",
  "lib/work-queue/tick.ts",
]) {
  const src = read(rel);
  if (/localStorage/.test(src)) {
    violations.push(`${rel}: localStorage SoT forbidden`);
  }
}

if (violations.length) {
  console.error("P0-6 durable automation CI ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P0-6 durable automation CI ban OK");

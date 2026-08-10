#!/usr/bin/env node
/**
 * CI gate (N-08): Automation must present as one user-facing「自動化」concept.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/automations/canonical/index.ts",
  "lib/automations/canonical/normalize.ts",
  "lib/automations/canonical/merge.ts",
  "lib/automations/canonical/n08-automation-unify-production-probe.ts",
  "lib/automations/canonical/n08-automation-unify.test.ts",
  "app/api/health/n08-automation-unify/route.ts",
  "docs/development/feature-evaluation-n08-automation-canonical-unify.md",
  ".github/workflows/verify-n08-automation-unify-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const probe = read(
  "lib/automations/canonical/n08-automation-unify-production-probe.ts",
);
for (const key of [
  "canonicalModelOk",
  "legacyReadOk",
  "legacyExecuteOk",
  "newExecuteOk",
  "createUnifiedOk",
  "editUnifiedOk",
  "pauseResumeUnifiedOk",
  "deleteSemanticsOk",
  "memoryV1Ok",
  "memoryV2Ok",
  "schedulerCompatibleOk",
  "workerCompatibleOk",
  "retrySafeOk",
  "idempotencyOk",
  "multiInstanceOk",
  "crossUserIsolatedOk",
  "userFacingV1V2HiddenOk",
]) {
  if (!probe.includes(key)) {
    violations.push(`n08 probe: missing ${key}`);
  }
}

const health = read("app/api/health/n08-automation-unify/route.ts");
if (/authorizeHealthProbe/.test(health)) {
  violations.push("health/n08: must be public probe (no authorizeHealthProbe)");
}
if (!/probeN08AutomationUnifyProduction/.test(health)) {
  violations.push("health/n08: must call probeN08AutomationUnifyProduction");
}

const dashboard = read("components/automations/automations-dashboard.tsx");
if (dashboard.includes("これまでのスケジュール型の仕事")) {
  violations.push("dashboard: must not split legacy list heading");
}
if (dashboard.includes("`/automations?v2=")) {
  violations.push("dashboard: must not deep-link with ?v2=");
}
if (dashboard.includes("deleteComingSoon")) {
  violations.push("dashboard: deleteComingSoon must be removed");
}

const detail = read("components/automations/automation-detail-panel.tsx");
if (detail.includes("deleteComingSoon") || /削除は順次対応/.test(detail)) {
  violations.push("detail panel: v1 delete must be enabled");
}
if (!/onDelete/.test(detail)) {
  violations.push("detail panel: onDelete required");
}

const deleteRoute = read("app/api/automations/[id]/route.ts");
if (!/export async function DELETE/.test(deleteRoute)) {
  violations.push("automations/[id]: DELETE handler required");
}

const statusLabels = read(
  "lib/automation-platform/operations/status-labels.ts",
);
if (!/active:\s*"有効"/.test(statusLabels)) {
  violations.push("status-labels: active must be 有効");
}
if (/稼働中/.test(statusLabels)) {
  violations.push("status-labels: must not use 稼働中 (use 有効)");
}

const display = read("lib/automations/display.ts");
if (!/paused:\s*"一時停止"/.test(display)) {
  violations.push("display.ts: paused must be 一時停止");
}

const runV1 = read("lib/automations/run-automation.ts");
if (!/buildV1AutomationMemoryMetadata|v1-automation-bridge/.test(runV1)) {
  violations.push("run-automation.ts: N-05 v1 memory bridge must remain");
}

const v2Service = read(
  "lib/automation-platform/service/automation-service.ts",
);
if (!/applyMemoryForAutomation/.test(v2Service)) {
  violations.push("v2 service: applyMemoryForAutomation must remain");
}

const tick = read("app/api/automations/tick/route.ts");
if (!/processWorkQueueTick/.test(tick) || !/processDueScheduledAutomationsV2/.test(tick)) {
  violations.push("tick: must keep v1 work-queue + v2 due processing");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n08-automation-unify-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n08 ban");
}
if (!/test:n08-automation-unify/.test(qg)) {
  violations.push("quality-gate.yml: must run n08 tests");
}
if (!/n05-memory-apply-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-05 ban must remain");
}
if (!/n01-premium-capability-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-01 ban must remain");
}
if (!/n02-unproven-speed-claims-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-02 ban must remain");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/n08-automation-unify/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/n08-automation-unify");
}

const pkg = read("package.json");
if (!/ci:n08-automation-unify-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n08-automation-unify-ban");
}
if (!/test:n08-automation-unify/.test(pkg)) {
  violations.push("package.json: missing test:n08-automation-unify");
}

if (violations.length) {
  console.error("n08_automation_unify_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n08_automation_unify_ban=pass");

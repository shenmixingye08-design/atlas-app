#!/usr/bin/env node
/**
 * CI gate (N-07): Soft-success false completions must stay banned.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/notifications/execution-result.ts",
  "lib/notifications/channel-ack.ts",
  "lib/notifications/n07-soft-success-production-probe.ts",
  "lib/notifications/n07-soft-success.test.ts",
  "app/api/health/n07-soft-success/route.ts",
  "docs/development/feature-evaluation-n07-soft-success-elimination.md",
  ".github/workflows/verify-n07-soft-success-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const probe = read("lib/notifications/n07-soft-success-production-probe.ts");
for (const key of [
  "trueSuccessOk",
  "hardFailureOk",
  "partialFailureOk",
  "retryStateOk",
  "retrySuccessOk",
  "retryExhaustedFailureOk",
  "timeoutNotSuccessOk",
  "artifactMissingNotSuccessOk",
  "externalFailureNotSuccessOk",
  "jobNotificationConsistentOk",
  "historyNotificationConsistentOk",
  "notificationIdempotentOk",
  "multiInstanceOk",
  "crossUserIsolatedOk",
  "failClosedOk",
  "secretsRedactedOk",
]) {
  if (!probe.includes(key)) {
    violations.push(`n07 probe: missing ${key}`);
  }
}
if (/trueSuccessOk:\s*true\s*,\s*\n\s*hardFailureOk:\s*true/.test(probe) &&
    !/buildCanonicalExecutionResult/.test(probe)) {
  violations.push("n07 probe: flags appear fixed-true without evaluation");
}

const health = read("app/api/health/n07-soft-success/route.ts");
if (/authorizeHealthProbe/.test(health)) {
  violations.push("health/n07: must be public probe (no authorizeHealthProbe)");
}
if (!/probeN07SoftSuccessProduction/.test(health)) {
  violations.push("health/n07: must call probeN07SoftSuccessProduction");
}

const delivery = read("lib/notifications/delivery.ts");
if (!/ackSkipped/.test(delivery)) {
  violations.push("delivery.ts: must use ackSkipped for intentional non-delivery");
}
if (
  /not_configured[\s\S]{0,120}recordReliabilityEvent\(\s*["']notification_ack["']\s*,\s*["']success["']/.test(
    delivery,
  )
) {
  violations.push("delivery.ts: not_configured must not ACK success");
}

const service = read("lib/notifications/service.ts");
if (!/suppressed/.test(service)) {
  violations.push("service.ts: skipped push must mark suppressed");
}

const commander = read("lib/commander/execute.ts");
if (/finalStatus === "partial"[\s\S]{0,400}notifyWorkCompleted/.test(commander)) {
  violations.push("commander: partial must not use notifyWorkCompleted");
}
if (!/notifyWorkNeedsReview/.test(commander)) {
  violations.push("commander: partial must use notifyWorkNeedsReview");
}

const execResult = read("lib/notifications/execution-result.ts");
if (!/softSuccess:\s*false/.test(execResult)) {
  violations.push("execution-result.ts: softSuccess must be false");
}
if (!/sideEffectConfirmed/.test(execResult)) {
  violations.push("execution-result.ts: SUCCESS requires sideEffectConfirmed");
}

const v2Notify = read("lib/automation-platform/execution/notify.ts");
if (/partially_succeeded:[\s\S]{0,200}type:\s*"completed"/.test(v2Notify)) {
  violations.push("v2 notify: partially_succeeded must not be type completed");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n07-soft-success-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n07 ban");
}
if (!/test:n07-soft-success/.test(qg)) {
  violations.push("quality-gate.yml: must run n07 tests");
}
if (!/n08-automation-unify-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-08 ban must remain");
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
if (!/n07-soft-success/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/n07-soft-success");
}

const pkg = read("package.json");
if (!/ci:n07-soft-success-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n07-soft-success-ban");
}
if (!/test:n07-soft-success/.test(pkg)) {
  violations.push("package.json: missing test:n07-soft-success");
}

if (violations.length) {
  console.error("n07_soft_success_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n07_soft_success_ban=pass");

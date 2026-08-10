#!/usr/bin/env node
/**
 * CI gate (N-05): Personal Memory must be DB SoT with Production apply proof.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/memory-apply/memory-apply-production-probe.ts",
  "lib/memory-apply/n05-memory-apply-production.test.ts",
  "lib/memory-apply/preference-structure.ts",
  "lib/memory-apply/v1-automation-bridge.ts",
  "app/api/health/memory-apply/route.ts",
  "docs/development/feature-evaluation-n05-memory-apply-production.md",
  ".github/workflows/verify-memory-apply-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const durable = read("lib/persistence/durable-domain.ts");
if (!/atlasPersonalMemory/.test(durable)) {
  violations.push("durable-domain.ts: atlasPersonalMemory must be Supabase-only");
}

const personalDurable = read("lib/personal-memory/durable.ts");
if (!/persistPersonalMemoryNow/.test(personalDurable)) {
  violations.push("personal-memory/durable.ts: persistPersonalMemoryNow required");
}
if (!/evictPersonalMemoryCacheForUser/.test(personalDurable)) {
  violations.push("personal-memory/durable.ts: evictPersonalMemoryCacheForUser required");
}
if (!/forceSupabase:\s*true/.test(personalDurable)) {
  violations.push("personal-memory/durable.ts: forceSupabase required");
}

const probe = read("lib/memory-apply/memory-apply-production-probe.ts");
for (const key of [
  "dbSotOk",
  "saveRetrieveOk",
  "memoryAppliedOk",
  "artifactPreferenceAppliedOk",
  "automationPreferenceAppliedOk",
  "restartDurableOk",
  "multiInstanceOk",
  "ownershipIsolationOk",
  "deletePropagationOk",
  "updatePropagationOk",
  "secretsRedacted",
  "failClosedOk",
  "memorySaved",
  "memoryRetrieved",
  "memoryApplied",
]) {
  if (!probe.includes(key)) {
    violations.push(`memory-apply-production-probe.ts: missing ${key}`);
  }
}

// Health route must not require auth gate / self-seed fake dashboard success
const health = read("app/api/health/memory-apply/route.ts");
if (/authorizeHealthProbe/.test(health)) {
  violations.push("health/memory-apply: must be public probe (no authorizeHealthProbe)");
}
if (/recordMemoryApplyEvent\(\s*\{\s*userId:\s*"system"/.test(health)) {
  violations.push("health/memory-apply: must not self-seed system dashboard events");
}
if (!/probeMemoryApplyProduction/.test(health)) {
  violations.push("health/memory-apply: must call probeMemoryApplyProduction");
}

const v1 = read("lib/automations/run-automation.ts");
if (!/buildV1AutomationMemoryMetadata|v1-automation-bridge/.test(v1)) {
  violations.push("run-automation.ts: v1 must wire Personal Memory bridge");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/n05-memory-apply-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run n05 ban");
}
if (!/test:memory-apply/.test(qg)) {
  violations.push("quality-gate.yml: must run n05 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/memory-apply/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/memory-apply");
}

const pkg = read("package.json");
if (!/ci:n05-memory-apply-ban/.test(pkg)) {
  violations.push("package.json: missing ci:n05-memory-apply-ban");
}
if (!/test:memory-apply/.test(pkg)) {
  violations.push("package.json: missing test:memory-apply");
}

// Keep N-01 / N-02 wired
if (!/n01-premium-capability-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-01 ban must remain");
}
if (!/n02-unproven-speed-claims-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: N-02 ban must remain");
}

if (violations.length) {
  console.error("n05_memory_apply_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("n05_memory_apply_ban=pass");

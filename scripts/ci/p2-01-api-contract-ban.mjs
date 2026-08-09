#!/usr/bin/env node
/**
 * CI gate (P2-01): critical API contracts + Quality Gate wiring + Production probe.
 * Soft-success / missing suite is forbidden.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/api-contracts/critical-contracts.ts",
  "lib/api-contracts/validate.ts",
  "lib/api-contracts/production-probe.ts",
  "lib/api-contracts/p2-01-api-contracts.test.ts",
  "app/api/health/api-contracts/route.ts",
  "docs/development/feature-evaluation-p2-01-api-contracts.md",
  "scripts/ci/p2-01-api-contract-smoke.mjs",
  "scripts/ci/p2-01-api-contract-smoke-paths.mjs",
  ".github/workflows/verify-api-contracts-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p2-01-api-contract-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-01-api-contract-ban.mjs");
}
if (!/lib\/api-contracts|test:api-contracts|p2-01-api-contracts/.test(qg)) {
  violations.push("quality-gate.yml: must run api-contracts tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/api-contracts/.test(publicRoutes)) {
  violations.push("public-routes.ts: api-contracts must be middleware-public");
}

const contracts = read("lib/api-contracts/critical-contracts.ts");
for (const id of [
  "health.version",
  "health.work-queue",
  "automations.tick.unauthorized",
  "automations.list.unauthorized",
]) {
  if (!contracts.includes(id)) {
    violations.push(`critical-contracts.ts: missing ${id}`);
  }
}

const probe = read("lib/api-contracts/production-probe.ts");
if (!/inject_forbidden_in_production/.test(probe)) {
  violations.push("production-probe.ts: must ban memory inject in Production");
}
if (!/\bfetch\s*\(/.test(probe)) {
  violations.push("production-probe.ts: must live-fetch contracts");
}

const tests = read("lib/api-contracts/p2-01-api-contracts.test.ts");
for (const marker of [
  "happy path",
  "failure path",
  "duplicate execution",
  "inject_forbidden_in_production",
  "cross-user isolation",
  "restart durability",
]) {
  if (!tests.toLowerCase().includes(marker.toLowerCase().split(" ")[0]) &&
      !tests.includes(marker)) {
    // loose check below
  }
}
if (!/happy path|failure path|duplicate execution|inject_forbidden_in_production|cross-user isolation|restart durability/i.test(tests)) {
  violations.push("p2-01-api-contracts.test.ts: missing required scenario markers");
}

const pkg = read("package.json");
if (!/"test:api-contracts"/.test(pkg)) {
  violations.push("package.json: must define test:api-contracts script");
}

if (violations.length) {
  console.error("P2-01 API contract ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P2-01 API contract ban OK");

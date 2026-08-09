#!/usr/bin/env node
/**
 * CI gate (P2-04): correlation-tagged structured logs must stay durable (Postgres SoT).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/reliability/developer-log.ts",
  "lib/reliability/structured-logs-store.ts",
  "lib/reliability/structured-logs-probe.ts",
  "lib/reliability/structured-logs-migration-sql.ts",
  "lib/reliability/p2-04-structured-logs.test.ts",
  "app/api/health/structured-logs/route.ts",
  "docs/development/feature-evaluation-p2-04-structured-logs.md",
  "supabase/migrations/20260809_p2_04_structured_logs.sql",
  ".github/workflows/verify-structured-logs-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const developerLog = read("lib/reliability/developer-log.ts");
for (const marker of [
  "correlationId",
  "atlas_structured_logs",
  "enqueueDurablePersist",
  "listDeveloperErrorLogsDurable",
  "P2-04",
]) {
  if (!developerLog.includes(marker)) {
    violations.push(`developer-log.ts: missing ${marker}`);
  }
}

// Memory must not be declared as SoT.
if (/source of truth|SoT/i.test(developerLog) && /memory.*SoT|SoT.*memory/i.test(developerLog)) {
  // allow docs that say memory is NOT SoT
}
if (/process memory is the source of truth/i.test(developerLog)) {
  violations.push("developer-log.ts: must not treat process memory as SoT");
}

const store = read("lib/reliability/structured-logs-store.ts");
for (const marker of [
  "persistStructuredLog",
  "softSuccess: false",
  "getStructuredLogsByCorrelationId",
  "redactSecrets",
  "atlas_structured_logs",
]) {
  if (!store.includes(marker)) {
    violations.push(`structured-logs-store.ts: missing ${marker}`);
  }
}

const probe = read("lib/reliability/structured-logs-probe.ts");
for (const marker of [
  "probeStructuredLogs",
  "restartDurableOk",
  "multiInstanceOk",
  "memoryNotSot",
  "crossUserIsolated",
  "secretsRedacted",
]) {
  if (!probe.includes(marker)) {
    violations.push(`structured-logs-probe.ts: missing ${marker}`);
  }
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p2-04-structured-logs-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-04 ban");
}
if (!/test:structured-logs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-04 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/structured-logs/.test(publicRoutes)) {
  violations.push("public-routes.ts: structured-logs must be public");
}

const contracts = read("lib/api-contracts/critical-contracts.ts");
if (!/health\.structured-logs/.test(contracts)) {
  violations.push("critical-contracts.ts: must include structured-logs");
}

const pkg = read("package.json");
if (!/"test:structured-logs"/.test(pkg)) {
  violations.push("package.json: must define test:structured-logs");
}

const evalDoc = read("docs/development/feature-evaluation-p2-04-structured-logs.md");
if (!/公開後項目 #18|項目 18/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite 47/100 #18");
}
if (!/相関ID付き構造化ログ/.test(evalDoc)) {
  violations.push("feature-evaluation: must use official P2-04 name");
}

if (violations.length) {
  console.error("P2-04 structured logs ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P2-04 structured logs ban OK");

#!/usr/bin/env node
/**
 * CI gate (P3-02): Company template tenant isolation must stay durable.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/company-templates/durable.ts",
  "lib/company-templates/company-template-probe.ts",
  "lib/company-templates/p3-02-company-template-tenant.test.ts",
  "app/api/health/company-template/route.ts",
  "docs/development/feature-evaluation-p3-02-company-template-tenant.md",
  ".github/workflows/verify-company-template-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const durable = read("lib/company-templates/durable.ts");
for (const marker of [
  "atlasActiveCompany",
  "ensureActiveCompanyHydrated",
  "persistActiveCompanyNow",
  "resolveAuthoritativeTemplateId",
  "forceSupabase: true",
]) {
  if (!durable.includes(marker)) {
    violations.push(`durable.ts: missing ${marker}`);
  }
}

const store = read("lib/company-templates/store.ts");
if (!store.includes("hasServerActiveCompanyStateForUser")) {
  violations.push("store.ts: must expose hasServerActiveCompanyStateForUser");
}
// Must not seed Map on get miss (hydrate path).
if (/bucket\.set\(userId,\s*created\)/.test(store)) {
  violations.push("store.ts: must not seed Map on get miss");
}

const apply = read("lib/company-templates/apply-template.server.ts");
if (!/persistActiveCompanyNow/.test(apply)) {
  violations.push("apply-template.server.ts: must persist to Postgres SoT");
}

const runForUser = read("lib/orchestration/run-for-user.ts");
if (!/resolveAuthoritativeTemplateId/.test(runForUser)) {
  violations.push("run-for-user.ts: must use server-authoritative template id");
}
if (!/ensureActiveCompanyHydrated/.test(runForUser)) {
  violations.push("run-for-user.ts: must hydrate active company");
}

const domain = read("lib/persistence/durable-domain.ts");
if (!domain.includes('"atlasActiveCompany"')) {
  violations.push("durable-domain.ts: atlasActiveCompany must be supabase-only");
}

const probe = read("lib/company-templates/company-template-probe.ts");
for (const marker of [
  "restartDurableOk",
  "retrySafe",
  "idempotent",
  "multiInstanceSafe",
  "memoryNotSot",
  "ownershipIsolationOk",
  "serverAuthorityOk",
  "failClosed",
]) {
  if (!probe.includes(marker)) {
    violations.push(`company-template-probe.ts: missing ${marker}`);
  }
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p3-02-company-template-tenant-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-02 ban");
}
if (!/test:company-template/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-02 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/company-template/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/company-template");
}

const evalDoc = read(
  "docs/development/feature-evaluation-p3-02-company-template-tenant.md",
);
if (!/Company templateのテナント分離徹底/.test(evalDoc) || !/#21/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite Company template #21");
}

if (violations.length) {
  console.error("P3-02 company template tenant ban failed:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("p3_02_company_template_tenant_ban=pass");

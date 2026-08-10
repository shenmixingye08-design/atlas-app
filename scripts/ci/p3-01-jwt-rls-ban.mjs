#!/usr/bin/env node
/**
 * CI gate (P3-01): JWT連携RLS must stay wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/supabase/jwt-rls/mint-clerk-jwt.ts",
  "lib/supabase/jwt-rls/resolve-jwt-secret.ts",
  "lib/supabase/jwt-rls/client.ts",
  "lib/supabase/jwt-rls/jwt-rls-probe.ts",
  "lib/supabase/jwt-rls/store.ts",
  "lib/supabase/jwt-rls/migration-sql.ts",
  "lib/supabase/jwt-rls/p3-01-jwt-rls.test.ts",
  "app/api/health/jwt-rls/route.ts",
  "docs/development/feature-evaluation-p3-01-jwt-rls.md",
  "supabase/migrations/20260810_p3_01_jwt_rls.sql",
  ".github/workflows/verify-jwt-rls-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const mint = read("lib/supabase/jwt-rls/mint-clerk-jwt.ts");
for (const marker of ["mintClerkSupabaseJwt", "authenticated", "sub"]) {
  if (!mint.includes(marker)) {
    violations.push(`mint-clerk-jwt.ts: missing ${marker}`);
  }
}

const sql = read("supabase/migrations/20260810_p3_01_jwt_rls.sql");
for (const marker of [
  "atlas_jwt_rls_subjects",
  "auth.jwt() ->> 'sub'",
  "projects_jwt_select_own",
]) {
  if (!sql.includes(marker)) {
    violations.push(`migration sql: missing ${marker}`);
  }
}

const probe = read("lib/supabase/jwt-rls/jwt-rls-probe.ts");
for (const marker of [
  "jwtBridgeOk",
  "rlsEnforced",
  "restartDurableOk",
  "retrySafe",
  "idempotent",
  "multiInstanceSafe",
  "memoryNotSot",
  "ownershipIsolationOk",
  "failClosed",
]) {
  if (!probe.includes(marker)) {
    violations.push(`jwt-rls-probe.ts: missing ${marker}`);
  }
}

if (/ok:\s*true,\s*\n\s*jwtBridgeOk:\s*true/.test(probe) && /fixed.?true/i.test(probe)) {
  violations.push("jwt-rls-probe.ts: fixed-true pattern forbidden");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p3-01-jwt-rls-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-01 ban");
}
if (!/test:jwt-rls/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-01 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/jwt-rls/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/jwt-rls");
}

const evalDoc = read("docs/development/feature-evaluation-p3-01-jwt-rls.md");
if (!/JWT連携RLS/.test(evalDoc) || !/#20/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite JWT連携RLS #20");
}

if (violations.length) {
  console.error("P3-01 JWT RLS ban failed:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("p3_01_jwt_rls_ban=pass");

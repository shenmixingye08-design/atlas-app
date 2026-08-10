#!/usr/bin/env node
/**
 * Guardrails for CORE LOOP E2E harness:
 * - harness + workflow + setup docs must exist
 * - must NOT introduce Production auth bypass
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "scripts/ci/core-loop-production-e2e.mjs",
  "scripts/ci/core-loop-e2e-harness-ban.mjs",
  ".github/workflows/verify-core-loop-production-e2e.yml",
  "docs/development/core-loop-production-e2e-setup.md",
  "docs/development/feature-evaluation-core-loop-e2e.md",
];
for (const rel of required) {
  if (!existsSync(join(root, rel))) violations.push(`missing:${rel}`);
}

const script = read("scripts/ci/core-loop-production-e2e.mjs");
for (const keep of [
  "E2E_CLERK_USER_ID",
  "CLERK_SECRET_KEY",
  "sign_in_tokens",
  "testing_tokens",
  "__clerk_testing_token",
  "strategy",
  "ticket",
  "failureStage",
  "tokenCreated",
  "clerkSessionDetected",
  "authenticatedUserIdMatchesExpected",
  "/api/work/jobs",
  "/api/deliverables/",
  "OWNER_SETUP_REQUIRED",
  "crossUserIsolated",
  "assertNoSecretLeak",
]) {
  if (!script.includes(keep)) violations.push(`e2e_script_missing:${keep}`);
}
if (/e2e-bypass|auth-bypass|skipAuthForE2E|ATLAS_SCREENSHOT_MODE\s*=\s*['\"]1['\"]/.test(script)) {
  violations.push("e2e_script_must_not_add_auth_bypass");
}

// Must not hardcode live secrets or pretend probe/sample is enough.
if (/sk_live_[A-Za-z0-9]{10,}/.test(script)) {
  violations.push("e2e_script_hardcoded_sk_live");
}
if (/sample.*PASS|health probe.*PASS/i.test(script) && !script.includes("health/version")) {
  violations.push("e2e_script_probe_shortcut");
}

const wf = read(".github/workflows/verify-core-loop-production-e2e.yml");
if (!/workflow_dispatch/.test(wf)) {
  violations.push("workflow_must_be_manual_dispatch");
}
if (!/CLERK_SECRET_KEY/.test(wf) || !/E2E_CLERK_USER_ID/.test(wf)) {
  violations.push("workflow_missing_secret_refs");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/core-loop-e2e-harness-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run core-loop e2e harness ban");
}

const pkg = read("package.json");
if (!/ci:core-loop-e2e-harness-ban/.test(pkg)) {
  violations.push("package.json: missing ci:core-loop-e2e-harness-ban");
}
if (!/test:core-loop-production-e2e/.test(pkg)) {
  violations.push("package.json: missing test:core-loop-production-e2e");
}

// Production auth bypass ban (app code).
const proxy = read("proxy.ts");
if (/ATLAS_SCREENSHOT_MODE/.test(proxy)) {
  // Allowed only when not production — verify guard remains.
  if (!/production|VERCEL_ENV/.test(proxy)) {
    violations.push("screenshot_mode_missing_prod_guard");
  }
}

const forbiddenAppSnippets = [
  { file: "lib/auth/public-routes.ts", re: /e2e-bypass|auth-bypass|skipAuthForE2E/i },
  { file: "proxy.ts", re: /e2e-bypass|auth-bypass|skipAuthForE2E/i },
];
for (const { file, re } of forbiddenAppSnippets) {
  if (re.test(read(file))) violations.push(`forbidden_bypass:${file}`);
}

if (violations.length) {
  console.error("core_loop_e2e_harness_ban=fail");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("core_loop_e2e_harness_ban=pass");

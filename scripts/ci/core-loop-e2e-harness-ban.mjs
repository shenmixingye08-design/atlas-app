#!/usr/bin/env node
/**
 * Guardrails for CORE LOOP E2E harness:
 * - harness + workflow + setup docs must exist
 * - must use Clerk official Playwright testing helpers (clerkSetup + clerk.signIn)
 * - must NOT introduce Production auth bypass
 * - must NOT use Agent Tasks as required path (not available on this Production Dashboard)
 * - must NOT reintroduce /sign-in?ticket URL as the primary path
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
  "@clerk/testing/playwright",
  "clerkSetup",
  "clerk.signIn",
  "createSignInToken",
  "E2E_CLERK_USER_ID",
  "CLERK_SECRET_KEY",
  "verifyInstancePairing",
  "clerkSetupOk",
  "clerkSignInOk",
  "clerkSessionDetected",
  "authenticatedUserIdMatchesExpected",
  "authApiStatus",
  "protectedPageAccessible",
  "authApiErrorCode",
  "failureStage",
  "/api/work/jobs",
  "/api/deliverables/",
  "OWNER_SETUP_REQUIRED",
  "crossUserIsolated",
  "assertNoSecretLeak",
  "setDefaultTimeout",
  "withTimeout",
  "setupClerkTestingToken",
  "ticketRedeemStatus",
  "cookieDomains",
  "createSession",
  "backend_session_cookie",
  "waitForProductionSha",
  "CORE_LOOP_EXPECT_SHA",
  "ensureUserIdentification",
  "setupClerkTestingToken({ context })",
  "+clerk_test",
  "feature_not_enabled",
  "createPhoneNumber",
  "associated identification",
]) {
  if (!script.includes(keep)) violations.push(`e2e_script_missing:${keep}`);
}

// Must not require Agent Tasks (Dashboard has no enablement UI on this instance).
if (/createAgentTestingTask/.test(script)) {
  violations.push("e2e_script_must_not_require_agent_tasks");
}

// Primary auth must not navigate to ticket-query sign-in URLs.
if (/goto\([^\)]*__clerk_ticket|goto\([^\)]*\/sign-in\?[^\)]*ticket=/.test(script)) {
  violations.push("e2e_script_must_not_use_ticket_url_primary");
}
if (/e2e-bypass|auth-bypass|skipAuthForE2E|ATLAS_SCREENSHOT_MODE\s*=\s*['\"]1['\"]/.test(script)) {
  violations.push("e2e_script_must_not_add_auth_bypass");
}

if (/sk_live_[A-Za-z0-9]{10,}/.test(script)) {
  violations.push("e2e_script_hardcoded_sk_live");
}
if (/sample.*PASS|health probe.*PASS/i.test(script) && !script.includes("health/version")) {
  violations.push("e2e_script_probe_shortcut");
}

const wf = read(".github/workflows/verify-core-loop-production-e2e.yml");
if (!/workflow_dispatch/.test(wf)) {
  violations.push("workflow_must_allow_manual_dispatch");
}
if (!/push:/.test(wf) || !/core-loop-production-e2e\.mjs/.test(wf)) {
  violations.push("workflow_must_auto_trigger_on_harness_push");
}
if (!/CLERK_SECRET_KEY/.test(wf) || !/E2E_CLERK_USER_ID/.test(wf)) {
  violations.push("workflow_missing_secret_refs");
}
if (!/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|CLERK_PUBLISHABLE_KEY/.test(wf)) {
  violations.push("workflow_missing_publishable_key_secret");
}
if (/Agent Tasks/i.test(wf)) {
  violations.push("workflow_must_not_require_agent_tasks");
}

const docs = read("docs/development/core-loop-production-e2e-setup.md");
for (const keep of [
  "@clerk/testing",
  "clerkSetup",
  "clerk.signIn",
  "Testing Token",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_ID",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
]) {
  if (!docs.includes(keep)) violations.push(`setup_doc_missing:${keep}`);
}
if (/Agent Tasks.*(を有効化|を有効にする|enable Agent Tasks)/i.test(docs)) {
  violations.push("setup_doc_must_not_instruct_enable_agent_tasks");
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
if (!/"@clerk\/testing"/.test(pkg)) {
  violations.push("package.json: missing @clerk/testing dependency");
}
if (!/"@playwright\/test"/.test(pkg)) {
  violations.push("package.json: missing @playwright/test peer for @clerk/testing");
}

const proxy = read("proxy.ts");
if (/ATLAS_SCREENSHOT_MODE/.test(proxy)) {
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

#!/usr/bin/env node
/**
 * CI quality gate for Gmail Production Live Adapter wiring.
 * Contract checks only — real API Live E2E is opt-in via GOOGLE_GMAIL_LIVE_E2E.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const registry = read("lib/automation-platform/execution/production-step-registry.ts");
if (!registry.includes('"google_gmail"')) {
  failures.push("Production registry must wire google_gmail");
}
if (!/wired = new Set<string>\(\[[\s\S]*google_gmail/.test(registry)) {
  failures.push("isLiveAdapterWired must include google_gmail");
}

const invoker = read("lib/automation-platform/execution/strict-step-invoker.ts");
if (!invoker.includes("invokeGmailLiveStep")) {
  failures.push("strictStepInvoker must call invokeGmailLiveStep");
}
const gmailCase = invoker.match(/case "gmail":\s*\{[\s\S]*?\n    case "/);
if (!gmailCase?.[0]?.includes("invokeGmailLiveStep")) {
  failures.push("gmail case must call invokeGmailLiveStep");
}
if (gmailCase?.[0]?.includes("invokeExternalGate")) {
  failures.push("gmail must not use invokeExternalGate mock fallback");
}

const adapter = read("lib/integrations/google/gmail/live/adapter.ts");
if (!adapter.includes("GMAIL_ADAPTER_MODE")) {
  failures.push("Gmail live adapter missing production mode constant");
}
if (/fake draftId|fake messageId|mockGmail|sandbox success/i.test(adapter)) {
  failures.push("adapter must not contain sandbox/fake success paths");
}

const crypto = read("lib/integrations/google/crypto.ts");
if (!crypto.includes("encryptGoogleSecret")) {
  failures.push("Google token encryption helper missing");
}

const oauth = read("lib/integrations/google/oauth.ts");
if (!oauth.includes("code_challenge")) {
  failures.push("Google OAuth must use PKCE");
}

const migration = read(
  "supabase/migrations/20260803_atlas_gmail_live_adapter.sql",
);
if (!migration.includes("atlas_gmail_external_actions")) {
  failures.push("Gmail external actions migration missing");
}

const evidence = read(
  "lib/automation-platform/execution/completion-evidence-v2.ts",
);
if (!evidence.includes("gmailResults") || !evidence.includes("GmailStepEvidence")) {
  failures.push("Completion Evidence must include Gmail fields");
}

if (process.env.GOOGLE_GMAIL_LIVE_E2E === "true") {
  console.log(
    "[gmail-live-adapter] GOOGLE_GMAIL_LIVE_E2E=true — run scripts/verify-gmail-live-e2e.mjs separately with secrets",
  );
} else {
  console.log(
    "[gmail-live-adapter] Live E2E skipped (set GOOGLE_GMAIL_LIVE_E2E=true with test account secrets)",
  );
}

if (failures.length > 0) {
  console.error("[gmail-live-adapter] FAIL");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[gmail-live-adapter] PASS — Production wiring + contract gates");

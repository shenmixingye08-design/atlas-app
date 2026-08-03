#!/usr/bin/env node
/**
 * CI quality gate for WordPress Production Live Adapter wiring.
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
if (!registry.includes('"wordpress"')) {
  failures.push("Production registry must wire wordpress");
}
if (!/wired = new Set<string>\(\[[\s\S]*wordpress/.test(registry)) {
  failures.push("isLiveAdapterWired must include wordpress");
}

const invoker = read("lib/automation-platform/execution/strict-step-invoker.ts");
if (!invoker.includes("invokeWordPressLiveStep")) {
  failures.push("strictStepInvoker must call invokeWordPressLiveStep");
}
const wpCase = invoker.match(/case "wordpress":\s*\{[\s\S]*?\n    case "/);
if (!wpCase?.[0]?.includes("invokeWordPressLiveStep")) {
  failures.push("wordpress case must call invokeWordPressLiveStep");
}
if (wpCase?.[0]?.includes("invokeExternalGate")) {
  failures.push("wordpress must not use invokeExternalGate mock fallback");
}

const adapter = read("lib/integrations/wordpress/live/adapter.ts");
if (!adapter.includes("WORDPRESS_ADAPTER_MODE")) {
  failures.push("WordPress live adapter missing production mode constant");
}
if (/fake postId|mockWordpress|sandbox success/i.test(adapter)) {
  failures.push("adapter must not contain sandbox/fake success paths");
}

const apiClient = read("lib/integrations/wordpress/api-client.ts");
if (!apiClient.includes("getWordPressPost")) {
  failures.push("api-client must include getWordPressPost");
}
if (!apiClient.includes("getWordPressMedia")) {
  failures.push("api-client must include getWordPressMedia");
}

const crypto = read("lib/integrations/wordpress/crypto.ts");
if (!crypto.includes("encryptWordPressSecret")) {
  failures.push("WordPress token encryption helper missing");
}

const migration = read(
  "supabase/migrations/20260803_atlas_wordpress_live_adapter.sql",
);
if (!migration.includes("atlas_wordpress_external_actions")) {
  failures.push("WordPress external actions migration missing");
}

const evidence = read(
  "lib/automation-platform/execution/completion-evidence-v2.ts",
);
if (
  !evidence.includes("wordpressResults") ||
  !evidence.includes("WordPressStepEvidence")
) {
  failures.push("Completion Evidence must include WordPress fields");
}

if (process.env.WORDPRESS_LIVE_E2E === "true") {
  console.log(
    "[wordpress-live-adapter] WORDPRESS_LIVE_E2E=true — run live E2E separately with secrets",
  );
} else {
  console.log(
    "[wordpress-live-adapter] Live E2E skipped (set WORDPRESS_LIVE_E2E=true with test site secrets)",
  );
}

if (failures.length > 0) {
  console.error("[wordpress-live-adapter] FAIL");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("[wordpress-live-adapter] PASS — Production wiring + contract gates");

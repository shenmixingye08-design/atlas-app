#!/usr/bin/env node
/**
 * CI gate: Dropbox Production Live Adapter must stay wired and fail-closed.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const requiredFiles = [
  "lib/integrations/dropbox/live/adapter.ts",
  "lib/automation-platform/execution/dropbox-step.ts",
  "lib/automation-platform/execution/dropbox-preflight.ts",
  "supabase/migrations/20260803_atlas_dropbox_live_adapter.sql",
];
for (const file of requiredFiles) {
  if (!existsSync(join(ROOT, file))) {
    violations.push(`missing required file: ${file}`);
  }
}

const registry = read(
  "lib/automation-platform/execution/production-step-registry.ts",
);
if (!registry.includes('type: "dropbox"')) {
  violations.push("production-step-registry missing dropbox step");
}
if (!/"dropbox"/.test(registry.match(/const wired = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? "")) {
  violations.push("isLiveAdapterWired must include dropbox");
}

const strict = read(
  "lib/automation-platform/execution/strict-step-invoker.ts",
);
if (!strict.includes("invokeDropboxUploadStep")) {
  violations.push("strict-step-invoker must call invokeDropboxUploadStep");
}
if (/case "dropbox":[\s\S]{0,200}invokeExternalGate/.test(strict)) {
  violations.push("dropbox must not use invokeExternalGate fallback");
}

const adapter = read("lib/integrations/dropbox/live/adapter.ts");
if (!adapter.includes("DROPBOX_ADAPTER_MODE")) {
  violations.push("adapter must declare production mode");
}
if (/ok:\s*true[\s\S]{0,120}(sandbox|mock)/i.test(adapter)) {
  violations.push("adapter must not return sandbox/mock success");
}
if (/fileId:\s*["']fake/i.test(adapter) || /pathDisplay:\s*["']https:\/\/example/i.test(adapter)) {
  violations.push("adapter must not use fake fileId/URL");
}

const config = read("lib/integrations/dropbox/config.ts");
if (!config.includes("isDropboxCredentialsEncryptionConfigured")) {
  violations.push("Dropbox config must expose encryption helpers");
}
if (!config.includes("files.content.write")) {
  violations.push("Dropbox scopes must include files.content.write");
}

const crypto = read("lib/integrations/dropbox/crypto.ts");
if (!crypto.includes("encryptDropboxSecret")) {
  violations.push("Dropbox token encryption helper missing");
}

const persistence = read("lib/integrations/dropbox/credential-persistence.ts");
if (!persistence.includes("access_token_ciphertext")) {
  violations.push("credential persistence must use ciphertext columns");
}
if (!persistence.includes("encryptDropboxSecret")) {
  violations.push("credential persistence must encrypt tokens");
}

const upload = read("lib/integrations/dropbox/live/upload.ts");
if (!upload.includes("dropboxContentHash")) {
  violations.push("upload must verify Dropbox content_hash algorithm");
}
if (!upload.includes("verification failed")) {
  violations.push("upload must fail verification explicitly");
}

if (violations.length > 0) {
  console.error("Dropbox Live Adapter CI gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("Dropbox Live Adapter CI gate PASS");

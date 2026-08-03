#!/usr/bin/env node
/**
 * CI gate: Google Drive Production Live Adapter must stay wired and fail-closed.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const requiredFiles = [
  "lib/integrations/google/drive/live/adapter.ts",
  "lib/automation-platform/execution/google-drive-step.ts",
  "lib/automation-platform/execution/google-drive-preflight.ts",
  "supabase/migrations/20260803_atlas_google_drive_live_adapter.sql",
];
for (const file of requiredFiles) {
  if (!existsSync(join(ROOT, file))) {
    violations.push(`missing required file: ${file}`);
  }
}

const registry = read(
  "lib/automation-platform/execution/production-step-registry.ts",
);
if (!registry.includes('type: "google_drive"')) {
  violations.push("production-step-registry missing google_drive step");
}
if (!/"google_drive"/.test(registry.match(/const wired = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? "")) {
  violations.push("isLiveAdapterWired must include google_drive");
}

const strict = read(
  "lib/automation-platform/execution/strict-step-invoker.ts",
);
if (!strict.includes("invokeGoogleDriveUploadStep")) {
  violations.push("strict-step-invoker must call invokeGoogleDriveUploadStep");
}
if (/case "google_drive":[\s\S]{0,200}invokeExternalGate/.test(strict)) {
  violations.push("google_drive must not use invokeExternalGate fallback");
}

const adapter = read("lib/integrations/google/drive/live/adapter.ts");
if (!adapter.includes("DRIVE_ADAPTER_MODE")) {
  violations.push("adapter must declare production mode");
}
if (/ok:\s*true[\s\S]{0,120}(sandbox|mock)/i.test(adapter)) {
  violations.push("adapter must not return sandbox/mock success");
}
if (/fileId:\s*["']fake/i.test(adapter) || /webViewLink:\s*["']https:\/\/example/i.test(adapter)) {
  violations.push("adapter must not use fake fileId/URL");
}

const scopes = read("lib/integrations/google/config.ts");
if (!scopes.includes("drive.file")) {
  violations.push("GOOGLE scopes must prefer drive.file");
}
if (/auth\/drive",\s*\]/.test(scopes) && !scopes.includes("GOOGLE_DRIVE_FULL_SCOPE")) {
  violations.push("full drive must not be the default account scope");
}

const crypto = read("lib/integrations/google/crypto.ts");
if (!crypto.includes("encryptGoogleSecret")) {
  violations.push("Google token encryption helper missing");
}

const persistence = read("lib/integrations/google/credential-persistence.ts");
if (!persistence.includes("access_token_ciphertext")) {
  violations.push("credential persistence must use ciphertext columns");
}
if (!persistence.includes("encryptGoogleSecret")) {
  violations.push("credential persistence must encrypt tokens");
}

const oauth = read("lib/integrations/google/oauth.ts");
if (!oauth.includes("code_challenge")) {
  violations.push("Google OAuth must use PKCE code_challenge");
}

if (violations.length > 0) {
  console.error("Google Drive Live Adapter CI gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("Google Drive Live Adapter CI gate PASS");

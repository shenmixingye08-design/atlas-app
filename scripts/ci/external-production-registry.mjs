#!/usr/bin/env node
/**
 * CI gate: External Production Registry cutover completeness.
 * - Production adapters must be wired
 * - Preparing/unsupported adapters must NOT be wired
 * - No sandbox/mock fallback in Production Live adapters
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const requiredFiles = [
  "lib/integrations/external-services/production-registry.ts",
  "lib/integrations/external-services/execution-result.ts",
  "lib/automation-platform/execution/external-completion-gate.ts",
  "lib/integrations/dropbox/live/adapter.ts",
  "lib/integrations/wordpress/live/adapter.ts",
  "lib/automation-platform/execution/dropbox-step.ts",
  "lib/automation-platform/execution/wordpress-step.ts",
];
for (const file of requiredFiles) {
  if (!existsSync(join(ROOT, file))) {
    violations.push(`missing required file: ${file}`);
  }
}

const registry = read(
  "lib/automation-platform/execution/production-step-registry.ts",
);
const wiredBlock =
  registry.match(/const wired = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
for (const id of [
  "google_drive",
  "google_gmail",
  "google_calendar",
  "dropbox",
  "wordpress",
]) {
  if (!wiredBlock.includes(`"${id}"`)) {
    violations.push(`isLiveAdapterWired must include ${id}`);
  }
}
for (const id of ["x", "slack", "discord", "notion", "line", "teams", "outlook"]) {
  if (wiredBlock.includes(`"${id}"`)) {
    violations.push(`isLiveAdapterWired must NOT include unfinished adapter ${id}`);
  }
}

const productionRegistry = read(
  "lib/integrations/external-services/production-registry.ts",
);
if (!productionRegistry.includes('availability: "preparing"')) {
  violations.push("production registry must mark unfinished services as preparing");
}
if (!productionRegistry.includes("PRODUCTION_WIRED_ADAPTER_IDS")) {
  violations.push("production registry must declare PRODUCTION_WIRED_ADAPTER_IDS");
}

const strict = read(
  "lib/automation-platform/execution/strict-step-invoker.ts",
);
if (!strict.includes("invokeDropboxUploadStep")) {
  violations.push("strict-step-invoker must call invokeDropboxUploadStep");
}
if (!strict.includes("invokeWordPressLiveStep")) {
  violations.push("strict-step-invoker must call invokeWordPressLiveStep");
}
if (/case "dropbox":[\s\S]{0,220}invokeExternalGate/.test(strict)) {
  violations.push("dropbox must not use invokeExternalGate fallback");
}
if (/case "wordpress":[\s\S]{0,220}invokeExternalGate/.test(strict)) {
  violations.push("wordpress must not use invokeExternalGate fallback");
}

const dropboxAdapter = read("lib/integrations/dropbox/live/adapter.ts");
if (/ok:\s*true[\s\S]{0,120}(sandbox|mock)/i.test(dropboxAdapter)) {
  violations.push("Dropbox adapter must not return sandbox/mock success");
}
if (/fileId:\s*["']fake/i.test(dropboxAdapter)) {
  violations.push("Dropbox adapter must not use fake fileId");
}

const wpAdapter = read("lib/integrations/wordpress/live/adapter.ts");
if (/ok:\s*true[\s\S]{0,120}(sandbox|mock)/i.test(wpAdapter)) {
  violations.push("WordPress adapter must not return sandbox/mock success");
}
if (!wpAdapter.includes("awaiting_approval") && !read("lib/automation-platform/execution/wordpress-step.ts").includes("awaiting_approval") && !read("lib/automation-platform/execution/wordpress-step.ts").includes("waiting_approval") && !read("lib/automation-platform/execution/wordpress-step.ts").includes("needsUserInput")) {
  violations.push("WordPress publish must gate on approval");
}

const executor = read("lib/automation-platform/execution/executor.ts");
if (!executor.includes("evaluateExternalCompletionGate")) {
  violations.push("executor must enforce External Completion Gate");
}

const cryptoDropbox = read("lib/integrations/dropbox/crypto.ts");
if (!cryptoDropbox.includes("encryptDropboxSecret")) {
  violations.push("Dropbox token encryption helper missing");
}

if (violations.length > 0) {
  console.error("External Production Registry CI gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("External Production Registry CI gate PASS");

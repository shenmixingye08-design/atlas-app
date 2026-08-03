#!/usr/bin/env node
/**
 * CI gate + artifact presence check for Phase 3-1 External Live Adapter Audit.
 * Prevents regression: Production V2 must not gain sandbox/mock success fallbacks.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

// --- Gate 1: Production V2 external adapters remain unwired-or-explicit ---
const registry = read(
  "lib/automation-platform/execution/production-step-registry.ts",
);
if (!registry.includes("isLiveAdapterWired")) {
  violations.push("isLiveAdapterWired missing from production-step-registry");
}
if (!registry.includes("openai_vision")) {
  violations.push("internal vision adapters missing from wired set");
}
// External OAuth adapters must not be silently present in wired set without audit update.
for (const adapter of [
  '"google_gmail"',
  '"dropbox"',
  '"wordpress"',
  '"google_calendar"',
]) {
  // Allow listing as requiredAdapter, but wired Set must not include them unless
  // Phase 3-2 intentionally wires them. Detect wired Set body.
  const wiredMatch = registry.match(
    /const wired = new Set<string>\(\[([\s\S]*?)\]\)/,
  );
  if (wiredMatch && wiredMatch[1].includes(adapter)) {
    violations.push(
      `External adapter ${adapter} appears in isLiveAdapterWired Set — update Phase 3-1 audit/tests before wiring`,
    );
  }
}

// --- Gate 2: strict invoker must fail closed for missing adapters ---
const strict = read(
  "lib/automation-platform/execution/strict-step-invoker.ts",
);
if (!strict.includes("live_adapter_missing")) {
  violations.push("strict-step-invoker missing live_adapter_missing");
}
if (!strict.includes("invokeExternalGate")) {
  violations.push("strict-step-invoker missing invokeExternalGate");
}
if (/return\s*\{\s*ok:\s*true[\s\S]{0,200}live_adapter/i.test(strict)) {
  violations.push("strict-step-invoker must not succeed on live_adapter paths");
}

// --- Gate 3: stub/mock connect helpers must remain labeled stubs ---
const stub = read("lib/integrations/connector-types.ts");
if (!stub.includes("Stub: simulates connect")) {
  violations.push("stubConnectService documentation/label removed");
}
if (!stub.includes('status: "connected"')) {
  violations.push("stubConnectService connected status missing — unexpected change");
}

// --- Gate 4: Dropbox must not silently claim Supabase durability ---
const durable = read("lib/integrations/external-services/durable.ts");
if (!durable.includes('SUPABASE_BACKED_SERVICE_IDS')) {
  violations.push("SUPABASE_BACKED_SERVICE_IDS missing");
}
const backedMatch = durable.match(
  /SUPABASE_BACKED_SERVICE_IDS = new Set\(\[([\s\S]*?)\]\)/,
);
if (backedMatch && /["']dropbox["']/.test(backedMatch[1])) {
  // If Dropbox becomes durable, Phase 3-1 inventory must be updated (allowed),
  // but the audit module must still exist.
  const inventory = read("lib/integrations/audit/inventory.ts");
  if (!inventory.includes('serviceId: "dropbox"')) {
    violations.push("Dropbox durable change requires inventory update");
  }
} else {
  // Current expected state: dropbox NOT durable
  const inventory = read("lib/integrations/audit/inventory.ts");
  if (!inventory.includes("process_memory")) {
    violations.push(
      "Dropbox process_memory token storage must remain visible in audit inventory until fixed",
    );
  }
}

// --- Gate 5: audit module present ---
const auditFiles = [
  "lib/integrations/audit/inventory.ts",
  "lib/integrations/audit/registry-audit.ts",
  "lib/integrations/audit/oauth-audit.ts",
  "lib/integrations/audit/token-storage-audit.ts",
  "lib/integrations/audit/risk-register.ts",
  "lib/integrations/audit/external-adapter-audit.test.ts",
];
for (const file of auditFiles) {
  if (!existsSync(join(ROOT, file))) {
    violations.push(`missing audit file: ${file}`);
  }
}

// --- Gate 6: no Production Live classification for stubConnect services in inventory ---
const inventory = read("lib/integrations/audit/inventory.ts");
if (/serviceId:\s*"notion"[\s\S]{0,200}classification:\s*"Production Live"/.test(inventory)) {
  violations.push("Notion must not be classified Production Live");
}
if (/serviceId:\s*"slack"[\s\S]{0,200}classification:\s*"Production Live"/.test(inventory)) {
  violations.push("Slack must not be classified Production Live");
}

// --- Gate 7: artifacts (written by vitest audit suite) ---
const requiredArtifacts = [
  "artifacts/external-adapter-inventory.json",
  "artifacts/integration-registry-audit.json",
  "artifacts/oauth-security-audit.json",
  "artifacts/token-storage-audit.json",
  "artifacts/integration-risk-register.json",
  "docs/development/phase-3-2-targets.md",
];

const missingArtifacts = requiredArtifacts.filter(
  (rel) => !existsSync(join(ROOT, rel)),
);
if (missingArtifacts.length > 0) {
  violations.push(
    `CI artifacts missing (run audit vitest first): ${missingArtifacts.join(", ")}`,
  );
} else {
  // Structural checks on inventory artifact
  const inv = JSON.parse(
    read("artifacts/external-adapter-inventory.json"),
  );
  if (!inv.byClassification) {
    violations.push("inventory artifact missing byClassification");
  }
  if ((inv.byClassification?.productionLive ?? []).includes("slack")) {
    violations.push("artifact classifies slack as Production Live");
  }
  if ((inv.byClassification?.productionLive ?? []).includes("notion")) {
    violations.push("artifact classifies notion as Production Live");
  }
  const risks = JSON.parse(read("artifacts/integration-risk-register.json"));
  if (!Array.isArray(risks.p0) || risks.p0.length === 0) {
    violations.push("risk register artifact missing P0 entries");
  }
}

// --- Gate 8: forbid fake success patterns in new audit diagnostics path ---
for (const file of walk(join(ROOT, "lib/integrations/audit"))) {
  if (file.endsWith(".test.ts")) continue;
  const source = readFileSync(file, "utf8");
  if (/ok:\s*true[\s\S]{0,80}sandbox/i.test(source)) {
    violations.push(`${file}: sandbox success pattern forbidden`);
  }
}

if (violations.length > 0) {
  console.error("External adapter audit CI gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("External adapter audit CI gate PASS");
for (const rel of requiredArtifacts) {
  if (existsSync(join(ROOT, rel))) console.log(` artifact: ${rel}`);
}

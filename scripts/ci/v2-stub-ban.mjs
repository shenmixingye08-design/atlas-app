#!/usr/bin/env node
/**
 * CI gate: Production V2 paths must not contain stub/mock success patterns.
 * Fail closed — exits 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [
  "lib/automation-platform/execution",
  "lib/automation-platform/service",
  "lib/automation-platform/step-registry",
];

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
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const violations = [];

for (const rel of SCAN_DIRS) {
  const abs = join(ROOT, rel);
  for (const file of walk(abs)) {
    const base = file.split("/").pop() ?? file;
    if (base.endsWith(".test.ts")) continue;
    const source = readFileSync(file, "utf8");

    if (
      base !== "step-invoker.ts" &&
      /defaultStepInvoker\s*\(/.test(source)
    ) {
      violations.push(
        `${file}: defaultStepInvoker must not be called from Production paths`,
      );
    }

    if (/ok:\s*true[\s\S]{0,80}url:\s*null/.test(source)) {
      violations.push(
        `${file}: ok:true with url:null is forbidden in Production invokers`,
      );
    }

    if (
      /return\s*\{[\s\S]{0,200}ok:\s*true[\s\S]{0,200}(sandbox|simulated|demo success)/i.test(
        source,
      )
    ) {
      violations.push(`${file}: sandbox/simulated success return detected`);
    }
  }
}

const registryPath = join(
  ROOT,
  "lib/automation-platform/execution/production-step-registry.ts",
);
const registry = readFileSync(registryPath, "utf8");
for (const required of [
  "word_generate",
  "excel_generate",
  "pdf_generate",
  "powerpoint_generate",
  "vision_analysis",
  "ocr",
  "notify",
]) {
  if (!registry.includes(`type: "${required}"`)) {
    violations.push(`production-step-registry missing ${required}`);
  }
}

const invoker = readFileSync(
  join(ROOT, "lib/automation-platform/execution/step-invoker.ts"),
  "utf8",
);
if (!invoker.includes("step_not_implemented")) {
  violations.push("defaultStepInvoker must return step_not_implemented");
}
if (/ok:\s*true/.test(invoker)) {
  violations.push("step-invoker.ts must not contain ok: true");
}

const strict = readFileSync(
  join(ROOT, "lib/automation-platform/execution/strict-step-invoker.ts"),
  "utf8",
);
if (strict.includes("defaultStepInvoker")) {
  violations.push("strict-step-invoker must not call defaultStepInvoker");
}
if (!strict.includes("invokeLiveAdapterForStep")) {
  violations.push(
    "strict-step-invoker must route externals via invokeLiveAdapterForStep",
  );
}
const liveAdaptersIndex = readFileSync(
  join(ROOT, "lib/live-adapters/index.ts"),
  "utf8",
);
if (!liveAdaptersIndex.includes("invokeLiveAdapterForStep")) {
  violations.push("lib/live-adapters must export invokeLiveAdapterForStep");
}
const productionRegistry = readFileSync(
  join(ROOT, "lib/live-adapters/registry/production.ts"),
  "utf8",
);
if (!/gmailLiveAdapter|xLiveAdapter/.test(productionRegistry)) {
  violations.push("production Live Adapter registry must include gmail/x");
}

const notify = readFileSync(
  join(ROOT, "lib/automation-platform/execution/notify.ts"),
  "utf8",
);
const partialIdx = notify.indexOf("partially_succeeded: {");
if (partialIdx < 0) {
  violations.push("partially_succeeded notification entry missing");
} else {
  const slice = notify.slice(partialIdx, partialIdx + 400);
  if (/type:\s*"completed"/.test(slice)) {
    violations.push(
      "partially_succeeded must not use notification type completed",
    );
  }
  if (!/type:\s*"awaiting_review"/.test(slice)) {
    violations.push(
      "partially_succeeded must use awaiting_review notification type",
    );
  }
}

const completion = readFileSync(
  join(ROOT, "lib/automation-platform/execution/run-completion.ts"),
  "utf8",
);
if (!completion.includes("export function evaluateRunCompletion")) {
  violations.push("evaluateRunCompletion must exist");
}

if (violations.length > 0) {
  console.error("V2 stub-ban CI gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("V2 stub-ban CI gate PASS");

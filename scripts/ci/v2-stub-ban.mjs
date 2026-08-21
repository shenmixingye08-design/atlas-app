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

/** Brace-matched function body starting at `function name(`. */
function extractNamedFunction(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!match) return null;
  const braceAt = source.indexOf("{", match.index);
  if (braceAt < 0) return null;
  let depth = 0;
  for (let i = braceAt; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, i + 1);
    }
  }
  return null;
}

function resolveSwitchOrIfReturn(fnSource, eventName) {
  const caseRe = new RegExp(`case\\s+["']${eventName}["']\\s*:`);
  const caseMatch = caseRe.exec(fnSource);
  if (caseMatch) {
    const after = fnSource
      .slice(caseMatch.index)
      .replace(/^(?:\s*case\s+["'][^"']+["']\s*:\s*)+/, "");
    const ret = /^\s*return\s+["']([^"']+)["']/.exec(after);
    if (ret) return ret[1];
  }

  const ifRe = new RegExp(
    `(?:if|else\\s+if)\\s*\\(\\s*(?:event\\s*===\\s*["']${eventName}["']|["']${eventName}["']\\s*===\\s*event)\\s*\\)\\s*(?:\\{\\s*return\\s*["']([^"']+)["']|return\\s*["']([^"']+)["'])`,
  );
  const ifMatch = ifRe.exec(fnSource);
  if (ifMatch) return ifMatch[1] || ifMatch[2];
  return null;
}

function resolveObjectLiteralNotificationType(source, eventName) {
  const block = new RegExp(
    `${eventName}\\s*:\\s*\\{([\\s\\S]{0,400}?)\\}`,
  ).exec(source);
  if (block) {
    const type = /\btype\s*:\s*["']([^"']+)["']/.exec(block[1]);
    if (type) return type[1];
  }
  const scalar = new RegExp(`${eventName}\\s*:\\s*["']([^"']+)["']`).exec(
    source,
  );
  return scalar ? scalar[1] : null;
}

/**
 * Resolve notification type for partially_succeeded from switch / if / object
 * literal. Do not require one syntax. Meaning is unchanged: awaiting_review,
 * never completed.
 */
function resolvePartialSucceededNotificationType(source) {
  const fn = extractNamedFunction(source, "notificationTypeFor");
  if (fn) {
    const fromFn = resolveSwitchOrIfReturn(fn, "partially_succeeded");
    if (fromFn) return fromFn;
  }
  return resolveObjectLiteralNotificationType(source, "partially_succeeded");
}

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
if (!strict.includes("live_adapter_missing")) {
  violations.push("strict-step-invoker must fail with live_adapter_missing");
}

const notify = readFileSync(
  join(ROOT, "lib/automation-platform/execution/notify.ts"),
  "utf8",
);
const partialType = resolvePartialSucceededNotificationType(notify);
if (!partialType) {
  violations.push("partially_succeeded notification entry missing");
} else {
  if (partialType === "completed") {
    violations.push(
      "partially_succeeded must not use notification type completed",
    );
  }
  if (partialType !== "awaiting_review") {
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

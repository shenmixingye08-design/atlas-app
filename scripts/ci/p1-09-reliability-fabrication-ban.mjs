#!/usr/bin/env node
/**
 * CI gate (P1-09): ban fabricated reliability success markers.
 * Fails Quality Gate if hard-coded post/timeout success or invented post_x
 * markers appear outside the real X post client.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

// 1) Hard-coded gate rates in reliability harnesses
const harnessFiles = [
  "lib/reliability/e2e-1000.test.ts",
  "scripts/reliability-e2e-1000.ts",
  "scripts/reliability-e2e-1000.mjs",
];
for (const rel of harnessFiles) {
  let src;
  try {
    src = read(rel);
  } catch {
    continue;
  }
  if (/postSuccessRate\s*:\s*1\b/.test(src)) {
    violations.push(`${rel}: hard-coded postSuccessRate: 1 is forbidden`);
  }
  if (/timeoutRate\s*:\s*0\b/.test(src)) {
    violations.push(`${rel}: hard-coded timeoutRate: 0 is forbidden`);
  }
  if (/recordReliabilityEvent\(\s*["']post_x["']\s*,\s*["']success["']\s*\)/.test(src)) {
    violations.push(
      `${rel}: inventing recordReliabilityEvent("post_x","success") is forbidden`,
    );
  }
  if (/scoreHint:\s*gatePass\s*\?\s*96/.test(src)) {
    violations.push(`${rel}: cosmetic scoreHint inflate (96) is forbidden`);
  }
}

// 2) Invented post_x success outside the real X client
const allowedPostXSuccess = new Set([
  join(ROOT, "lib/integrations/x/post/api-client.ts"),
]);
const scanRoots = [join(ROOT, "lib"), join(ROOT, "scripts")].flatMap((dir) =>
  walk(dir),
);
for (const file of scanRoots) {
  if (allowedPostXSuccess.has(file)) continue;
  // Ban script itself contains the pattern as a detector — skip CI scanners.
  if (file.includes(`${join("scripts", "ci")}`)) continue;
  const src = readFileSync(file, "utf8");
  if (
    /recordReliabilityEvent\(\s*["']post_x["']\s*,\s*["']success["']\s*\)/.test(
      src,
    )
  ) {
    violations.push(
      `${relative(ROOT, file)}: post_x success may only be recorded in lib/integrations/x/post/api-client.ts`,
    );
  }
}

// 3) Self-fulfilling progress trail push (p06 historical fabrication)
const p06 = read("lib/reliability/p06-e2e-ops-verification.test.ts");
if (/function assertProgressStages[\s\S]*?trail\.push\(msg\)/.test(p06)) {
  violations.push(
    "lib/reliability/p06-e2e-ops-verification.test.ts: assertProgressStages must not push expected messages into trail",
  );
}

// 4) Integrity suite must exist and be in default vitest include
const integrity = "lib/reliability/p1-09-integrity.test.ts";
try {
  read(integrity);
} catch {
  violations.push(`${integrity}: missing P1-09 integrity suite`);
}
const vitestCfg = read("vitest.config.ts");
if (/p1-09-integrity\.test\.ts/.test(vitestCfg) && /exclude:[\s\S]*p1-09-integrity/.test(vitestCfg)) {
  violations.push("vitest.config.ts: must not exclude p1-09-integrity.test.ts");
}

if (violations.length > 0) {
  console.error("P1-09 reliability fabrication ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P1-09 reliability fabrication ban OK");

#!/usr/bin/env node
/**
 * CI gate (P2-02): non-Word content quality gate must stay unified + wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/deliverables/content-quality.ts",
  "lib/deliverables/content-quality-gate-probe.ts",
  "lib/deliverables/p2-02-nonword-quality-gate.test.ts",
  "app/api/health/content-quality-gate/route.ts",
  "docs/development/feature-evaluation-p2-02-nonword-quality-gate.md",
  ".github/workflows/verify-content-quality-gate-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const cq = read("lib/deliverables/content-quality.ts");
for (const marker of [
  "validateCommonSourceContent",
  "validateFormatSpecificSourceContent",
  "validateDeliverableSourceContent",
  "generateQualityDeliverableContent",
  "xlsx_insufficient_structure",
  "pptx_insufficient_structure",
]) {
  if (!cq.includes(marker)) {
    violations.push(`content-quality.ts: missing ${marker}`);
  }
}

const engine = read("lib/deliverables/engine.ts");
if (!/generateQualityDeliverableContent/.test(engine)) {
  violations.push("engine.ts: must call generateQualityDeliverableContent");
}
if (!/P2-02/.test(engine)) {
  violations.push("engine.ts: must document P2-02 non-Word gate");
}
if (!/!needsWord/.test(engine)) {
  violations.push("engine.ts: non-Word path marker missing");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p2-02-nonword-quality-gate-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-02 ban");
}
if (!/p2-02-nonword-quality-gate/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-02 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/content-quality-gate/.test(publicRoutes)) {
  violations.push("public-routes.ts: content-quality-gate must be public");
}

const contracts = read("lib/api-contracts/critical-contracts.ts");
if (!/health\.content-quality-gate/.test(contracts)) {
  violations.push("critical-contracts.ts: must include content-quality-gate");
}

const pkg = read("package.json");
if (!/"test:content-quality-gate"/.test(pkg)) {
  violations.push("package.json: must define test:content-quality-gate");
}

if (violations.length) {
  console.error("P2-02 non-Word quality gate ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P2-02 non-Word quality gate ban OK");

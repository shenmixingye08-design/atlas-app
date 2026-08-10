#!/usr/bin/env node
/**
 * CI gate (P3-03): Advanced Excel pivot + chart must stay wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/deliverables/excel-advanced/pivot.ts",
  "lib/deliverables/excel-advanced/chart-ooxml.ts",
  "lib/deliverables/excel-advanced/enhance.ts",
  "lib/deliverables/excel-advanced/excel-advanced-probe.ts",
  "lib/deliverables/excel-advanced/p3-03-advanced-excel.test.ts",
  "app/api/health/excel-advanced/route.ts",
  "docs/development/feature-evaluation-p3-03-advanced-excel.md",
  ".github/workflows/verify-excel-advanced-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const generator = read("lib/deliverables/generators/xlsx-generator.ts");
for (const marker of [
  "enhanceWorkbookWithAdvancedExcel",
  "includeChart",
  "includePivot",
]) {
  if (!generator.includes(marker)) {
    violations.push(`xlsx-generator.ts: missing ${marker}`);
  }
}

const deliverableStep = read(
  "lib/automation-platform/execution/deliverable-step.ts",
);
if (!/includeChart/.test(deliverableStep)) {
  violations.push("deliverable-step.ts: must wire includeChart");
}

const chart = read("lib/deliverables/excel-advanced/chart-ooxml.ts");
for (const marker of [
  "xl/charts/chart1.xml",
  "xl/drawings/drawing1.xml",
  "injectPivotChartIntoXlsx",
]) {
  if (!chart.includes(marker)) {
    violations.push(`chart-ooxml.ts: missing ${marker}`);
  }
}

const probe = read("lib/deliverables/excel-advanced/excel-advanced-probe.ts");
for (const marker of [
  "pivotSheetOk",
  "chartPartOk",
  "drawingPartOk",
  "optOutOk",
  "retrySafe",
  "idempotent",
  "multiInstanceSafe",
  "memoryNotSot",
  "failClosed",
]) {
  if (!probe.includes(marker)) {
    violations.push(`excel-advanced-probe.ts: missing ${marker}`);
  }
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p3-03-advanced-excel-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-03 ban");
}
if (!/test:excel-advanced/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-03 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/excel-advanced/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/excel-advanced");
}

const evalDoc = read(
  "docs/development/feature-evaluation-p3-03-advanced-excel.md",
);
if (!/高度なExcel（ピボット\/グラフ）/.test(evalDoc) || !/#22/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite 高度なExcel #22");
}

if (violations.length) {
  console.error("P3-03 advanced excel ban failed:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("p3_03_advanced_excel_ban=pass");

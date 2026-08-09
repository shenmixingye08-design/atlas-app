#!/usr/bin/env node
/**
 * CI gate (P1-01): ban silent PDF table omission.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const generator = "lib/deliverables/generators/pdf-generator.ts";
const probe = "lib/deliverables/pdf-table-probe.ts";
const integrity = "lib/deliverables/pdf-table-p1-01.test.ts";
const route = "app/api/health/pdf-tables/route.ts";

for (const f of [generator, probe, integrity, route]) {
  if (!existsSync(join(root, f))) {
    violations.push(`${f}: missing`);
  }
}

const genSrc = read(generator);
if (!/case\s+["']table["']/.test(genSrc)) {
  violations.push(`${generator}: must draw case "table"`);
}
if (!/pdf_tables_omitted/.test(genSrc)) {
  violations.push(`${generator}: must fail-closed with pdf_tables_omitted`);
}
if (/case\s+["']table["'][\s\S]{0,80}break;\s*\}/.test(genSrc) && !/renderedTableCount/.test(genSrc)) {
  violations.push(`${generator}: table case must increment renderedTableCount`);
}

const probeSrc = read(probe);
if (!/generatePdfWithTableStats|markersFound/.test(probeSrc)) {
  violations.push(`${probe}: must verify rendered markers`);
}

const testSrc = read(integrity);
if (!/pdf_tables_omitted|TBLCELL_/.test(testSrc)) {
  violations.push(`${integrity}: missing fail-closed / cell marker coverage`);
}

if (violations.length) {
  console.error("P1-01 PDF table ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P1-01 PDF table ban OK");

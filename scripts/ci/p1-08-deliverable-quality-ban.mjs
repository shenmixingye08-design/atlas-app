#!/usr/bin/env node
/**
 * CI gate (P1-08): ban Excel sidecar currency/date, PPT gray placeholders,
 * and Word text-only image placeholders.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const xlsx = "lib/deliverables/generators/xlsx-generator.ts";
const pptx = "lib/deliverables/generators/pptx-generator.ts";
const docx = "lib/deliverables/generators/docx-renderer.ts";
const probe = "lib/deliverables/deliverable-quality-probe.ts";
const integrity = "lib/deliverables/p1-08-deliverable-quality.test.ts";
const route = "app/api/health/deliverable-quality/route.ts";

for (const f of [xlsx, pptx, docx, probe, integrity, route]) {
  if (!existsSync(join(root, f))) {
    violations.push(`${f}: missing`);
  }
}

const xlsxSrc = read(xlsx);
if (!/\.numFmt\s*=/.test(xlsxSrc)) {
  violations.push(`${xlsx}: must assign cell.numFmt`);
}
if (/通貨:\$\{|通貨:.*currency|日付:\$\{/.test(xlsxSrc)) {
  violations.push(`${xlsx}: currency/date sidecar columns are banned`);
}

const pptxSrc = read(pptx);
if (!/\.addTable\s*\(/.test(pptxSrc)) {
  violations.push(`${pptx}: must use addTable for real tables`);
}
if (!/\.addImage\s*\(/.test(pptxSrc)) {
  violations.push(`${pptx}: must use addImage for real images`);
}
if (/addImagePlaceholder/.test(pptxSrc)) {
  violations.push(`${pptx}: gray image placeholder helper must not remain`);
}
if (!/pptx_tables_omitted|pptx_images_omitted/.test(pptxSrc)) {
  violations.push(`${pptx}: must fail-closed on table/image omission`);
}

const docxSrc = read(docx);
if (!/ImageRun/.test(docxSrc)) {
  violations.push(`${docx}: must use ImageRun for Word image embed`);
}
if (/画像プレースホルダ/.test(docxSrc) && !/ImageRun/.test(docxSrc)) {
  violations.push(`${docx}: text-only image placeholder remains`);
}

const probeSrc = read(probe);
if (!/excelNumFmtOk|pptxTableOk|wordImageEmbedOk/.test(probeSrc)) {
  violations.push(`${probe}: must expose P1-08 acceptance flags`);
}

const testSrc = read(integrity);
if (!/excelNumFmtOk|pptx_tables_omitted|ImageRun|numFmt/.test(testSrc)) {
  violations.push(`${integrity}: missing P1-08 coverage markers`);
}

if (violations.length) {
  console.error("P1-08 deliverable quality ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P1-08 deliverable quality ban OK");

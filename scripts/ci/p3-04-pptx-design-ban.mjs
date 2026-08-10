#!/usr/bin/env node
/**
 * CI gate (P3-04): PPT design templates must stay wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/deliverables/pptx-templates/registry.ts",
  "lib/deliverables/pptx-templates/resolve.ts",
  "lib/deliverables/pptx-templates/layouts.ts",
  "lib/deliverables/pptx-templates/theme-ooxml.ts",
  "lib/deliverables/pptx-templates/pptx-design-probe.ts",
  "lib/deliverables/pptx-templates/p3-04-pptx-design.test.ts",
  "app/api/health/pptx-design/route.ts",
  "docs/development/feature-evaluation-p3-04-pptx-design-templates.md",
  ".github/workflows/verify-pptx-design-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const generator = read("lib/deliverables/generators/pptx-generator.ts");
for (const marker of [
  "resolvePptxDesign",
  "injectPptxThemeAccent",
  "paintTitleSlide",
  "slideCountHint",
]) {
  if (!generator.includes(marker)) {
    violations.push(`pptx-generator.ts: missing ${marker}`);
  }
}

const deliverableStep = read(
  "lib/automation-platform/execution/deliverable-step.ts",
);
if (!/slideCountHint/.test(deliverableStep) || !/powerpoint:/.test(deliverableStep)) {
  violations.push("deliverable-step.ts: must wire powerpoint theme/slideCountHint");
}

const registry = read("lib/deliverables/pptx-templates/registry.ts");
for (const id of ["business", "simple", "proposal", "pitch", "report"]) {
  if (!registry.includes(`id: "${id}"`)) {
    violations.push(`registry.ts: missing template ${id}`);
  }
}

const probe = read("lib/deliverables/pptx-templates/pptx-design-probe.ts");
for (const marker of [
  "templateRegistryOk",
  "distinctLayoutsOk",
  "themeAccentOk",
  "automationThemeWiredOk",
  "slideCountHintOk",
  "retrySafe",
  "idempotent",
  "multiInstanceSafe",
  "memoryNotSot",
  "failClosed",
]) {
  if (!probe.includes(marker)) {
    violations.push(`pptx-design-probe.ts: missing ${marker}`);
  }
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p3-04-pptx-design-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-04 ban");
}
if (!/test:pptx-design/.test(qg)) {
  violations.push("quality-gate.yml: must run p3-04 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/pptx-design/.test(publicRoutes)) {
  violations.push("public-routes.ts: must allow /api/health/pptx-design");
}

const evalDoc = read(
  "docs/development/feature-evaluation-p3-04-pptx-design-templates.md",
);
if (!/PPTデザインテンプレ本格化/.test(evalDoc) || !/#23/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite PPTデザインテンプレ #23");
}

if (violations.length) {
  console.error("P3-04 pptx design ban failed:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("p3_04_pptx_design_ban=pass");

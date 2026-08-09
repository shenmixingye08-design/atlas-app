#!/usr/bin/env node
/**
 * CI gate (P2-05): OCR dedicated-engine evaluation must stay wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/ocr-engine/evaluate.ts",
  "lib/ocr-engine/ocr-engine-probe.ts",
  "lib/ocr-engine/store.ts",
  "lib/ocr-engine/p2-05-ocr-engine.test.ts",
  "lib/ocr-engine/engines/document-ai.ts",
  "lib/ocr-engine/engines/openai-vision-ocr.ts",
  "app/api/health/ocr-engine/route.ts",
  "docs/development/feature-evaluation-p2-05-ocr-engine.md",
  "supabase/migrations/20260809_p2_05_ocr_engine_evaluations.sql",
  ".github/workflows/verify-ocr-engine-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const evaluate = read("lib/ocr-engine/evaluate.ts");
for (const marker of [
  "runOcrEngineEvaluation",
  "dedicatedEngineRequired",
  "document_ai",
  "openai_vision_ocr",
  "P2-05",
]) {
  if (!evaluate.includes(marker)) {
    violations.push(`evaluate.ts: missing ${marker}`);
  }
}

const docAi = read("lib/ocr-engine/engines/document-ai.ts");
if (!/softSuccess:\s*false/.test(docAi)) {
  violations.push("document-ai.ts: must never soft-succeed");
}
if (!/document_ai_not_configured/.test(docAi)) {
  violations.push("document-ai.ts: must fail-closed when unconfigured");
}

const probe = read("lib/ocr-engine/ocr-engine-probe.ts");
for (const marker of [
  "restartDurableOk",
  "retrySafe",
  "multiInstanceSafe",
  "memoryNotSot",
  "ownershipIsolationOk",
]) {
  if (!probe.includes(marker)) {
    violations.push(`ocr-engine-probe.ts: missing ${marker}`);
  }
}

const visionStep = read("lib/automation-platform/execution/vision-step.ts");
if (!/resolveActiveOcrPolicy|OCR_ENGINE_POLICY|P2-05/.test(visionStep)) {
  violations.push("vision-step.ts: must honor P2-05 OCR engine policy");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p2-05-ocr-engine-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-05 ban");
}
if (!/test:ocr-engine/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-05 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/ocr-engine/.test(publicRoutes)) {
  violations.push("public-routes.ts: ocr-engine must be public");
}

const contracts = read("lib/api-contracts/critical-contracts.ts");
if (!/health\.ocr-engine/.test(contracts)) {
  violations.push("critical-contracts.ts: must include ocr-engine");
}

const pkg = read("package.json");
if (!/"test:ocr-engine"/.test(pkg)) {
  violations.push("package.json: must define test:ocr-engine");
}

const evalDoc = read("docs/development/feature-evaluation-p2-05-ocr-engine.md");
if (!/公開後項目 #19|項目 19/.test(evalDoc)) {
  violations.push("feature-evaluation: must cite 47/100 #19");
}
if (!/OCR専用エンジン評価/.test(evalDoc)) {
  violations.push("feature-evaluation: must use official P2-05 name");
}
if (!/必要な場合のみ/.test(evalDoc)) {
  violations.push("feature-evaluation: must keep ※必要な場合のみ constraint");
}

if (violations.length) {
  console.error("P2-05 OCR engine evaluation ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P2-05 OCR engine evaluation ban OK");

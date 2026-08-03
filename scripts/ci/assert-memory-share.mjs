#!/usr/bin/env node
/**
 * CI: Memory share — ban parallel resolve SoT in surface adapters.
 * PersonalizationContext / loadMemory must be the only path.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failed = 0;

const ADAPTER_DIR = join(ROOT, "lib/memory-apply");
const ADAPTER_FILES = [
  "chat.ts",
  "planner.ts",
  "automation.ts",
  "vision.ts",
  "ocr.ts",
  "deliverables.ts",
  "regenerate.ts",
  "scheduler.ts",
];

for (const file of ADAPTER_FILES) {
  const text = readFileSync(join(ADAPTER_DIR, file), "utf8");
  if (/resolveForContext\s*\(/.test(text)) {
    console.error(
      `FAIL: ${file} still calls resolveForContext — must use MemoryApply/loadMemory`,
    );
    failed += 1;
  }
  if (!/MemoryApply|loadMemory/.test(text)) {
    console.error(`FAIL: ${file} must call MemoryApply or loadMemory`);
    failed += 1;
  }
}

const pipeline = readFileSync(join(ADAPTER_DIR, "pipeline.ts"), "utf8");
for (const sym of ["loadMemory", "saveMemory", "assertMemoryLoadedForAi"]) {
  if (!pipeline.includes(`export async function ${sym}`) && !pipeline.includes(`export function ${sym}`)) {
    // loadMemory/saveMemory are async; assert is sync
    if (sym === "assertMemoryLoadedForAi") {
      if (!pipeline.includes(`export function ${sym}`)) {
        console.error(`FAIL: pipeline.ts missing ${sym}`);
        failed += 1;
      }
    } else if (!pipeline.includes(`export async function ${sym}`)) {
      console.error(`FAIL: pipeline.ts missing ${sym}`);
      failed += 1;
    }
  }
}

const ctx = readFileSync(join(ADAPTER_DIR, "personalization-context.ts"), "utf8");
if (!ctx.includes("memoryVersion")) {
  console.error("FAIL: PersonalizationContext must include memoryVersion");
  failed += 1;
}

const types = readFileSync(join(ADAPTER_DIR, "types.ts"), "utf8");
for (const ch of [
  "chat",
  "commander",
  "planner",
  "automation",
  "scheduler",
  "vision",
  "ocr",
  "word",
  "excel",
  "pdf",
  "powerpoint",
  "regenerate",
  "notification",
]) {
  if (!types.includes(`"${ch}"`)) {
    console.error(`FAIL: AI_SECRETARY_MEMORY_CHANNELS missing ${ch}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`assert-memory-share: ${failed} violation(s)`);
  process.exit(1);
}
console.log("assert-memory-share CI gate PASS");

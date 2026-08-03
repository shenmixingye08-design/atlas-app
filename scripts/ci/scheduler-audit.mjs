#!/usr/bin/env node
/**
 * Phase 2-1 Scheduler Production Audit — CI drift gate + artifact presence check.
 *
 * - Fails if vercel.json cron drifts from lib/scheduler-audit/inventory.ts constants
 * - Does NOT fail the pipeline for pre-existing P0 findings in the risk register
 * - Expects artifacts under artifacts/scheduler-audit-2-1 (written by vitest)
 */

import { readFileSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const inventoryPath = join(root, "lib/scheduler-audit/inventory.ts");
const vercelPath = join(root, "vercel.json");
const artifactDir = join(root, "artifacts/scheduler-audit-2-1");
const cursorDir = "/opt/cursor/artifacts/scheduler-audit-2-1";

const REQUIRED_ARTIFACTS = [
  "scheduler-audit.json",
  "cron-inventory.json",
  "scheduler-secrets-audit.json",
  "next-run-at-paths.json",
  "scheduler-risk-register.json",
  "scheduler-phase-2-2-plan.md",
];

function parseConst(src, name) {
  const match = src.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
  if (!match) throw new Error(`scheduler-audit: missing ${name} in inventory.ts`);
  return match[1];
}

function main() {
  const inventorySrc = readFileSync(inventoryPath, "utf8");
  const expectedPath = parseConst(inventorySrc, "ACTIVE_VERCEL_CRON_PATH");
  const expectedSchedule = parseConst(inventorySrc, "ACTIVE_VERCEL_CRON_SCHEDULE");
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
  const cron = vercel.crons?.[0];
  if (!cron) throw new Error("scheduler-audit: vercel.json has no crons");
  if (cron.path !== expectedPath) {
    throw new Error(
      `scheduler-audit NEW drift: vercel path "${cron.path}" != inventory "${expectedPath}"`,
    );
  }
  if (cron.schedule !== expectedSchedule) {
    throw new Error(
      `scheduler-audit NEW drift: vercel schedule "${cron.schedule}" != inventory "${expectedSchedule}"`,
    );
  }

  // Pro template must remain minute and separate (Hobby safety regression gate).
  const pro = JSON.parse(readFileSync(join(root, "vercel.cron.pro.json"), "utf8"));
  if (pro.crons?.[0]?.schedule !== "* * * * *") {
    throw new Error("scheduler-audit: vercel.cron.pro.json must stay minute schedule");
  }
  if (cron.schedule === "* * * * *" && expectedSchedule !== "* * * * *") {
    throw new Error(
      "scheduler-audit: vercel.json became minute without inventory update (Hobby risk)",
    );
  }

  for (const name of REQUIRED_ARTIFACTS) {
    const path = join(artifactDir, name);
    if (!existsSync(path)) {
      throw new Error(
        `scheduler-audit: missing artifact ${path} — run vitest lib/scheduler-audit first`,
      );
    }
  }

  try {
    mkdirSync(cursorDir, { recursive: true });
    cpSync(artifactDir, cursorDir, { recursive: true });
  } catch (error) {
    console.warn("scheduler-audit: optional cursor artifact copy skipped:", error.message);
  }

  console.log("scheduler-audit drift gate PASS");
  console.log(`artifacts: ${artifactDir}`);
  console.log(
    "Note: existing P0/P1 findings are recorded in artifacts; they do not fail this gate.",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

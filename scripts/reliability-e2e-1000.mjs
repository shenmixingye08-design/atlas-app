/**
 * Measured reliability gate: 1000 end-to-end iterations (no guessing).
 *
 * Pipeline per iteration:
 *   generate Word+PDF → durable save → clear memory → download → verify
 *   → notification ACK path (in-process) → history record
 *
 * Usage:
 *   node scripts/reliability-e2e-1000.mjs
 *   RELIABILITY_RUNS=100 node scripts/reliability-e2e-1000.mjs
 */

import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

const require = createRequire(import.meta.url);

// Prefer compiled/ts via vitest-less dynamic import of source through tsx if available.
async function loadTs(modulePath) {
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch {
    // Fallback: register ts-node/tsx
    try {
      await import("tsx/esm/api").then((m) => m.register());
    } catch {
      /* ignore */
    }
    return import(pathToFileURL(modulePath).href);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function rate(success, total) {
  if (total === 0) return null;
  return success / total;
}

const RUNS = Number(process.env.RELIABILITY_RUNS ?? 1000);
const USER = "reliability_gate_user";
const OUT_DIR =
  process.env.RELIABILITY_REPORT_DIR ??
  "/opt/cursor/artifacts/reliability-e2e-1000";

async function main() {
  process.env.ATLAS_MOCK_LLM = process.env.ATLAS_MOCK_LLM ?? "true";

  // Use vitest's Vite-node style by spawning the TypeScript harness instead.
  // This script delegates to the TS runner compiled on the fly via npx tsx.
  const { spawnSync } = await import("child_process");
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "scripts/reliability-e2e-1000.ts",
      String(RUNS),
      OUT_DIR,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ATLAS_MOCK_LLM: "true" },
      stdio: "inherit",
      timeout: 60 * 60 * 1000,
    },
  );
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

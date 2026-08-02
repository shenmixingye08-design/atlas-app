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

const RUNS = Number(process.env.RELIABILITY_RUNS ?? 1000);
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

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const result = spawnSync(
  process.execPath,
  [
    join(ROOT, "node_modules/vite-node/dist/cli.mjs"),
    "--config",
    "vitest.config.ts",
    join(ROOT, "scripts/ci/write-durable-sot-curated-runner.ts"),
  ],
  {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);

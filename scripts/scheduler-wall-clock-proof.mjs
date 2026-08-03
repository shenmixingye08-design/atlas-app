#!/usr/bin/env node
/**
 * Phase 2-4 runner — real wall-clock proof (not default CI).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("/opt/cursor/artifacts/scheduler-wall-clock-2-4", { recursive: true });

const result = spawnSync(
  "npm",
  ["run", "test:scheduler-wall-clock"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TZ: "UTC",
      ATLAS_WORK_QUEUE_FORCE_FILE: "true",
      ATLAS_SCHEDULER_CORE_FORCE_FILE: "true",
      ATLAS_WALL_CLOCK_PROOF_OFFLINE: "true",
      NODE_OPTIONS: "--max-old-space-size=8192",
    },
  },
);

process.exit(result.status === null ? 1 : result.status);

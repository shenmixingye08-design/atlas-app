#!/usr/bin/env node
/**
 * CI gate: ban forbidden scheduler/queue patterns in production paths.
 * Fail closed — do not weaken Quality Gate.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = [
  "lib/work-queue",
  "app/api/automations/tick",
  "app/api/worker",
];

const FORBIDDEN = [
  {
    re: /setInterval\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{[\s\S]{0,200}enqueueDueAutomations/,
    msg: "setInterval must not own schedule enqueue",
  },
  {
    re: /globalThis\.__atlasWorkQueue\b/,
    msg: "process-memory work-queue global is forbidden as SoT",
  },
  {
    re: /new\s+Map\s*<[^>]*>\s*\(\s*\)\s*;\s*\/\/\s*queue/i,
    msg: "in-memory Map queue pattern forbidden",
  },
];

const REQUIRED_SNIPPETS = [
  {
    file: "lib/work-queue/store/postgres-store.ts",
    re: /for update skip locked/i,
    msg: "Postgres lease must use SKIP LOCKED",
  },
  {
    file: "lib/work-queue/store/index.ts",
    re: /work_queue_postgres_required/,
    msg: "Production must require Postgres SoT",
  },
  {
    file: "lib/work-queue/worker.ts",
    re: /HEARTBEAT/,
    msg: "Worker must heartbeat",
  },
  {
    file: "lib/work-queue/side-effects.ts",
    re: /tryRecordSideEffect|getSideEffect/,
    msg: "Side-effect idempotency module required",
  },
  {
    file: ".github/workflows/minute-scheduler.yml",
    re: /drain=0/,
    msg: "Minute scheduler must enqueue without in-tick drain",
  },
];

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mjs|js|yml)$/.test(name)) out.push(path);
  }
  return out;
}

let failed = 0;

for (const rel of SCAN_DIRS) {
  const abs = join(ROOT, rel);
  for (const file of walk(abs)) {
    const text = readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) {
      if (rule.re.test(text)) {
        console.error(`FAIL ${file}: ${rule.msg}`);
        failed += 1;
      }
    }
  }
}

for (const req of REQUIRED_SNIPPETS) {
  const text = readFileSync(join(ROOT, req.file), "utf8");
  if (!req.re.test(text)) {
    console.error(`FAIL missing: ${req.file}: ${req.msg}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`work-queue-durability-ban: ${failed} violation(s)`);
  process.exit(1);
}
console.log("work-queue-durability-ban CI gate PASS");

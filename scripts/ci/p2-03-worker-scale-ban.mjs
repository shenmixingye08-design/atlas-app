#!/usr/bin/env node
/**
 * CI gate (P2-03): worker horizontal scale must stay wired.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const required = [
  "lib/work-queue/worker-scale.ts",
  "lib/work-queue/worker-scale-probe.ts",
  "lib/work-queue/p2-03-worker-scale.test.ts",
  "app/api/health/worker-scale/route.ts",
  "docs/development/feature-evaluation-p2-03-worker-scale.md",
  ".github/workflows/verify-worker-scale-production.yml",
];

for (const f of required) {
  if (!existsSync(join(root, f))) violations.push(`${f}: missing`);
}

const scale = read("lib/work-queue/worker-scale.ts");
for (const marker of [
  "computeWorkerScalePlan",
  "drainWorkQueueHorizontal",
  "backpressure",
  "WORK_QUEUE_WORKER_FANOUT",
]) {
  if (!scale.includes(marker)) {
    violations.push(`worker-scale.ts: missing ${marker}`);
  }
}

const constants = read("lib/work-queue/constants.ts");
if (!/WORK_QUEUE_WORKER_BATCH\s*=\s*([2-9][0-9]|1[1-9])/.test(constants)) {
  // Must be > 10 (reviewed). Allow 11-99.
  const m = constants.match(/WORK_QUEUE_WORKER_BATCH\s*=\s*(\d+)/);
  const n = m ? Number(m[1]) : 0;
  if (!(n > 10 && n <= 25)) {
    violations.push(
      `constants.ts: WORK_QUEUE_WORKER_BATCH must be 11..25 (got ${n || "?"})`,
    );
  }
}

const tick = read("lib/work-queue/tick.ts");
if (!/drainWorkQueueHorizontal/.test(tick)) {
  violations.push("tick.ts: must call drainWorkQueueHorizontal");
}
if (!/P2-03/.test(tick)) {
  violations.push("tick.ts: must document P2-03");
}
if (/await\s+drainWorkQueue\s*\(/.test(tick)) {
  violations.push("tick.ts: must not call single drainWorkQueue directly");
}

const minute = read(".github/workflows/minute-scheduler.yml");
if (!/\/api\/worker\/drain/.test(minute)) {
  violations.push("minute-scheduler.yml: must fan-out /api/worker/drain");
}
if (!/worker_horizontal_fanout/.test(minute)) {
  violations.push("minute-scheduler.yml: must log worker_horizontal_fanout");
}

const qg = read(".github/workflows/quality-gate.yml");
if (!/p2-03-worker-scale-ban\.mjs/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-03 ban");
}
if (!/test:worker-scale/.test(qg)) {
  violations.push("quality-gate.yml: must run p2-03 tests");
}

const publicRoutes = read("lib/auth/public-routes.ts");
if (!/\/api\/health\/worker-scale/.test(publicRoutes)) {
  violations.push("public-routes.ts: worker-scale must be public");
}

const contracts = read("lib/api-contracts/critical-contracts.ts");
if (!/health\.worker-scale/.test(contracts)) {
  violations.push("critical-contracts.ts: must include worker-scale");
}

const pkg = read("package.json");
if (!/"test:worker-scale"/.test(pkg)) {
  violations.push("package.json: must define test:worker-scale");
}

if (violations.length) {
  console.error("P2-03 worker horizontal scale ban FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("P2-03 worker horizontal scale ban OK");

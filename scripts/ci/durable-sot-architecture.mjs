#!/usr/bin/env node
/**
 * Architecture gate: Production cutover — forbid legacy SoT imports / silent fallbacks.
 * Exit 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const FORBIDDEN_IMPORT_PATTERNS = [
  {
    re: /from\s+["']@\/lib\/work-queue\/store\/file-store["']/,
    allow: [
      "lib/work-queue/store/index.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/work-queue/work-queue.test.ts",
      "lib/automations/durable.test.ts",
    ],
    msg: "file-store import outside test/factory isolation",
  },
  {
    re: /from\s+["']\.\/file-store["']/,
    allow: ["lib/work-queue/store/index.ts", "lib/work-queue/store/file-store.ts"],
    msg: "relative file-store import outside factory",
  },
  {
    re: /tryCreatePostgresWorkQueueStore/,
    allow: [
      "lib/work-queue/store/postgres-store.ts",
      "scripts/ci/durable-sot-architecture.mjs",
    ],
    msg: "legacy atlas_work_queue postgres store must not be selected in production path",
  },
  {
    re: /createFileWorkQueueStore\(/,
    allow: [
      "lib/work-queue/store/index.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/work-queue/work-queue.test.ts",
      "lib/automations/durable.test.ts",
      "lib/persistence/durable-sot/cutover/",
    ],
    msg: "createFileWorkQueueStore outside test/factory",
  },
];

const FACTORY = "lib/work-queue/store/index.ts";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name === "dist"
    ) {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

function isAllowed(file, allowList) {
  const rel = relative(root, file).replaceAll("\\", "/");
  return allowList.some(
    (a) => rel === a || rel.startsWith(a) || rel.endsWith(a),
  );
}

const violations = [];
const files = walk(join(root, "lib")).concat(
  walk(join(root, "app")).filter((f) => !f.includes(".test.")),
);

for (const file of files) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.includes(".test.") || rel.includes("__tests__")) continue;
  if (rel.includes("/cutover/") && rel.endsWith(".test.ts")) continue;
  const src = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN_IMPORT_PATTERNS) {
    if (!rule.re.test(src)) continue;
    if (isAllowed(file, rule.allow)) continue;
    violations.push(`${rel}: ${rule.msg}`);
  }
}

// Factory must not reference tryCreatePostgresWorkQueueStore
const factorySrc = readFileSync(join(root, FACTORY), "utf8");
if (factorySrc.includes("tryCreatePostgresWorkQueueStore")) {
  violations.push(
    `${FACTORY}: must not import/select legacy Postgres work-queue store`,
  );
}
if (!factorySrc.includes("DurableSotUnavailableError")) {
  violations.push(`${FACTORY}: must fail-closed with DurableSotUnavailableError`);
}
if (!factorySrc.includes("LEGACY_FALLBACK_BLOCKED")) {
  violations.push(`${FACTORY}: must log LEGACY_FALLBACK_BLOCKED`);
}
// No silent createFileWorkQueueStore without legacy flag gate
if (
  factorySrc.includes("createFileWorkQueueStore()") &&
  !factorySrc.includes("legacyStoreWriteEnabled")
) {
  violations.push(`${FACTORY}: file store must be gated by legacyStoreWriteEnabled`);
}

// Dual-write / mixed SoT: factory must not select file after durable success path in production
if (
  factorySrc.includes("productionRuntime") &&
  /if\s*\(\s*flags\.productionRuntime[\s\S]*createFileWorkQueueStore/.test(
    factorySrc,
  )
) {
  violations.push(
    `${FACTORY}: production path must not reach createFileWorkQueueStore (dual/mixed SoT)`,
  );
}

// Worker must go through getWorkQueueStore (repository/adapter), not file-store
const workerPath = join(root, "lib/work-queue/worker.ts");
const workerSrc = readFileSync(workerPath, "utf8");
if (/file-store|createFileWorkQueueStore|tryCreatePostgresWorkQueueStore/.test(workerSrc)) {
  violations.push("lib/work-queue/worker.ts: must not import legacy file/postgres stores");
}
if (!workerSrc.includes("getWorkQueueStore")) {
  violations.push("lib/work-queue/worker.ts: must use getWorkQueueStore");
}

if (violations.length) {
  console.error("Durable SoT architecture violations:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Durable SoT architecture gate PASS");
process.exit(0);

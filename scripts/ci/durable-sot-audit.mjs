#!/usr/bin/env node
/**
 * Durable SoT Audit scanner (Phase 1-1).
 *
 * Static inventory of process-memory, file fallback, browser storage,
 * and detached / fire-and-forget promise patterns.
 *
 * Exit codes:
 *   0 — inventories written; no NEW baseline regressions
 *   1 — scanner failure OR new dangerous findings vs baseline
 *
 * Existing findings never fail CI by themselves (baseline absorbs them).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const OUT_DIR =
  process.env.DURABLE_SOT_OUT_DIR?.trim() ||
  join(ROOT, "artifacts", "durable-sot-audit");
const BASELINE_DIR = join(
  ROOT,
  "docs",
  "development",
  "durable-sot-audit",
  "baselines",
);

const SCAN_ROOTS = ["lib", "app", "components"];
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "artifacts",
  "coverage",
  ".git",
  "verification-screenshots",
]);

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !name.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function isTestFile(file) {
  return (
    /\.test\.(ts|tsx|mjs|js)$/.test(file) ||
    /\/e2e\//.test(file) ||
    /\/scripts\//.test(file) ||
    /preview\/page\.tsx$/.test(file)
  );
}

/** Audit package prose must not inflate production inventories. */
function isAuditPackageNoise(file) {
  return (
    file.startsWith("lib/persistence/durable-sot-audit/") &&
    !file.endsWith("production-diagnostics.ts")
  );
}

function isCommentOrStringNoise(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * Extract all process-global store symbols from a line.
 * @param {string} line
 */
function extractGlobalSymbols(line) {
  const out = [];
  const re = /__(?:atlas|minervot)[A-Za-z0-9_]+/g;
  let m;
  while ((m = re.exec(line))) out.push(m[0]);
  return out;
}

/**
 * Classify a Map/Set allocation as state vs ephemeral local.
 * @param {string} line
 * @param {string[]} nearby
 */
function classifyCollection(line, nearby) {
  const joined = nearby.join("\n");
  const assignsToGlobal =
    /__(?:atlas|minervot)[A-Za-z0-9_]*\s*=\s*new\s+(Map|Set|WeakMap|WeakSet)/.test(
      line,
    ) ||
    /\.(__(?:atlas|minervot)[A-Za-z0-9_]*)\s*=\s*new\s+(Map|Set)/.test(line) ||
    /globalScope\.[A-Za-z0-9_]+\s*=\s*new\s+(Map|Set)/.test(line) ||
    /scope\.[A-Za-z0-9_]+\s*=\s*new\s+(Map|Set)/.test(line) ||
    /\bg\.[A-Za-z0-9_]+\s*=\s*new\s+(Map|Set)/.test(line);

  if (assignsToGlobal) return "process_memory_store";

  if (
    /ReadonlySet|ALLOWED_|STOP_WORDS|BLOCKED_|TERMINAL_|DOCUMENT_TYPES|BY_ID|BY_TYPE|STAGE_INDEX|GATED_|HEAVY_|RETRYABLE_|NON_RETRYABLE_|ACCEPT_EXT|EXPORT_SECTION|const BY_/.test(
      joined,
    )
  ) {
    return "static_constant";
  }

  if (
    /new Set\(\[|new Map\([a-zA-Z_]|\[\.\.\.new Set|Array\.from\(new Set|return \[\.\.\.new Set|const byId = new Map|const beforeSet|const afterSet|const union|const unique|const memoryOwners|const enabledById|scopeSet|answered|forbiddenExpressions|const blocked = new Set|const selected = new Set|const approvalSet|const readable = new Set|const external = new Set|const production = new Set|const DELIVERABLE|const DOCUMENT/.test(
      line,
    )
  ) {
    return "ephemeral_local";
  }

  // Object-literal store init: { automations: new Map(), ... }
  if (
    /(?:automations|runs|occurrenceKeys|idempotencyKeys|legacyMap|candidates|revisions|signals|trials|settings|suppressedFingerprints|byAtlasUserId|byLineUserId|codes|byUser|counters):\s*new\s+(Map|Set)/.test(
      line,
    )
  ) {
    return "process_memory_store";
  }

  if (/=\s*new\s+(Map|Set)\(\s*\)/.test(line) && /getStore|Bucket|Store/.test(joined)) {
    return "process_memory_store";
  }

  return "other";
}

function scanFile(file) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  const pathRel = rel(file);
  const test = isTestFile(pathRel);

  /** @type {any[]} */
  const globalThisHits = [];
  /** @type {any[]} */
  const mapSetHits = [];
  /** @type {any[]} */
  const fileFallbackHits = [];
  /** @type {any[]} */
  const browserStorageHits = [];
  /** @type {any[]} */
  const detachedPromiseHits = [];
  /** @type {any[]} */
  const moduleSingletonHits = [];
  /** @type {any[]} */
  const setTimerHits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (isCommentOrStringNoise(line)) continue;

    if (/\bglobalThis\b/.test(line)) {
      globalThisHits.push({
        file: pathRel,
        line: lineNo,
        symbol: "globalThis",
        snippet: line.trim().slice(0, 200),
        testFile: test,
      });
    }

    for (const symbol of extractGlobalSymbols(line)) {
      // Skip prose mentions inside this audit package (except diagnostics buffer).
      if (
        pathRel.includes("lib/persistence/durable-sot-audit/") &&
        !pathRel.endsWith("production-diagnostics.ts")
      ) {
        continue;
      }
      const isDef =
        new RegExp(`${symbol}\\s*\\??\\s*:`).test(line) ||
        new RegExp(`${symbol}\\s*=`).test(line) ||
        new RegExp(`\\.${symbol}\\b`).test(line);
      if (!isDef) continue;
      globalThisHits.push({
        file: pathRel,
        line: lineNo,
        symbol,
        snippet: line.trim().slice(0, 200),
        testFile: test,
        isDef: true,
      });
    }

    if (/\bnew\s+(Map|Set|WeakMap|WeakSet)\b/.test(line)) {
      const kind = line.match(/\bnew\s+(Map|Set|WeakMap|WeakSet)\b/)?.[1];
      const nearby = lines.slice(Math.max(0, i - 8), Math.min(lines.length, i + 3));
      const classification = classifyCollection(line, nearby);
      mapSetHits.push({
        file: pathRel,
        line: lineNo,
        kind,
        classification,
        snippet: line.trim().slice(0, 200),
        testFile: test,
        survivesRestart: false,
      });
    }

    if (
      /\.data\/|work-queue\.json|work-queue-artifacts|writeFileSync|readFileSync|appendFileSync|mkdirSync\(/.test(
        line,
      ) &&
      !/node:fs|from \"fs\"|from 'fs'/.test(line)
    ) {
      // Skip pure imports; keep usage
      if (/import\s+\{[^}]*writeFileSync/.test(line)) continue;
      fileFallbackHits.push({
        file: pathRel,
        line: lineNo,
        snippet: line.trim().slice(0, 220),
        testFile: test,
        vercelPersistent: false,
        multiInstanceSafe: false,
      });
    }

    if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(line)) {
      const kind = /\blocalStorage\b/.test(line)
        ? "localStorage"
        : /\bsessionStorage\b/.test(line)
          ? "sessionStorage"
          : "indexedDB";
      browserStorageHits.push({
        file: pathRel,
        line: lineNo,
        kind,
        snippet: line.trim().slice(0, 200),
        testFile: test,
      });
    }

    // Fire-and-forget / detached promise patterns
    if (
      /^\s*void\s+/.test(line) ||
      /\bvoid\s+[a-zA-Z_(]/.test(line) ||
      /\.catch\(\s*\(\s*\)\s*=>\s*(null|undefined|\{\s*\}|void\s+0)/.test(line) ||
      /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)
    ) {
      // Filter TypeScript `void` operator on values that are clearly not promises
      // Keep all void calls — audit wants visibility
      if (/void\s+0\b|void\s+input\.|void\s+error\b|void\s+nextStage|void\s+slotKey|void\s+key\b|void\s+requestOrigin|void\s+redactForLog|void\s+firstDiagnosticId|void\s+memoryAppliedContent/.test(line)) {
        // intentional void discard of unused vars — not async
        continue;
      }
      if (/\/\/|Avoid |avoid /.test(line) && !/void\s+/.test(line)) continue;

      detachedPromiseHits.push({
        file: pathRel,
        line: lineNo,
        pattern: /^\s*void\s+/.test(line)
          ? "void_promise"
          : ".catch_swallow",
        snippet: line.trim().slice(0, 220),
        testFile: test,
      });
    }

    if (
      /^let\s+singleton\b/.test(line.trim()) ||
      /let\s+singleton:\s*/.test(line)
    ) {
      moduleSingletonHits.push({
        file: pathRel,
        line: lineNo,
        snippet: line.trim().slice(0, 200),
        testFile: test,
      });
    }

    if (/\bsetInterval\s*\(|\bsetTimeout\s*\(/.test(line)) {
      setTimerHits.push({
        file: pathRel,
        line: lineNo,
        kind: /setInterval/.test(line) ? "setInterval" : "setTimeout",
        snippet: line.trim().slice(0, 200),
        testFile: test,
      });
    }
  }

  return {
    globalThisHits,
    mapSetHits,
    fileFallbackHits,
    browserStorageHits,
    detachedPromiseHits,
    moduleSingletonHits,
    setTimerHits,
  };
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function fingerprint(items) {
  return items
    .map((i) => `${i.file}:${i.line}:${i.symbol ?? i.kind ?? i.pattern ?? ""}`)
    .sort();
}

function loadBaseline(name) {
  const path = join(BASELINE_DIR, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r)));
  /** @type {any[]} */
  let globalThisHits = [];
  /** @type {any[]} */
  let mapSetHits = [];
  /** @type {any[]} */
  let fileFallbackHits = [];
  /** @type {any[]} */
  let browserStorageHits = [];
  /** @type {any[]} */
  let detachedPromiseHits = [];
  /** @type {any[]} */
  let moduleSingletonHits = [];
  /** @type {any[]} */
  let setTimerHits = [];

  for (const file of files) {
    const r = scanFile(file);
    globalThisHits.push(...r.globalThisHits);
    mapSetHits.push(...r.mapSetHits);
    fileFallbackHits.push(...r.fileFallbackHits);
    browserStorageHits.push(...r.browserStorageHits);
    detachedPromiseHits.push(...r.detachedPromiseHits);
    moduleSingletonHits.push(...r.moduleSingletonHits);
    setTimerHits.push(...r.setTimerHits);
  }

  // Production-reachable = non-test source under lib/app (exclude audit prose)
  const prodGlobal = globalThisHits.filter(
    (h) =>
      !h.testFile &&
      !isAuditPackageNoise(h.file) &&
      (h.file.startsWith("lib/") || h.file.startsWith("app/")),
  );
  const prodMapSetStores = mapSetHits.filter(
    (h) =>
      !h.testFile &&
      !isAuditPackageNoise(h.file) &&
      h.classification === "process_memory_store" &&
      (h.file.startsWith("lib/") || h.file.startsWith("app/")),
  );
  const prodFile = fileFallbackHits.filter(
    (h) =>
      !h.testFile &&
      !isAuditPackageNoise(h.file) &&
      (h.file.startsWith("lib/") || h.file.startsWith("app/")),
  );
  const prodBrowser = browserStorageHits.filter(
    (h) => !h.testFile && !isAuditPackageNoise(h.file),
  );
  const prodDetached = detachedPromiseHits.filter(
    (h) =>
      !h.testFile &&
      !isAuditPackageNoise(h.file) &&
      (h.file.startsWith("lib/") || h.file.startsWith("app/")),
  );

  const globalSymbols = uniqueByKey(
    prodGlobal
      .filter((h) => h.symbol && h.symbol.startsWith("__") && h.isDef)
      .map((h) => ({
        symbol: h.symbol,
        file: h.file,
        line: h.line,
        survivesRestart: false,
        ownerScope: "process",
      })),
    (h) => `${h.symbol}@${h.file}`,
  );

  const processMemoryInventory = {
    generatedAt: new Date().toISOString(),
    phase: "1-1-durable-sot-audit",
    totals: {
      globalThisReferences: prodGlobal.length,
      uniqueGlobalSymbols: globalSymbols.length,
      processMemoryMapSetAllocations: prodMapSetStores.length,
      moduleSingletons: moduleSingletonHits.filter((h) => !h.testFile).length,
      setTimers: setTimerHits.filter((h) => !h.testFile).length,
    },
    globalThisSymbols: globalSymbols,
    mapSetProcessStores: prodMapSetStores,
    moduleSingletons: moduleSingletonHits.filter((h) => !h.testFile),
    setTimers: setTimerHits.filter((h) => !h.testFile),
    note: "All process-memory entries are lost on process restart/deploy/crash unless a durable write completed before death.",
  };

  const fileFallbackInventory = {
    generatedAt: new Date().toISOString(),
    phase: "1-1-durable-sot-audit",
    totals: { hits: prodFile.length },
    entries: prodFile,
    knownPaths: [
      {
        path: ".data/work-queue.json",
        content: "Work Queue jobs/steps/lease/metrics snapshot",
        productionUse:
          "Used when Postgres store unavailable OR ATLAS_WORK_QUEUE_FORCE_FILE=true",
        vercelPersistent: false,
        multiInstanceConsistent: false,
        crashSafe: "partial (atomic rename per write; in-flight lost)",
        concurrentWriteSafe: false,
        corruptionRisk: "medium (multi-instance races)",
        dbAlternative: "atlas_work_queue_jobs / atlas_work_queue_steps",
      },
      {
        path: ".data/work-queue-artifacts/*",
        content: "Offline notify receipts / step artifacts",
        productionUse: "ATLAS_WORK_QUEUE_OFFLINE_NOTIFY=1 or local step writes",
        vercelPersistent: false,
        multiInstanceConsistent: false,
        crashSafe: false,
        concurrentWriteSafe: false,
        corruptionRisk: "high on ephemeral FS",
        dbAlternative: "step output_bindings + notification DLQ / evidence columns",
      },
      {
        path: "/tmp/atlas/*",
        content: "Ephemeral temp (vision probes, etc.)",
        productionUse: "temp only — must delete after use",
        vercelPersistent: false,
        multiInstanceConsistent: false,
        crashSafe: false,
        concurrentWriteSafe: "n/a",
        corruptionRisk: "low (temp)",
        dbAlternative: "n/a — not SoT",
      },
    ],
    note: "File fallback is NEVER durable SoT on Vercel. Do not report as safe.",
  };

  const browserInventory = {
    generatedAt: new Date().toISOString(),
    phase: "1-1-durable-sot-audit",
    totals: {
      hits: prodBrowser.length,
      localStorage: prodBrowser.filter((h) => h.kind === "localStorage").length,
      sessionStorage: prodBrowser.filter((h) => h.kind === "sessionStorage")
        .length,
    },
    entries: prodBrowser,
    classificationNotes: [
      "localStorage MUST NOT be treated as server SoT",
      "sessionStorage is UI/session cache only",
      "Production value metrics (savedMinutes) must not depend on browser storage alone",
    ],
  };

  const detachedInventory = {
    generatedAt: new Date().toISOString(),
    phase: "1-1-durable-sot-audit",
    totals: { hits: prodDetached.length },
    entries: prodDetached,
    note: "Detached promises may leave DB/process out of sync after restart; restart recovery requires durable state written before fire-and-forget.",
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    phase: "1-1-durable-sot-audit",
    scannedFiles: files.length,
    productionReachable: {
      processMemoryGlobalSymbols: globalSymbols.length,
      processMemoryMapSetStores: prodMapSetStores.length,
      fileFallbackHits: prodFile.length,
      browserStorageHits: prodBrowser.length,
      detachedPromiseHits: prodDetached.length,
    },
    fingerprints: {
      globalSymbols: fingerprint(globalSymbols),
      fileFallback: fingerprint(prodFile),
      detached: fingerprint(prodDetached),
      browser: fingerprint(prodBrowser),
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "process-memory-inventory.json"),
    JSON.stringify(processMemoryInventory, null, 2),
  );
  writeFileSync(
    join(OUT_DIR, "file-fallback-inventory.json"),
    JSON.stringify(fileFallbackInventory, null, 2),
  );
  writeFileSync(
    join(OUT_DIR, "browser-storage-inventory.json"),
    JSON.stringify(browserInventory, null, 2),
  );
  writeFileSync(
    join(OUT_DIR, "detached-promise-inventory.json"),
    JSON.stringify(detachedInventory, null, 2),
  );
  writeFileSync(
    join(OUT_DIR, "durable-sot-audit.json"),
    JSON.stringify(summary, null, 2),
  );

  // Copy planning docs next to machine inventories for CI artifact bundles.
  const migrationPlan = join(
    ROOT,
    "docs",
    "development",
    "durable-sot-audit",
    "migration-plan.md",
  );
  if (existsSync(migrationPlan)) {
    writeFileSync(
      join(OUT_DIR, "migration-plan.md"),
      readFileSync(migrationPlan, "utf8"),
    );
  }
  const curated = join(
    ROOT,
    "docs",
    "development",
    "durable-sot-audit",
    "curated-report.json",
  );
  if (existsSync(curated)) {
    writeFileSync(join(OUT_DIR, "curated-report.json"), readFileSync(curated, "utf8"));
  }

  // Diff gate vs baseline — fail only on NEW fingerprints
  const baseline = loadBaseline("durable-sot-audit.baseline.json");
  /** @type {string[]} */
  const regressions = [];
  if (baseline?.fingerprints) {
    for (const key of ["globalSymbols", "fileFallback", "detached", "browser"]) {
      const baseSet = new Set(baseline.fingerprints[key] ?? []);
      const cur = summary.fingerprints[key] ?? [];
      for (const fp of cur) {
        if (!baseSet.has(fp)) {
          regressions.push(`NEW ${key}: ${fp}`);
        }
      }
    }
  } else {
    console.warn(
      "[durable-sot-audit] No baseline found — writing inventories only (no diff gate).",
    );
  }

  const regressionReport = {
    generatedAt: new Date().toISOString(),
    baselinePresent: Boolean(baseline),
    newFindings: regressions,
    pass: regressions.length === 0,
  };
  writeFileSync(
    join(OUT_DIR, "diff-gate.json"),
    JSON.stringify(regressionReport, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        outDir: OUT_DIR,
        scannedFiles: files.length,
        productionReachable: summary.productionReachable,
        diffGate: regressionReport,
      },
      null,
      2,
    ),
  );

  if (regressions.length > 0) {
    console.error(
      `[durable-sot-audit] FAIL: ${regressions.length} new dangerous findings vs baseline`,
    );
    for (const r of regressions.slice(0, 40)) console.error(" -", r);
    process.exit(1);
  }
  process.exit(0);
}

main();

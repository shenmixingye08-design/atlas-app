#!/usr/bin/env node
/**
 * CI gate (P1-07): external monitor must stay durable + wired + integrity-tested.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function requireFile(rel, hint) {
  if (!existsSync(join(ROOT, rel))) {
    violations.push(`${rel}: missing (${hint})`);
    return null;
  }
  return read(rel);
}

const tick = requireFile(
  "lib/automations/tick-runner.ts",
  "tick must call external monitor",
);
if (tick) {
  if (!tick.includes("runExternalMonitorCycle")) {
    violations.push(
      "lib/automations/tick-runner.ts: must call runExternalMonitorCycle",
    );
  }
  if (!tick.includes("externalMonitor")) {
    violations.push(
      "lib/automations/tick-runner.ts: must expose externalMonitor in response",
    );
  }
}

const thresholds = requireFile(
  "lib/external-monitor/thresholds.ts",
  "central thresholds",
);
if (thresholds && !thresholds.includes("EXTERNAL_MONITOR_THRESHOLDS")) {
  violations.push(
    "lib/external-monitor/thresholds.ts: EXTERNAL_MONITOR_THRESHOLDS required",
  );
}

const store = requireFile(
  "lib/external-monitor/store.ts",
  "durable store",
);
if (store) {
  if (!store.includes("atlas_alert_incidents")) {
    violations.push("store.ts: must persist atlas_alert_incidents");
  }
  if (!store.includes("external_monitor_durable_required")) {
    violations.push("store.ts: production must fail closed without durable SoT");
  }
  if (!/isAtlasProduction\(\)\s*\)\s*return\s*false/.test(store)) {
    violations.push(
      "store.ts: memory backend must be forbidden in Production",
    );
  }
}

const runner = requireFile("lib/external-monitor/runner.ts", "runner");
if (runner) {
  if (!runner.includes("claimAlertDelivery")) {
    violations.push("runner.ts: single-winner claimAlertDelivery required");
  }
  if (/console\.log\([^\n]*Owner|console\.log\([^\n]*alert/i.test(runner)) {
    violations.push(
      "runner.ts: console.log must not be treated as Owner alert success path",
    );
  }
}

const health = requireFile(
  "app/api/health/external-monitor/route.ts",
  "external health probe",
);
if (health && !health.includes("probeExternalMonitorSchema")) {
  violations.push(
    "health/external-monitor: must call probeExternalMonitorSchema",
  );
}

const integrity = requireFile(
  "lib/external-monitor/p1-07-integrity.test.ts",
  "integrity tests",
);
if (integrity) {
  for (const needle of [
    "alert dedupe",
    "single-winner",
    "recovery",
    "restart durability",
    "failure injection safety",
  ]) {
    if (!integrity.toLowerCase().includes(needle.toLowerCase())) {
      violations.push(
        `p1-07-integrity.test.ts: missing coverage for "${needle}"`,
      );
    }
  }
  if (/postSuccessRate\s*:\s*1/.test(integrity)) {
    violations.push("p1-07-integrity.test.ts: fabricated postSuccessRate banned");
  }
}

const qg = requireFile(".github/workflows/quality-gate.yml", "quality gate");
if (qg && !qg.includes("p1-07-external-monitor-ban.mjs")) {
  violations.push(
    "quality-gate.yml: must run scripts/ci/p1-07-external-monitor-ban.mjs",
  );
}

const migration = requireFile(
  "supabase/migrations/20260809_p1_07_external_monitor_alerts.sql",
  "P1-07 migration",
);
if (migration && !migration.includes("atlas_claim_alert_delivery")) {
  violations.push("migration: atlas_claim_alert_delivery RPC required");
}

if (violations.length) {
  console.error("P1-07 external monitor ban failed:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P1-07 external monitor ban: OK");

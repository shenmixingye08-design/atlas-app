/**
 * Production work-queue readiness probe (P1 tick durability).
 * Boolean / enum flags only — no connection strings or secrets.
 */

import "server-only";

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { classifyTickFailure } from "./tick-diagnostics";
import {
  WorkQueueStoreUnavailableError,
  clearWorkQueueStoreSingletonForTests,
  getWorkQueueStore,
} from "./store";

export type WorkQueueProbeResult = {
  ok: boolean;
  postgresUrlConfigured: boolean;
  extendedPostgresUrlOnly: boolean;
  /** Count of recognized Postgres URL env keys present (names only counted, never values). */
  postgresUrlKeyCount: number;
  storeReady: boolean;
  tablesOk: boolean;
  metricsOk: boolean;
  memoryNotSot: boolean;
  multiInstanceSafe: boolean;
  developerCode: string | null;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

export async function probeWorkQueueSchema(): Promise<WorkQueueProbeResult> {
  const version = getHealthVersionPayload();
  const url = resolveAtlasPostgresUrl();
  const postgresUrlConfigured = Boolean(url.connectionString);
  const extendedPostgresUrlOnly = url.extendedOnlyPresent;
  const postgresUrlKeyCount = url.presentKeys.length;

  let storeReady = false;
  let tablesOk = false;
  let metricsOk = false;
  let developerCode: string | null = null;
  let error: string | null = null;

  // Tests: re-resolve store after env mutations. Production cold starts are fresh.
  if (!isAtlasProduction()) {
    clearWorkQueueStoreSingletonForTests();
  }

  try {
    const store = getWorkQueueStore();
    storeReady = true;
    // Prefer a cheap existence check via metrics (hits jobs table).
    const metrics = await store.metrics();
    metricsOk = typeof metrics.queued === "number" || typeof metrics === "object";
    tablesOk = metricsOk;
  } catch (e) {
    const diag = classifyTickFailure(e, "work_queue");
    developerCode = diag.developerCode;
    if (e instanceof WorkQueueStoreUnavailableError) {
      storeReady = false;
      error = "work_queue_store_unavailable";
    } else if (diag.developerCode === "work_queue_schema_missing") {
      storeReady = postgresUrlConfigured;
      tablesOk = false;
      error = "work_queue_schema_missing";
    } else if (diag.developerCode === "work_queue_db_unreachable") {
      storeReady = false;
      error = "work_queue_db_unreachable";
    } else {
      error = "work_queue_probe_failed";
    }
  }

  const memoryNotSot = isAtlasProduction() ? storeReady && tablesOk : true;
  const multiInstanceSafe = storeReady && tablesOk && postgresUrlConfigured;
  const ok =
    postgresUrlConfigured && storeReady && tablesOk && metricsOk && memoryNotSot;

  return {
    ok,
    postgresUrlConfigured,
    extendedPostgresUrlOnly,
    postgresUrlKeyCount,
    storeReady,
    tablesOk,
    metricsOk,
    memoryNotSot,
    multiInstanceSafe,
    developerCode: ok ? null : developerCode,
    error: ok ? null : error,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}

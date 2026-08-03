import { createSchedulerCoreFileStore } from "./file-store";
import { tryCreateSchedulerCorePostgresStore } from "./postgres-store";
import type { SchedulerCoreDurableStore } from "./types";

let singleton: SchedulerCoreDurableStore | null = null;

/**
 * Production: Postgres required (fail-closed if missing when force-file is off).
 * Tests/CI: file store via ATLAS_WORK_QUEUE_FORCE_FILE / VITEST.
 * Never falls back to process-memory SoT.
 */
export function getSchedulerCoreStore(): SchedulerCoreDurableStore {
  if (singleton) return singleton;
  const forceFile =
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE?.trim().toLowerCase() === "true" ||
    process.env.ATLAS_SCHEDULER_CORE_FORCE_FILE?.trim().toLowerCase() ===
      "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true";
  if (!forceFile) {
    const pg = tryCreateSchedulerCorePostgresStore();
    if (pg) {
      singleton = pg;
      return singleton;
    }
    throw new Error(
      "scheduler_core_store_unavailable: DATABASE_URL required (no memory fallback)",
    );
  }
  singleton = createSchedulerCoreFileStore();
  return singleton;
}

export function resetSchedulerCoreStoreForTests(path?: string): SchedulerCoreDurableStore {
  singleton = createSchedulerCoreFileStore(path);
  return singleton;
}

export type { SchedulerCoreDurableStore, SchedulerScheduleIndexRow } from "./types";

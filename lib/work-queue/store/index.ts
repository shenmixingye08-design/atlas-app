import {
  WORK_QUEUE_ALLOW_FILE_ENV,
  WORK_QUEUE_FORCE_FILE_ENV,
  WORK_QUEUE_MEMORY_FAST_ENV,
} from "../constants";
import { createFileWorkQueueStore } from "./file-store";
import type { WorkQueueStore } from "./interface";
import { tryCreatePostgresWorkQueueStore } from "./postgres-store";

let singleton: WorkQueueStore | null = null;

function isVitestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST === "1"
  );
}

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.ATLAS_RUNTIME === "production"
  );
}

function envTruthy(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function assertProductionFileSotBanned(): void {
  if (!isProductionRuntime()) return;
  if (
    envTruthy(WORK_QUEUE_FORCE_FILE_ENV) ||
    envTruthy(WORK_QUEUE_ALLOW_FILE_ENV) ||
    envTruthy(WORK_QUEUE_MEMORY_FAST_ENV)
  ) {
    throw new Error(
      "work_queue_file_sot_forbidden_in_production: FORCE_FILE/ALLOW_FILE/MEMORY_FAST cannot be SoT in production",
    );
  }
}

function forceFileStore(): boolean {
  // Production hard-ban — FORCE_FILE must never skip Postgres in prod.
  if (isProductionRuntime()) return false;
  return envTruthy(WORK_QUEUE_FORCE_FILE_ENV);
}

function allowFileFallback(): boolean {
  if (isProductionRuntime()) return false;
  if (isVitestRuntime() || forceFileStore()) return true;
  return envTruthy(WORK_QUEUE_ALLOW_FILE_ENV);
}

export function getWorkQueueStore(): WorkQueueStore {
  if (singleton) return singleton;

  assertProductionFileSotBanned();

  if (!forceFileStore()) {
    const pg = tryCreatePostgresWorkQueueStore();
    if (pg) {
      singleton = pg;
      return singleton;
    }
    if (isProductionRuntime()) {
      throw new Error(
        "work_queue_postgres_required: DATABASE_URL/POSTGRES_URL missing — file SoT is forbidden in production",
      );
    }
  }

  if (!allowFileFallback()) {
    throw new Error(
      "work_queue_postgres_required: file fallback disabled outside explicit test/dev allowlist",
    );
  }

  singleton = createFileWorkQueueStore();
  return singleton;
}

/** Tests: replace singleton with a fresh file store path. */
export function resetWorkQueueStoreForTests(path?: string): WorkQueueStore {
  singleton = createFileWorkQueueStore(
    path ??
      `${process.cwd()}/.data/work-queue-test-${process.pid}-${Date.now()}.json`,
  );
  return singleton;
}

/** Tests / scripts: clear singleton so next getWorkQueueStore() re-resolves. */
export function clearWorkQueueStoreSingleton(): void {
  singleton = null;
}

export type { WorkQueueStore } from "./interface";

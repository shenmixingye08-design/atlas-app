import {
  WORK_QUEUE_ALLOW_FILE_ENV,
  WORK_QUEUE_FORCE_FILE_ENV,
} from "../constants";
import { createFileWorkQueueStore } from "./file-store";
import type { WorkQueueStore } from "./interface";
import { tryCreatePostgresWorkQueueStore } from "./postgres-store";

let singleton: WorkQueueStore | null = null;

function isVitestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env[WORK_QUEUE_FORCE_FILE_ENV]?.trim().toLowerCase() === "true"
  );
}

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" ||
    process.env.ATLAS_RUNTIME === "production"
  );
}

function allowFileFallback(): boolean {
  if (isVitestRuntime()) return true;
  return process.env[WORK_QUEUE_ALLOW_FILE_ENV]?.trim().toLowerCase() === "true";
}

export function getWorkQueueStore(): WorkQueueStore {
  if (singleton) return singleton;

  if (!isVitestRuntime()) {
    const pg = tryCreatePostgresWorkQueueStore();
    if (pg) {
      singleton = pg;
      return singleton;
    }
    if (isProductionRuntime() && !allowFileFallback()) {
      throw new Error(
        "work_queue_postgres_required: DATABASE_URL/POSTGRES_URL missing — file SoT is forbidden in production",
      );
    }
  }

  if (!allowFileFallback() && isProductionRuntime()) {
    throw new Error(
      "work_queue_postgres_required: file fallback disabled in production",
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

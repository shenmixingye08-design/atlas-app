import { isAtlasProduction } from "@/lib/runtime/is-production";

import { WORK_QUEUE_FORCE_FILE_ENV } from "../constants";
import { createFileWorkQueueStore } from "./file-store";
import type { WorkQueueStore } from "./interface";
import { tryCreatePostgresWorkQueueStore } from "./postgres-store";

let singleton: WorkQueueStore | null = null;

export class WorkQueueStoreUnavailableError extends Error {
  readonly code = "work_queue_store_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "WorkQueueStoreUnavailableError";
  }
}

function isTestEnv(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.ATLAS_WORK_QUEUE_ALLOW_FILE === "true"
  );
}

/**
 * Production: Postgres only. File / memory / Map fallbacks are forbidden (P0-2).
 * Tests/local: file store allowed when forced or when Postgres URL is absent.
 */
export function getWorkQueueStore(): WorkQueueStore {
  if (singleton) return singleton;

  const forceFile =
    process.env[WORK_QUEUE_FORCE_FILE_ENV]?.trim().toLowerCase() === "true";

  if (isAtlasProduction()) {
    if (forceFile) {
      throw new WorkQueueStoreUnavailableError(
        "[work-queue] P0-2: ATLAS_WORK_QUEUE_FORCE_FILE is forbidden in Production",
      );
    }
    const pg = tryCreatePostgresWorkQueueStore();
    if (!pg) {
      throw new WorkQueueStoreUnavailableError(
        "[work-queue] P0-2: Production requires DATABASE_URL/POSTGRES_URL for durable job claim — file/memory fallback disabled",
      );
    }
    singleton = pg;
    return singleton;
  }

  if (!forceFile && !isTestEnv()) {
    const pg = tryCreatePostgresWorkQueueStore();
    if (pg) {
      singleton = pg;
      return singleton;
    }
  }

  if (forceFile || isTestEnv()) {
    singleton = createFileWorkQueueStore();
    return singleton;
  }

  // Non-production without Postgres: file is last-resort for local/dev only.
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

/** Tests / diagnostics: clear singleton so next getWorkQueueStore() re-resolves. */
export function clearWorkQueueStoreSingletonForTests(): void {
  singleton = null;
}

export type { WorkQueueStore } from "./interface";

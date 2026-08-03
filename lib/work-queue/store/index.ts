import { assertWorkQueueFileFallbackAllowed } from "@/lib/persistence/durable-sot-audit/production-diagnostics";

import { WORK_QUEUE_FORCE_FILE_ENV } from "../constants";
import { createFileWorkQueueStore } from "./file-store";
import type { WorkQueueStore } from "./interface";
import { tryCreatePostgresWorkQueueStore } from "./postgres-store";

let singleton: WorkQueueStore | null = null;

export function getWorkQueueStore(): WorkQueueStore {
  if (singleton) return singleton;
  const forceFile =
    process.env[WORK_QUEUE_FORCE_FILE_ENV]?.trim().toLowerCase() === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true";
  if (!forceFile) {
    const pg = tryCreatePostgresWorkQueueStore();
    if (pg) {
      singleton = pg;
      return singleton;
    }
    // Fail-fast diagnostic: file/.data is not durable SoT on prod/ephemeral FS.
    assertWorkQueueFileFallbackAllowed("postgres_unavailable");
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

export type { WorkQueueStore } from "./interface";

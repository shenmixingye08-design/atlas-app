import { WORK_QUEUE_FORCE_FILE_ENV } from "../constants";
import { tryCreateDurableSotWorkQueueStore } from "@/lib/persistence/durable-sot/adapters/work-queue-store";
import { resolveDurableSotCutoverFlags } from "@/lib/persistence/durable-sot/cutover/flags";
import {
  DurableSotUnavailableError,
  LegacyStoreAccessBlockedError,
} from "@/lib/persistence/durable-sot/cutover/errors";
import { logDurableSot } from "@/lib/persistence/durable-sot/cutover/observability";
import { createFileWorkQueueStore } from "./file-store";
import type { WorkQueueStore } from "./interface";

let singleton: WorkQueueStore | null = null;

function wantsExplicitTestFileStore(): boolean {
  // Explicit only — never treat VITEST alone as file SoT (Durable tests need DB).
  return process.env[WORK_QUEUE_FORCE_FILE_ENV]?.trim().toLowerCase() === "true";
}

/**
 * Production SoT factory — Durable DB only.
 * Fail-closed: never silent-fallback to file / memory / legacy postgres.
 */
export function getWorkQueueStore(): WorkQueueStore {
  if (singleton) return singleton;

  const flags = resolveDurableSotCutoverFlags();
  logDurableSot({
    event: "CUTOVER_ENABLED",
    domain: "work_queue",
    repository: "getWorkQueueStore",
    status: flags.productionRuntime ? "production" : "non_production",
    detail: `durable=${flags.durableSotEnabled};legacyWrite=${flags.legacyStoreWriteEnabled}`,
  });

  // --- Production: Durable only, fail-closed (legacy env cannot override) ---
  if (flags.productionRuntime) {
    const durable = tryCreateDurableSotWorkQueueStore({ allowOptOut: false });
    if (durable) {
      singleton = durable;
      logDurableSot({
        event: "DURABLE_STORE_WRITE",
        domain: "work_queue",
        repository: "DurableSotWorkQueueStore",
        status: "selected",
      });
      return singleton;
    }
    logDurableSot({
      event: "LEGACY_FALLBACK_ATTEMPTED",
      domain: "work_queue",
      status: "blocked",
      errorCode: "DURABLE_SOT_UNAVAILABLE",
    });
    logDurableSot({
      event: "LEGACY_FALLBACK_BLOCKED",
      domain: "work_queue",
      repository: "getWorkQueueStore",
      status: "fail_closed",
      errorCode: "DURABLE_SOT_UNAVAILABLE",
    });
    throw new DurableSotUnavailableError(
      "Durable SoT unavailable — fail-closed (no memory/file/legacy fallback)",
    );
  }

  // --- Non-production explicit test file SoT (opt-in only) ---
  if (wantsExplicitTestFileStore()) {
    if (!flags.legacyStoreWriteEnabled) {
      logDurableSot({
        event: "LEGACY_STORE_ACCESS_BLOCKED",
        domain: "work_queue",
        repository: "FileWorkQueueStore",
        errorCode: "LEGACY_STORE_ACCESS_BLOCKED",
      });
      throw new LegacyStoreAccessBlockedError(
        "File SoT blocked — set ATLAS_LEGACY_STORE_WRITE_ENABLED=true for tests only",
      );
    }
    singleton = createFileWorkQueueStore();
    logDurableSot({
      event: "DURABLE_STORE_READ",
      domain: "work_queue",
      repository: "FileWorkQueueStore",
      status: "test_legacy_selected",
      detail: "non_production_explicit_legacy",
    });
    return singleton;
  }

  // --- Non-production default: Durable when enabled ---
  if (flags.durableSotEnabled) {
    const durable = tryCreateDurableSotWorkQueueStore({ allowOptOut: true });
    if (durable) {
      singleton = durable;
      return singleton;
    }
    logDurableSot({
      event: "LEGACY_FALLBACK_BLOCKED",
      domain: "work_queue",
      status: "fail_closed",
      errorCode: "DURABLE_SOT_UNAVAILABLE",
    });
    throw new DurableSotUnavailableError(
      "Durable SoT unavailable — fail-closed (no automatic legacy fallback)",
    );
  }

  logDurableSot({
    event: "LEGACY_FALLBACK_BLOCKED",
    domain: "work_queue",
    status: "fail_closed",
    detail: "durable_disabled_without_legacy",
  });
  throw new DurableSotUnavailableError(
    "Durable SoT disabled and legacy store not enabled — fail-closed",
  );
}

/**
 * Tests only: replace singleton with a file store.
 * Requires non-production + legacy write enabled.
 */
export function resetWorkQueueStoreForTests(path?: string): WorkQueueStore {
  const flags = resolveDurableSotCutoverFlags();
  if (flags.productionRuntime) {
    throw new LegacyStoreAccessBlockedError(
      "resetWorkQueueStoreForTests blocked in production runtime",
    );
  }
  if (!flags.legacyStoreWriteEnabled) {
    throw new LegacyStoreAccessBlockedError(
      "resetWorkQueueStoreForTests requires ATLAS_LEGACY_STORE_WRITE_ENABLED=true",
    );
  }
  singleton = createFileWorkQueueStore(
    path ??
      `${process.cwd()}/.data/work-queue-test-${process.pid}-${Date.now()}.json`,
  );
  return singleton;
}

/** Test helper: clear singleton between suites. */
export function clearWorkQueueStoreSingletonForTests(): void {
  singleton = null;
}

export type { WorkQueueStore } from "./interface";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearWorkQueueStoreSingletonForTests,
  getWorkQueueStore,
  resetWorkQueueStoreForTests,
} from "@/lib/work-queue/store";
import { resolveDurableSotCutoverFlags } from "./flags";
import {
  DurableSotUnavailableError,
  LegacyStoreAccessBlockedError,
} from "./errors";

describe("Phase 1-5 cutover flags", () => {
  it("production forces durable on and legacy off", () => {
    const flags = resolveDurableSotCutoverFlags({
      NODE_ENV: "production",
      ATLAS_LEGACY_STORE_WRITE_ENABLED: "true",
      ATLAS_LEGACY_STORE_READ_ENABLED: "true",
      ATLAS_DURABLE_SOT_ENABLED: "false",
    } as NodeJS.ProcessEnv);
    expect(flags.productionRuntime).toBe(true);
    expect(flags.durableSotEnabled).toBe(true);
    expect(flags.legacyStoreWriteEnabled).toBe(false);
    expect(flags.legacyStoreReadEnabled).toBe(false);
  });

  it("Vercel runtime is production-like", () => {
    const flags = resolveDurableSotCutoverFlags({
      NODE_ENV: "development",
      VERCEL: "1",
      ATLAS_LEGACY_STORE_WRITE_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(flags.productionRuntime).toBe(true);
    expect(flags.legacyStoreWriteEnabled).toBe(false);
  });

  it("non-prod requires explicit legacy write", () => {
    const flags = resolveDurableSotCutoverFlags({
      NODE_ENV: "development",
      ATLAS_LEGACY_STORE_WRITE_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(flags.legacyStoreWriteEnabled).toBe(true);
  });
});

describe("Phase 1-5 fail-closed factory", () => {
  // NODE_ENV is read-only in this TS target — never assign it; use ATLAS_DURABLE_SOT_CUTOVER.
  const keys = [
    "VERCEL",
    "ATLAS_DURABLE_SOT_CUTOVER",
    "ATLAS_WORK_QUEUE_FORCE_FILE",
    "ATLAS_LEGACY_STORE_WRITE_ENABLED",
    "ATLAS_DURABLE_SOT_ENABLED",
    "DATABASE_URL",
    "DURABLE_SOT_DATABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_DB_URL",
    "DIRECT_URL",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      const value = prev[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearWorkQueueStoreSingletonForTests();
  });

  function snapshotEnv() {
    for (const key of keys) prev[key] = process.env[key];
  }

  it("blocks silent file fallback in production without DB", () => {
    snapshotEnv();
    clearWorkQueueStoreSingletonForTests();
    process.env.ATLAS_DURABLE_SOT_CUTOVER = "true";
    delete process.env.DATABASE_URL;
    delete process.env.DURABLE_SOT_DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.SUPABASE_DB_URL;
    delete process.env.DIRECT_URL;
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    process.env.ATLAS_LEGACY_STORE_WRITE_ENABLED = "true";

    expect(() => getWorkQueueStore()).toThrow(DurableSotUnavailableError);
  });

  it("blocks FORCE_FILE without legacy write in non-prod", () => {
    snapshotEnv();
    clearWorkQueueStoreSingletonForTests();
    delete process.env.VERCEL;
    delete process.env.ATLAS_DURABLE_SOT_CUTOVER;
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    process.env.ATLAS_LEGACY_STORE_WRITE_ENABLED = "false";
    process.env.ATLAS_DURABLE_SOT_ENABLED = "false";
    delete process.env.DATABASE_URL;
    delete process.env.DURABLE_SOT_DATABASE_URL;

    expect(() => getWorkQueueStore()).toThrow(LegacyStoreAccessBlockedError);
  });

  it("allows explicit test file store when legacy write enabled", () => {
    snapshotEnv();
    clearWorkQueueStoreSingletonForTests();
    delete process.env.VERCEL;
    delete process.env.ATLAS_DURABLE_SOT_CUTOVER;
    process.env.ATLAS_LEGACY_STORE_WRITE_ENABLED = "true";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    process.env.ATLAS_DURABLE_SOT_ENABLED = "false";

    const store = resetWorkQueueStoreForTests(
      `${process.cwd()}/.data/cutover-test-${process.pid}.json`,
    );
    expect(store.kind).toBe("file");
  });
});

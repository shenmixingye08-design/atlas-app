import { afterEach, describe, expect, it } from "vitest";

import { classifyTickFailure } from "@/lib/work-queue/tick-diagnostics";
import { WorkQueueStoreUnavailableError } from "@/lib/work-queue/store";
import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";

const ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
  "DIRECT_URL",
  "SUPABASE_POSTGRES_URL",
] as const;

describe("tick diagnostics / postgres url resolution", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (key in saved) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        delete saved[key];
      }
    }
  });

  function stash(key: (typeof ENV_KEYS)[number]) {
    if (!(key in saved)) saved[key] = process.env[key];
  }

  it("classifies WorkQueueStoreUnavailableError", () => {
    const diag = classifyTickFailure(
      new WorkQueueStoreUnavailableError("missing url"),
      "work_queue",
    );
    expect(diag.developerCode).toBe("work_queue_store_unavailable");
    expect(diag.failedStage).toBe("work_queue");
  });

  it("classifies schema missing", () => {
    const diag = classifyTickFailure(
      new Error('relation "atlas_work_queue_jobs" does not exist'),
      "work_queue",
    );
    expect(diag.developerCode).toBe("work_queue_schema_missing");
  });

  it("resolves POSTGRES_URL_NON_POOLING when legacy keys absent", () => {
    for (const key of ENV_KEYS) stash(key);
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.POSTGRES_URL_NON_POOLING = "postgresql://example/db";
    const resolved = resolveAtlasPostgresUrl();
    expect(resolved.connectionString).toBe("postgresql://example/db");
    expect(resolved.legacyPresent).toBe(false);
    expect(resolved.extendedOnlyPresent).toBe(true);
  });
});

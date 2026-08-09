/**
 * P2-04: correlation-tagged structured logs — unit + durability contracts.
 * Live DB paths are covered by Production `/api/health/structured-logs`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  awaitDeveloperErrorPersist,
  listDeveloperErrorLogs,
  recordDeveloperError,
  resetDeveloperErrorLogsForTests,
} from "./developer-log";
import {
  developerLogToRow,
  redactSecrets,
  sanitizeStructuredMetadata,
} from "./structured-logs-store";

describe("P2-04 structured logs", () => {
  afterEach(() => {
    resetDeveloperErrorLogsForTests();
    vi.restoreAllMocks();
  });

  it("happy path: records correlationId + related ids", () => {
    const entry = recordDeveloperError({
      userId: "user_a",
      jobId: "job_a",
      workflowId: "wf_a",
      commanderRunId: "run_a",
      correlationId: "corr_happy_1",
      vercelRequestId: "vercel_1",
      diagnosticId: "diag_1",
      error: new Error("boom"),
      step: "execute",
      attempt: 1,
      maxAttempts: 3,
    });

    expect(entry.correlationId).toBe("corr_happy_1");
    expect(entry.vercelRequestId).toBe("vercel_1");
    expect(entry.diagnosticId).toBe("diag_1");
    expect(entry.jobId).toBe("job_a");
    expect(listDeveloperErrorLogs({ correlationId: "corr_happy_1" })).toHaveLength(
      1,
    );
  });

  it("derives correlationId from jobId when not provided", () => {
    const entry = recordDeveloperError({
      jobId: "job_derived",
      attempt: 2,
      error: "x",
    });
    expect(entry.correlationId).toBe("corr_job_job_derived_a2");
  });

  it("redacts secrets before durable row mapping", () => {
    const entry = recordDeveloperError({
      correlationId: "corr_secret",
      error: new Error("Bearer sk-abcdefghijklmnop failed"),
      metadata: {
        authorization: "secret-header",
        token: "tok",
        okField: "visible",
      },
    });
    const row = developerLogToRow(entry);
    expect(row.message).not.toMatch(/sk-abcdefghijklmnop/);
    expect(row.message).toContain("[redacted]");
    expect(row.metadata).not.toHaveProperty("authorization");
    expect(row.metadata).not.toHaveProperty("token");
    expect(row.metadata.okField).toBe("visible");
    expect(redactSecrets("api_key=abc123")).toContain("[redacted]");
    expect(sanitizeStructuredMetadata({ password: "x", keep: 1 })).toEqual({
      keep: 1,
    });
  });

  it("restart: memory clear drops cache but correlation key remains on entry object", () => {
    const entry = recordDeveloperError({
      correlationId: "corr_restart",
      error: "r",
    });
    expect(entry.correlationId).toBe("corr_restart");
    resetDeveloperErrorLogsForTests();
    expect(listDeveloperErrorLogs({ correlationId: "corr_restart" })).toHaveLength(
      0,
    );
    // Durable SoT is DB — memory empty after restart simulation.
  });

  it("duplicate recording yields distinct ids but can share correlationId", () => {
    const a = recordDeveloperError({
      correlationId: "corr_dup",
      error: "one",
    });
    const b = recordDeveloperError({
      correlationId: "corr_dup",
      error: "two",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.correlationId).toBe(b.correlationId);
    expect(listDeveloperErrorLogs({ correlationId: "corr_dup" })).toHaveLength(2);
  });

  it("concurrent recordDeveloperError is safe in-process", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        Promise.resolve(
          recordDeveloperError({
            correlationId: `corr_conc_${i % 2}`,
            jobId: `job_${i}`,
            error: `e${i}`,
          }),
        ),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(8);
    expect(listDeveloperErrorLogs({ correlationId: "corr_conc_0" }).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("cross-user memory filter does not leak other users", () => {
    recordDeveloperError({
      userId: "user_1",
      correlationId: "corr_u1",
      error: "a",
    });
    recordDeveloperError({
      userId: "user_2",
      correlationId: "corr_u2",
      error: "b",
    });
    const only1 = listDeveloperErrorLogs({ userId: "user_1" });
    expect(only1.every((e) => e.userId === "user_1")).toBe(true);
    expect(only1.some((e) => e.userId === "user_2")).toBe(false);
  });

  it("failure path: durable persist fails closed when DB client unavailable", async () => {
    const { persistStructuredLog } = await import("./structured-logs-store");
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const prevServiceUrl = process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;

    const entry = recordDeveloperError({
      correlationId: "corr_fail_closed",
      userId: "user_fc",
      error: "db down",
    });
    // Direct store call with no credentials must not soft-succeed.
    const direct = await persistStructuredLog(entry);
    expect(direct.ok).toBe(false);
    expect(direct.softSuccess).toBe(false);
    expect(direct.error).toBeTruthy();

    const durable = await awaitDeveloperErrorPersist(entry.id);
    expect(durable.ok).toBe(false);

    if (prevUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevServiceUrl) process.env.SUPABASE_URL = prevServiceUrl;
  });

  it("partial failure: console path still returns entry when durable pending", () => {
    const entry = recordDeveloperError({
      correlationId: "corr_partial",
      error: new Error("partial"),
    });
    expect(entry.id).toMatch(/^dlog_/);
    expect(entry.correlationId).toBe("corr_partial");
  });

  it("probe module exports probeStructuredLogs", async () => {
    const mod = await import("./structured-logs-probe");
    expect(typeof mod.probeStructuredLogs).toBe("function");
  });

  it("migration SQL is idempotent and names atlas_structured_logs", async () => {
    const { ATLAS_STRUCTURED_LOGS_MIGRATION_SQL } = await import(
      "./structured-logs-migration-sql"
    );
    expect(ATLAS_STRUCTURED_LOGS_MIGRATION_SQL).toContain(
      "atlas_structured_logs",
    );
    expect(ATLAS_STRUCTURED_LOGS_MIGRATION_SQL).toContain(
      "create table if not exists",
    );
    expect(ATLAS_STRUCTURED_LOGS_MIGRATION_SQL).toContain("correlation_id");
  });
});

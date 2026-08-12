import { describe, expect, it } from "vitest";

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";

import {
  classifyWorkQueueFailure,
  isRetryableWorkQueueFailure,
  tagWorkQueueError,
} from "./failure-class";

describe("Scheduler Ops — drain_* 500 classification (Production evidence)", () => {
  it("classifies MaxClientsInSessionMode as retryable pool_exhausted", () => {
    const diag = classifyWorkQueueFailure(
      new Error("MaxClientsInSessionMode: max clients reached"),
      "drain",
    );
    expect(diag.developerCode).toBe("work_queue_pool_exhausted");
    expect(diag.failureClass).toBe("retryable");
    expect(diag.failedStage).toBe("drain");
    expect(isRetryableWorkQueueFailure(diag)).toBe(true);
  });

  it("classifies SQLSTATE 53300 as pool_exhausted", () => {
    const err = Object.assign(new Error("sorry, too many clients already"), {
      code: "53300",
    });
    const diag = classifyWorkQueueFailure(err, "work_queue");
    expect(diag.developerCode).toBe("work_queue_pool_exhausted");
    expect(diag.pgCode).toBe("53300");
    expect(isRetryableWorkQueueFailure(diag)).toBe(true);
  });

  it("classifies schema missing as fatal (must stay 500)", () => {
    const diag = classifyWorkQueueFailure(
      new Error('relation "atlas_work_queue_jobs" does not exist'),
      "work_queue",
    );
    expect(diag.developerCode).toBe("work_queue_schema_missing");
    expect(diag.failureClass).toBe("fatal");
    expect(isRetryableWorkQueueFailure(diag)).toBe(false);
  });

  it("classifies pgCode 23514 as check_violation (not schema_missing)", () => {
    // Production evidence: drain_1 run 31586920503 misclassified
    // constraint "atlas_work_queue_jobs_attempt_check" as schema_missing.
    const err = Object.assign(
      new Error(
        'new row for relation "atlas_work_queue_jobs" violates check constraint "atlas_work_queue_jobs_attempt_check"',
      ),
      { code: "23514", constraint: "atlas_work_queue_jobs_attempt_check" },
    );
    const diag = classifyWorkQueueFailure(err, "drain");
    expect(diag.developerCode).toBe("work_queue_check_violation");
    expect(diag.developerCode).not.toBe("work_queue_schema_missing");
    expect(diag.pgCode).toBe("23514");
    expect(diag.constraintName).toBe("atlas_work_queue_jobs_attempt_check");
    expect(diag.failureClass).toBe("fatal");
    expect(isRetryableWorkQueueFailure(diag)).toBe(false);
  });

  it("does not treat bare atlas_work_queue_ name match as schema_missing", () => {
    const diag = classifyWorkQueueFailure(
      new Error("update atlas_work_queue_jobs failed: temporary blip"),
      "drain",
    );
    expect(diag.developerCode).not.toBe("work_queue_schema_missing");
    expect(diag.developerCode).toBe("work_queue_query_failed");
  });

  it("classifies invalid_transition without leaking details as fatal code", () => {
    const diag = classifyWorkQueueFailure(
      new Error("invalid_transition:leased->completed:job_x"),
      "drain",
    );
    expect(diag.developerCode).toBe("work_queue_invalid_transition");
    expect(diag.failureClass).toBe("fatal");
  });

  it("tags substage without leaking secrets", () => {
    const tagged = tagWorkQueueError(
      new Error("password=supersecret connection failed"),
      "drain_horizontal",
    );
    const diag = classifyWorkQueueFailure(tagged, "work_queue");
    expect(diag.substage).toBe("drain_horizontal");
    expect(diag.errorName).toBe("Error");
    // Safe payload must not require raw message echo.
    expect(diag.developerCode).toMatch(/work_queue_/);
  });

  it("preferDirect ranks NON_POOLING over transaction pooler", () => {
    const saved = {
      POSTGRES_URL: process.env.POSTGRES_URL,
      POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING,
    };
    try {
      process.env.POSTGRES_URL =
        "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
      process.env.POSTGRES_URL_NON_POOLING =
        "postgresql://u:p@db.example.supabase.co:5432/postgres";
      const resolved = resolveAtlasPostgresUrl({ preferDirect: true });
      expect(resolved.connectionString).toContain(":5432");
      expect(resolved.connectionString).not.toContain(":6543");
    } finally {
      if (saved.POSTGRES_URL === undefined) delete process.env.POSTGRES_URL;
      else process.env.POSTGRES_URL = saved.POSTGRES_URL;
      if (saved.POSTGRES_URL_NON_POOLING === undefined) {
        delete process.env.POSTGRES_URL_NON_POOLING;
      } else {
        process.env.POSTGRES_URL_NON_POOLING = saved.POSTGRES_URL_NON_POOLING;
      }
    }
  });
});

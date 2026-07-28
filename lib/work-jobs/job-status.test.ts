import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./durable", () => ({
  persistWorkJob: vi.fn(),
  loadWorkJobFromDisk: vi.fn(() => null),
  loadWorkJobFromDurable: vi.fn(async () => null),
}));

import {
  assertJobTransition,
  canMarkJobCompleted,
  canTransitionJobStatus,
  classifyWorkJobError,
  isStaleProcessingJob,
  normalizeJobBlockReason,
  normalizeJobStatus,
  timestampsForTransition,
  userMessageForJobError,
  WORK_JOB_ERROR_USER_MESSAGES,
} from "./job-status";
import { applyJobStatusTransition } from "./transition";
import { saveWorkJob, type WorkJobRecord } from "./store";

function seedJob(
  overrides: Partial<WorkJobRecord> & { id?: string } = {},
): WorkJobRecord {
  const now = new Date().toISOString();
  return saveWorkJob({
    id: overrides.id ?? `job_${Math.random().toString(36).slice(2, 10)}`,
    userId: "user_status_test",
    assignment: "テスト依頼",
    idempotencyKey: `idem_${Math.random().toString(36).slice(2, 10)}`,
    metadata: {},
    status: "queued",
    blockReason: null,
    attemptCount: 0,
    maxAttempts: 3,
    error: null,
    errorCode: null,
    internalError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    ...overrides,
  });
}

describe("canonical job status", () => {
  it("normalizes legacy statuses for compatibility", () => {
    expect(normalizeJobStatus("running")).toBe("processing");
    expect(normalizeJobStatus("awaiting_confirmation")).toBe("processing");
    expect(normalizeJobStatus("timeout")).toBe("timed_out");
    expect(normalizeJobStatus("canceled")).toBe("cancelled");
    expect(normalizeJobStatus("error")).toBe("failed");
    expect(normalizeJobStatus("complete")).toBe("completed");
    expect(normalizeJobBlockReason("awaiting_confirmation")).toBe(
      "awaiting_confirmation",
    );
  });

  it("allows only documented transitions", () => {
    expect(canTransitionJobStatus("queued", "processing")).toBe(true);
    expect(canTransitionJobStatus("queued", "cancelled")).toBe(true);
    expect(canTransitionJobStatus("processing", "completed")).toBe(true);
    expect(canTransitionJobStatus("processing", "failed")).toBe(true);
    expect(canTransitionJobStatus("processing", "timed_out")).toBe(true);
    expect(canTransitionJobStatus("processing", "cancelled")).toBe(true);

    expect(assertJobTransition("completed", "failed").ok).toBe(false);
    expect(assertJobTransition("failed", "processing").ok).toBe(false);
    expect(assertJobTransition("timed_out", "queued").ok).toBe(false);
    expect(assertJobTransition("cancelled", "processing").ok).toBe(false);
    expect(assertJobTransition("queued", "completed").ok).toBe(false);
  });

  it("requires durable artifacts before completed", () => {
    expect(
      canMarkJobCompleted({
        projectPersisted: false,
        wordRequired: false,
        wordDeliverablePresent: false,
      }).ok,
    ).toBe(false);

    expect(
      canMarkJobCompleted({
        projectPersisted: true,
        wordRequired: true,
        wordDeliverablePresent: false,
      }),
    ).toEqual({ ok: false, code: "DOCX_GENERATION_FAILED" });

    expect(
      canMarkJobCompleted({
        projectPersisted: true,
        wordRequired: true,
        wordDeliverablePresent: true,
      }).ok,
    ).toBe(true);
  });

  it("keeps user messages separate from internal codes", () => {
    for (const code of Object.keys(WORK_JOB_ERROR_USER_MESSAGES)) {
      const msg = userMessageForJobError(
        code as keyof typeof WORK_JOB_ERROR_USER_MESSAGES,
      );
      expect(msg).toMatch(/ください|います|しました/);
      expect(msg).not.toMatch(/stack|ECONNREFUSED|supabase/i);
    }
    expect(classifyWorkJobError("project_persist_failed")).toBe(
      "ARTIFACT_DB_SAVE_FAILED",
    );
    expect(classifyWorkJobError("docx packer failed")).toBe(
      "DOCX_GENERATION_FAILED",
    );
    expect(classifyWorkJobError("ETIMEDOUT")).toBe("TIMEOUT");
  });

  it("detects stale processing by updatedAt", () => {
    const now = Date.now();
    expect(
      isStaleProcessingJob(
        {
          status: "processing",
          updatedAt: new Date(now - 400_000).toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isStaleProcessingJob(
        {
          status: "processing",
          updatedAt: new Date(now - 1_000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isStaleProcessingJob(
        {
          status: "completed",
          updatedAt: new Date(now - 400_000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it("sets startedAt / completedAt / failedAt correctly", () => {
    const now = "2026-07-28T12:00:00.000Z";
    const processing = timestampsForTransition("processing", now, {});
    expect(processing.startedAt).toBe(now);
    expect(processing.completedAt).toBeNull();

    const completed = timestampsForTransition("completed", now, {
      startedAt: "2026-07-28T11:00:00.000Z",
    });
    expect(completed.completedAt).toBe(now);
    expect(completed.startedAt).toBe("2026-07-28T11:00:00.000Z");

    const failed = timestampsForTransition("timed_out", now, {
      startedAt: "2026-07-28T11:00:00.000Z",
    });
    expect(failed.failedAt).toBe(now);
  });
});

describe("applyJobStatusTransition", () => {
  beforeEach(() => {
    // Isolate in-memory bucket between tests by unique job ids.
  });

  it("applies a happy-path transition queue → processing → completed", () => {
    const job = seedJob();
    const toProcessing = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "processing",
    });
    expect(toProcessing.ok).toBe(true);
    if (!toProcessing.ok) return;
    expect(toProcessing.job.status).toBe("processing");
    expect(toProcessing.job.startedAt).toBeTruthy();

    const toCompleted = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "completed",
      completionGate: {
        projectPersisted: true,
        wordRequired: false,
        wordDeliverablePresent: false,
      },
    });
    expect(toCompleted.ok).toBe(true);
    if (!toCompleted.ok) return;
    expect(toCompleted.job.status).toBe("completed");
    expect(toCompleted.job.completedAt).toBeTruthy();
    expect(toCompleted.job.errorCode).toBeNull();
  });

  it("rejects illegal transitions without mutating", () => {
    const job = seedJob({ status: "completed", completedAt: new Date().toISOString() });
    const before = job.updatedAt;
    const rejected = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "failed",
      errorCode: "UNKNOWN_ERROR",
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe("JOB_STATUS_UPDATE_FAILED");
    expect(rejected.job?.status).toBe("completed");
    expect(rejected.job?.updatedAt).toBe(before);
  });

  it("rejects completed when artifact gate fails", () => {
    const job = seedJob({ status: "processing", startedAt: new Date().toISOString() });
    const rejected = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "completed",
      completionGate: {
        projectPersisted: false,
        wordRequired: false,
        wordDeliverablePresent: false,
      },
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe("ARTIFACT_DB_SAVE_FAILED");
    expect(rejected.job?.status).toBe("processing");
  });

  it("stores internal error code on failed", () => {
    const job = seedJob({ status: "processing", startedAt: new Date().toISOString() });
    const failed = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "failed",
      errorCode: "AI_GENERATION_FAILED",
      internalError: "openai empty_deliverable stacktrace://secret",
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.job.status).toBe("failed");
    expect(failed.job.errorCode).toBe("AI_GENERATION_FAILED");
    expect(failed.job.internalError).toContain("empty_deliverable");
    expect(failed.job.error).toBe(
      WORK_JOB_ERROR_USER_MESSAGES.AI_GENERATION_FAILED,
    );
    expect(failed.job.error).not.toContain("stacktrace");
    expect(failed.job.failedAt).toBeTruthy();
  });

  it("transitions processing → timed_out with timeout reason", () => {
    const job = seedJob({ status: "processing", startedAt: new Date().toISOString() });
    const timedOut = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "timed_out",
      errorCode: "TIMEOUT",
      internalError: "stale_processing_max_attempts",
      metadataPatch: { timeoutReason: "stale_processing_max_attempts" },
    });
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.job.status).toBe("timed_out");
    expect(timedOut.job.errorCode).toBe("TIMEOUT");
    expect(timedOut.job.metadata.timeoutReason).toBe(
      "stale_processing_max_attempts",
    );
    expect(timedOut.job.failedAt).toBeTruthy();
  });

  it("is idempotent for duplicate completed transitions", () => {
    const job = seedJob({
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    const again = applyJobStatusTransition({
      jobId: job.id,
      userId: job.userId,
      to: "completed",
      completionGate: {
        projectPersisted: true,
        wordRequired: false,
        wordDeliverablePresent: false,
      },
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.noop).toBe(true);
    expect(again.job.status).toBe("completed");
  });

  it("normalizes legacy awaiting_confirmation records via store", () => {
    const job = saveWorkJob({
      id: `legacy_${Math.random().toString(36).slice(2, 8)}`,
      userId: "user_status_test",
      assignment: "旧ステータス",
      idempotencyKey: "legacy-key",
      metadata: {},
      // Simulate pre-migration payload
      status: "awaiting_confirmation" as unknown as WorkJobRecord["status"],
      blockReason: null,
      attemptCount: 1,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: null,
    });
    expect(job.status).toBe("processing");
    expect(job.blockReason).toBe("awaiting_confirmation");
  });

  it("normalizes legacy running records via store", () => {
    const job = saveWorkJob({
      id: `legacy_run_${Math.random().toString(36).slice(2, 8)}`,
      userId: "user_status_test",
      assignment: "旧running",
      idempotencyKey: "legacy-run-key",
      metadata: {},
      status: "running" as unknown as WorkJobRecord["status"],
      blockReason: null,
      attemptCount: 1,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: null,
    });
    expect(job.status).toBe("processing");
    expect(job.blockReason).toBeNull();
  });
});

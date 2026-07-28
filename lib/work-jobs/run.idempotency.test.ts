import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./durable", () => ({
  persistWorkJob: vi.fn(),
  loadWorkJobFromDisk: vi.fn(() => null),
  loadWorkJobFromDurable: vi.fn(async () => null),
}));

const runCommanderRequest = vi.fn();
vi.mock("@/lib/commander/service", () => ({
  runCommanderRequest: (...args: unknown[]) => runCommanderRequest(...args),
}));

vi.mock("@/lib/reliability", () => ({
  recordReliabilityEvent: vi.fn(),
  withRetry: async <T>(fn: (attempt: number) => Promise<T>) => fn(1),
}));

vi.mock("@/lib/reliability/human-errors", () => ({
  toHumanReliabilityMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

import { executeWorkJob } from "./run";
import { saveWorkJob } from "./store";

describe("executeWorkJob idempotency", () => {
  beforeEach(() => {
    runCommanderRequest.mockReset();
  });

  it("does not re-execute a completed job (duplicate deliverable prevention)", async () => {
    const job = saveWorkJob({
      id: "job_done_1",
      userId: "user_idem",
      assignment: "完了済み",
      idempotencyKey: "idem-done",
      metadata: { projectId: "commander-run1" },
      status: "completed",
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
      completedAt: new Date().toISOString(),
      failedAt: null,
    });

    const again = await executeWorkJob(job.id, job.userId);
    expect(again.status).toBe("completed");
    expect(runCommanderRequest).not.toHaveBeenCalled();
  });

  it("does not re-execute a failed terminal job", async () => {
    const job = saveWorkJob({
      id: "job_failed_1",
      userId: "user_idem",
      assignment: "失敗済み",
      idempotencyKey: "idem-failed",
      metadata: {},
      status: "failed",
      blockReason: null,
      attemptCount: 2,
      maxAttempts: 3,
      error: "失敗",
      errorCode: "AI_GENERATION_FAILED",
      internalError: "ai",
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failedAt: new Date().toISOString(),
    });

    const again = await executeWorkJob(job.id, job.userId);
    expect(again.status).toBe("failed");
    expect(runCommanderRequest).not.toHaveBeenCalled();
  });

  it("marks completed only when commander persistence gate passes", async () => {
    const job = saveWorkJob({
      id: "job_gate_1",
      userId: "user_idem",
      assignment: "ゲート",
      idempotencyKey: "idem-gate",
      metadata: {},
      status: "queued",
      blockReason: null,
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
    });

    runCommanderRequest.mockResolvedValue({
      runId: "run_gate",
      status: "completed",
      result: {
        assignment: "ゲート",
        status: "completed",
        workflow: { status: "completed" },
        ceo: null,
        plannerPlan: null,
        plannerTasks: null,
        tasks: [],
        executions: [],
        deliverable: { title: "t", body: "b" },
        reviewComments: "",
        approved: true,
        finalResponse: "ok",
        totalDurationMs: 1,
        error: null,
      },
      report: { summary: "ok" },
      persistence: {
        projectId: "commander-run_gate",
        projectPersisted: true,
        wordRequired: false,
        wordDeliverableId: null,
        notificationCreated: true,
      },
    });

    const done = await executeWorkJob(job.id, job.userId);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTruthy();
  });

  it("fails when commander claims completed but project was not persisted", async () => {
    const job = saveWorkJob({
      id: "job_gate_fail",
      userId: "user_idem",
      assignment: "未保存",
      idempotencyKey: "idem-gate-fail",
      metadata: {},
      status: "queued",
      blockReason: null,
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
    });

    runCommanderRequest.mockResolvedValue({
      runId: "run_missing",
      status: "completed",
      result: {
        assignment: "未保存",
        status: "completed",
        finalResponse: "ok",
        error: null,
      },
      report: { summary: "ok" },
      persistence: {
        projectId: null,
        projectPersisted: false,
        wordRequired: false,
        wordDeliverableId: null,
        notificationCreated: false,
      },
    });

    const failed = await executeWorkJob(job.id, job.userId);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("ARTIFACT_DB_SAVE_FAILED");
    expect(failed.failedAt).toBeTruthy();
  });

  it("maps thrown timeout to timed_out with TIMEOUT code", async () => {
    const job = saveWorkJob({
      id: "job_timeout_1",
      userId: "user_idem",
      assignment: "タイムアウト",
      idempotencyKey: "idem-timeout",
      metadata: {},
      status: "queued",
      blockReason: null,
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      errorCode: null,
      internalError: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
    });

    runCommanderRequest.mockRejectedValue(new Error("ETIMEDOUT after 300s"));

    const timedOut = await executeWorkJob(job.id, job.userId);
    expect(timedOut.status).toBe("timed_out");
    expect(timedOut.errorCode).toBe("TIMEOUT");
    expect(timedOut.metadata.timeoutReason).toMatch(/ETIMEDOUT/);
  });
});

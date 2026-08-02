import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/owner/monitoring", () => ({
  recordMonitoringIncident: vi.fn(),
}));

import { markJobCompleted, markJobRunning } from "@/lib/jobs/reliability";
import {
  claimAutomationJob,
  resetAutomationJobStoreForTests,
} from "@/lib/jobs/job-store";
import { evaluateCompletionEvidence } from "@/lib/jobs/completion-evidence";

import {
  assertSchedulerAllowsCompletion,
  beginSchedulerTick,
  buildSchedulerHealth,
  classifySchedulerFailure,
  computeSchedulerMetrics,
  evaluateSchedulerAlerts,
  finishSchedulerTick,
  listSchedulerHistory,
  markSchedulerStopped,
  noteSchedulerJobStarted,
  recordQueueDepthSample,
  recordSchedulerExecution,
  resetSchedulerStoreForTests,
} from "./index";

describe("scheduler failure classification", () => {
  it("classifies timeout / worker busy / queue full / storage / api / permission", () => {
    expect(classifySchedulerFailure("request timeout")).toBe("timeout");
    expect(classifySchedulerFailure("worker busy")).toBe("worker_busy");
    expect(classifySchedulerFailure("queue full")).toBe("queue_full");
    expect(classifySchedulerFailure("storage upload failed")).toBe("storage");
    expect(classifySchedulerFailure("OpenAI 429 rate limit")).toBe("external_api");
    expect(classifySchedulerFailure("permission denied")).toBe("permission");
    expect(classifySchedulerFailure("weird boom")).toBe("unknown");
  });
});

describe("scheduler history + metrics + health", () => {
  beforeEach(() => {
    resetSchedulerStoreForTests();
    resetAutomationJobStoreForTests();
  });

  it("records required evidence fields on normal success", () => {
    beginSchedulerTick("2026-08-02T09:00:00.000Z");
    const row = recordSchedulerExecution({
      jobId: "job-1",
      runId: "run-1",
      scheduleId: "occurrence:auto:2026-08-02T09:00:00.000Z",
      automationId: "auto",
      scheduledAt: "2026-08-02T09:00:00.000Z",
      startedAt: "2026-08-02T09:00:00.250Z",
      endedAt: "2026-08-02T09:00:01.000Z",
      success: true,
      retryCount: 0,
      workerId: "scheduler:test:1",
      source: "proof",
    });
    finishSchedulerTick({ ok: true, at: "2026-08-02T09:00:01.000Z" });

    expect(row.jobId).toBe("job-1");
    expect(row.runId).toBe("run-1");
    expect(row.scheduleId).toContain("occurrence:");
    expect(row.delayMs).toBe(250);
    expect(row.durationMs).toBe(750);
    expect(row.success).toBe(true);
    expect(row.workerId).toBe("scheduler:test:1");
    expect(listSchedulerHistory(1)[0]?.id).toBe(row.id);

    const metrics = computeSchedulerMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.averageDelayMs).toBe(250);
  });

  it("Scheduler遅延を delayMs として記録する", () => {
    beginSchedulerTick();
    recordSchedulerExecution({
      jobId: "job-delay",
      runId: "run-delay",
      scheduleId: "sched-delay",
      scheduledAt: "2026-08-02T10:00:00.000Z",
      startedAt: "2026-08-02T10:00:05.000Z",
      endedAt: "2026-08-02T10:00:05.500Z",
      success: true,
      source: "proof",
    });
    const metrics = computeSchedulerMetrics();
    expect(metrics.averageDelayMs).toBe(5000);
    expect(metrics.maxDelayMs).toBe(5000);
  });

  it("Scheduler停止時は alert と health=down", async () => {
    markSchedulerStopped("manual_stop");
    const alerts = await evaluateSchedulerAlerts({ emitIncidents: false });
    const health = await buildSchedulerHealth();
    expect(alerts.some((a) => a.id === "scheduler_stopped")).toBe(true);
    expect(health.schedulerStopped).toBe(true);
    expect(health.level).toBe("down");
  });

  it("Success Rate < 95% で alert", async () => {
    beginSchedulerTick();
    finishSchedulerTick({ ok: true });
    for (let i = 0; i < 20; i += 1) {
      recordSchedulerExecution({
        jobId: `job-${i}`,
        runId: `run-${i}`,
        scheduleId: `sched-${i}`,
        scheduledAt: new Date(Date.UTC(2026, 7, 2, 9, i)).toISOString(),
        startedAt: new Date(Date.UTC(2026, 7, 2, 9, i, 0, 100)).toISOString(),
        endedAt: new Date(Date.UTC(2026, 7, 2, 9, i, 0, 200)).toISOString(),
        success: i < 18,
        failureReason: i < 18 ? null : "unknown",
        source: "proof",
      });
    }
    const alerts = await evaluateSchedulerAlerts({ emitIncidents: false });
    expect(alerts.some((a) => a.id === "success_rate_low")).toBe(true);
  });

  it("Queue増加で alert", async () => {
    beginSchedulerTick();
    finishSchedulerTick({ ok: true });
    recordQueueDepthSample(10);
    recordQueueDepthSample(30);
    recordQueueDepthSample(60);
    // Seed memory jobs so queue snapshot is high.
    for (let i = 0; i < 55; i += 1) {
      await claimAutomationJob({
        id: `q-${i}`,
        userId: "u",
        automationId: "a",
        idempotencyKey: `k-${i}`,
      });
    }
    const alerts = await evaluateSchedulerAlerts({
      emitIncidents: false,
      thresholds: { queueGrowth: 50 },
    });
    expect(alerts.some((a) => a.id === "queue_growth")).toBe(true);
  });

  it("Retry回数を記録する", () => {
    beginSchedulerTick();
    recordSchedulerExecution({
      jobId: "job-retry",
      runId: "run-retry",
      scheduleId: "sched-retry",
      scheduledAt: "2026-08-02T11:00:00.000Z",
      startedAt: "2026-08-02T11:00:00.100Z",
      endedAt: "2026-08-02T11:00:00.200Z",
      success: false,
      failureReason: "timeout",
      retryCount: 2,
      source: "reliability_retry",
    });
    expect(computeSchedulerMetrics().retryCount).toBe(2);
  });

  it("Worker停止 / Queue満杯 / Storage失敗 / API失敗を分類記録", () => {
    beginSchedulerTick();
    const cases = [
      ["worker busy", "worker_busy"],
      ["queue full", "queue_full"],
      ["storage persist failed", "storage"],
      ["external api 503", "external_api"],
    ] as const;
    for (const [message, reason] of cases) {
      const row = recordSchedulerExecution({
        jobId: `job-${reason}`,
        runId: `run-${reason}`,
        scheduleId: `sched-${reason}`,
        scheduledAt: "2026-08-02T12:00:00.000Z",
        startedAt: "2026-08-02T12:00:00.100Z",
        endedAt: "2026-08-02T12:00:00.200Z",
        success: false,
        error: message,
        source: "proof",
      });
      expect(row.failureReason).toBe(reason);
    }
  });
});

describe("scheduler fail-closed completion gate", () => {
  beforeEach(() => {
    resetSchedulerStoreForTests();
    resetAutomationJobStoreForTests();
  });

  it("Scheduler未起動では completed 禁止", async () => {
    const claim = await claimAutomationJob({
      id: "job-gate-1",
      userId: "u1",
      automationId: "a1",
      idempotencyKey: "automation:u1:a1:2026-08-02T09:00:00.000Z",
      scheduledAt: "2026-08-02T09:00:00.000Z",
    });
    expect(claim.action).toBe("created");
    await markJobRunning({ jobId: "job-gate-1", userId: "u1" });

    const gate = assertSchedulerAllowsCompletion({
      requireScheduled: true,
      jobId: "job-gate-1",
    });
    expect(gate.allowed).toBe(false);

    const completed = await markJobCompleted({
      jobId: "job-gate-1",
      userId: "u1",
      status: "completed",
      resultSummary: "should not complete",
    });
    expect(completed.status).toBe("failed");
    expect(completed.lastErrorCode).toMatch(/scheduler_/);
  });

  it("正常終了（Scheduler起動+開始証跡）のみ completed", async () => {
    beginSchedulerTick();
    finishSchedulerTick({ ok: true });
    noteSchedulerJobStarted({
      jobId: "job-ok",
      runId: "job-ok",
      scheduleId: "automation:u1:a1:2026-08-02T09:00:00.000Z",
    });
    recordSchedulerExecution({
      jobId: "job-ok",
      runId: "job-ok",
      scheduleId: "automation:u1:a1:2026-08-02T09:00:00.000Z",
      scheduledAt: "2026-08-02T09:00:00.000Z",
      startedAt: "2026-08-02T09:00:00.050Z",
      endedAt: "2026-08-02T09:00:00.200Z",
      success: true,
      source: "v1_tick",
    });

    await claimAutomationJob({
      id: "job-ok",
      userId: "u1",
      automationId: "a1",
      idempotencyKey: "automation:u1:a1:2026-08-02T09:00:00.000Z",
      scheduledAt: "2026-08-02T09:00:00.000Z",
    });
    await markJobRunning({ jobId: "job-ok", userId: "u1" });
    const completed = await markJobCompleted({
      jobId: "job-ok",
      userId: "u1",
      status: "completed",
      resultSummary: "done",
    });
    expect(completed.status).toBe("completed");
  });

  it("completion evidence: schedulerStarted=false は failed", () => {
    const result = evaluateCompletionEvidence({
      orchestrationStatus: "completed",
      approved: true,
      deliverableCount: 1,
      snsPostFailure: null,
      storageUrl: "https://example.com/file",
      requireScheduled: true,
      schedulerStarted: false,
    });
    expect(result.status).toBe("failed");
  });
});

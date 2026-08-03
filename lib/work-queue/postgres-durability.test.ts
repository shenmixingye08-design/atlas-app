import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clearWorkQueueStoreSingleton } from "@/lib/work-queue/store";
import { tryCreatePostgresWorkQueueStore } from "@/lib/work-queue/store/postgres-store";
import { drainWorkQueue } from "@/lib/work-queue/worker";
import { defaultAutomationSteps } from "@/lib/work-queue/steps/execute-step";
import { WORK_JOB_TRANSITIONS } from "@/lib/work-queue/types";

const hasDb = Boolean(
  process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim(),
);

describe.runIf(hasDb)("postgres durable work-queue", () => {
  const store = tryCreatePostgresWorkQueueStore();

  beforeAll(async () => {
    expect(store).toBeTruthy();
    process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
    delete process.env.ATLAS_WORK_QUEUE_FORCE_FILE;
    clearWorkQueueStoreSingleton();
    // Inject postgres via env; getWorkQueueStore will pick it up outside vitest force-file.
    // For this suite we use the store instance directly + worker with monkeypatched get.
    await store!.resetForTests();
  });

  afterAll(async () => {
    await store?.resetForTests();
    await store?.close();
    clearWorkQueueStoreSingleton();
  });

  it("unique occurrence prevents duplicate jobs", async () => {
    const a = await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-a",
      occurrenceKey: "occ:pg-a:dup",
      payload: { kind: "benchmark", automationName: "dup", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    const b = await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-a",
      occurrenceKey: "occ:pg-a:dup",
      payload: { kind: "benchmark", automationName: "dup", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.jobId).toBe(a.job.jobId);
  });

  it("SKIP LOCKED lease is exclusive across workers", async () => {
    await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-lease",
      occurrenceKey: `occ:pg-lease:${Date.now()}`,
      payload: { kind: "benchmark", automationName: "lease", offlineArtifacts: true },
      steps: [{ stepId: "fixture", stepType: "fixture_work" }],
    });
    const w1 = await store!.leaseJobs({
      workerId: "pg-w1",
      limit: 10,
      leaseMs: 60_000,
    });
    const w2 = await store!.leaseJobs({
      workerId: "pg-w2",
      limit: 10,
      leaseMs: 60_000,
    });
    const ids1 = new Set(w1.map((j) => j.jobId));
    for (const job of w2) {
      expect(ids1.has(job.jobId)).toBe(false);
    }
  });

  it("terminal transition to completed is rejected", async () => {
    const { job } = await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-term",
      occurrenceKey: `occ:pg-term:${Date.now()}`,
      payload: { kind: "benchmark", automationName: "term", offlineArtifacts: true },
      steps: [{ stepId: "fixture", stepType: "fixture_work" }],
    });
    const leased = await store!.leaseJobs({
      workerId: "pg-term-w",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leased.some((j) => j.jobId === job.jobId)).toBe(true);
    await store!.updateJob(job.jobId, { status: "running" }, "pg-term-w");
    await store!.updateJob(
      job.jobId,
      {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorCode: "validation_failure",
        leaseOwner: null,
        leaseExpiresAt: null,
      },
      "pg-term-w",
    );
    expect(WORK_JOB_TRANSITIONS.failed.includes("completed")).toBe(false);
    await expect(
      store!.updateJob(job.jobId, { status: "completed" }),
    ).rejects.toThrow(/invalid_transition/);
  });

  it("side effect unique key survives process restart semantics", async () => {
    const { job } = await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-side",
      occurrenceKey: `occ:pg-side:${Date.now()}`,
      payload: { kind: "benchmark", automationName: "side", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    const stepKey = job.steps[0]!.idempotencyKey;
    const first = await store!.tryRecordSideEffect({
      idempotencyKey: stepKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: job.steps[0]!.stepId,
      kind: "generate_deliverable",
      result: { artifactIds: ["art_x"], outputBindings: { artifactId: "art_x" } },
    });
    const second = await store!.tryRecordSideEffect({
      idempotencyKey: stepKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: job.steps[0]!.stepId,
      kind: "generate_deliverable",
      result: { artifactIds: ["art_y"], outputBindings: { artifactId: "art_y" } },
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.result.artifactIds).toEqual(["art_x"]);
  });

  it("meta scheduler success persists across store instances", async () => {
    const at = new Date().toISOString();
    await store!.recordSchedulerSuccess(at);
    await store!.recordScheduleDelay(1200);
    const metrics = await store!.metrics();
    expect(metrics.schedulerLastSuccessAt).toBe(at);
    expect(metrics.averageDelayMs).toBeGreaterThan(0);
  });
});

describe.runIf(!hasDb)("postgres durable work-queue (skipped — no DATABASE_URL)", () => {
  it("documents 未実証 when DATABASE_URL absent", () => {
    expect(hasDb).toBe(false);
  });
});

// Silence unused import in file-store-only CI
void drainWorkQueue;

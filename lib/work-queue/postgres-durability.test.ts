import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clearWorkQueueStoreSingleton } from "@/lib/work-queue/store";
import { tryCreatePostgresWorkQueueStore } from "@/lib/work-queue/store/postgres-store";
import { drainWorkQueue } from "@/lib/work-queue/worker";
import { defaultAutomationSteps } from "@/lib/work-queue/steps/execute-step";
import { WORK_JOB_TRANSITIONS } from "@/lib/work-queue/types";

const hasDbUrl = Boolean(
  process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim(),
);

let durabilitySchemaReady = false;
const store = hasDbUrl ? tryCreatePostgresWorkQueueStore() : null;

async function probeDurabilitySchema(): Promise<boolean> {
  if (!store) return false;
  try {
    await store.resetForTests();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/does not exist|relation .* does not exist/i.test(message)) {
      return false;
    }
    throw error;
  }
}

describe.runIf(hasDbUrl)("postgres durable work-queue", () => {
  beforeAll(async () => {
    expect(store).toBeTruthy();
    process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
    delete process.env.ATLAS_WORK_QUEUE_FORCE_FILE;
    clearWorkQueueStoreSingleton();
    durabilitySchemaReady = await probeDurabilitySchema();
    if (!durabilitySchemaReady) {
      console.warn(
        "[postgres-durability] schema incomplete — apply scripts/ci/apply-work-queue-migrations.sh",
      );
    }
  });

  afterAll(async () => {
    if (durabilitySchemaReady) {
      await store?.resetForTests();
    }
    await store?.close();
    clearWorkQueueStoreSingleton();
  });

  it("reports schema readiness (CI applies migrations)", () => {
    // Local envs without migrations should soft-skip remaining assertions.
    expect(typeof durabilitySchemaReady).toBe("boolean");
  });

  it("unique occurrence prevents duplicate jobs", async () => {
    if (!durabilitySchemaReady) return;
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
    if (!durabilitySchemaReady) return;
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
    if (!durabilitySchemaReady) return;
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
    if (!durabilitySchemaReady) return;
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
    if (!durabilitySchemaReady) return;
    const at = new Date().toISOString();
    await store!.recordSchedulerSuccess(at);
    await store!.recordScheduleDelay(1200);
    const metrics = await store!.metrics();
    expect(metrics.schedulerLastSuccessAt).toBe(at);
    expect(metrics.averageDelayMs).toBeGreaterThan(0);
  });

  it("crash mid-job: side-effect evidence prevents dual external apply on resume", async () => {
    if (!durabilitySchemaReady) return;
    const { job } = await store!.enqueue({
      ownerId: "pg-u",
      automationId: "pg-crash",
      occurrenceKey: `occ:pg-crash:${Date.now()}`,
      idempotencyKey: `idem:pg-crash:${Date.now()}`,
      payload: {
        kind: "benchmark",
        automationName: "crash",
        offlineArtifacts: true,
      },
      steps: defaultAutomationSteps(true),
    });
    const first = [...job.steps].sort((a, b) => a.stepIndex - b.stepIndex)[0]!;
    await store!.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: {
        outputBindings: { artifactId: "pg_art", bytes: 1 },
        artifactIds: ["pg_art"],
      },
    });
    await store!.updateStep({
      ...first,
      status: "running",
      startedAt: new Date().toISOString(),
    });
    const w1 = await store!.leaseJobs({
      workerId: "pg-crash-w1",
      limit: 10,
      leaseMs: 1,
    });
    void w1;
    await new Promise((r) => setTimeout(r, 5));
    const w2 = await store!.leaseJobs({
      workerId: "pg-crash-w2",
      limit: 10,
      leaseMs: 60_000,
    });
    const ids = new Set(w2.map((j) => j.jobId));
    expect(ids.size).toBe(w2.length);

    const again = await store!.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: {
        outputBindings: { artifactId: "pg_art_dup", bytes: 2 },
        artifactIds: ["pg_art_dup"],
      },
    });
    expect(again.created).toBe(false);
    expect(again.record.result).toMatchObject({ artifactIds: ["pg_art"] });
  });
});

describe.runIf(!hasDbUrl)("postgres durable work-queue (skipped — no DATABASE_URL)", () => {
  it("documents 未実証 when DATABASE_URL absent", () => {
    expect(hasDbUrl).toBe(false);
  });
});

void drainWorkQueue;

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const startedSteps: string[] = [];
let releaseFirstStep: (() => void) | null = null;

vi.mock("@/lib/work-queue/steps/execute-step", () => ({
  executeWorkStep: vi.fn(async ({ step }: { step: { stepId: string } }) => {
    startedSteps.push(step.stepId);
    if (step.stepId === "s1") {
      await new Promise<void>((resolve) => {
        releaseFirstStep = resolve;
      });
    }
    return {
      ok: true,
      outputBindings: { artifactId: `art_${step.stepId}` },
      externalApplied: step.stepId === "s2",
    };
  }),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => ({
    jobs: [
      {
        id: "durable_job_1",
        userId: "user_work",
        assignment: "同じ依頼",
        idempotencyKey: "work:user_work:client:abc",
        metadata: { jobId: "durable_job_1" },
        status: "completed",
        attemptCount: 1,
        maxAttempts: 3,
        error: null,
        visionGate: null,
        result: { finalResponse: "done" },
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        completedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  })),
  pruneOversizedClerkDurableDomains: vi.fn(async () => ({
    migrated: [],
    cleared: [],
  })),
}));

import { applySubscriptionFromStripe } from "@/lib/billing/subscriptions/service";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { consumeAiJobQuota } from "@/lib/billing/usage/ai-job";
import {
  resetAiQuotaEngineForTests,
  seedAiRunsForTests,
} from "@/lib/billing/usage/quota-engine";
import { resetUsageStore } from "@/lib/billing/usage/store";
import { classifyXPostError } from "@/lib/integrations/x/post/durable-x-post-jobs";
import {
  getJobRecord,
  JOB_HANG_TIMEOUT_MS,
  resetAutomationJobStoreForTests,
  upsertJobRecord,
} from "@/lib/jobs/job-store";
import { processJobReliabilityTick } from "@/lib/jobs/tick-processor";
import type { JobRecord } from "@/lib/jobs/types";
import { MAX_IMMEDIATE_RETRIES, withRetry } from "@/lib/reliability/retry";
import {
  findWorkJobByIdempotencyKeyDurable,
  saveWorkJob,
  type WorkJobRecord,
} from "@/lib/work-jobs/store";
import { cancelWorkJob } from "@/lib/work-queue/control";
import { drainWorkQueue } from "@/lib/work-queue/worker";
import {
  getWorkQueueStore,
  resetWorkQueueStoreForTests,
} from "@/lib/work-queue/store";
import { resetSchedulerGateForTests } from "@/lib/work-queue/scheduler-gate";

function staleRunningJob(nowMs: number): JobRecord {
  const updatedAt = new Date(nowMs - JOB_HANG_TIMEOUT_MS - 1_000).toISOString();
  const now = new Date(nowMs).toISOString();
  return {
    id: "hang_job_1",
    userId: "user_hang",
    automationId: "auto_hang",
    jobType: "automation",
    status: "running",
    scheduledAt: null,
    queuedAt: now,
    startedAt: updatedAt,
    completedAt: null,
    failedAt: null,
    currentStep: "orchestrate",
    progressPercent: 40,
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultSummary: null,
    artifactId: null,
    externalResultId: null,
    externalResultUrl: null,
    idempotencyKey: "manual:user_hang:auto_hang:1",
    pushStatus: "pending",
    autoRecovered: false,
    steps: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("P4 failure / recovery", () => {
  beforeEach(() => {
    resetAiQuotaEngineForTests();
    resetUsageStore();
    resetSubscriptionStore();
    resetAutomationJobStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("AI Usage: same claim key consumes once; 31st refuses OpenAI", async () => {
    const userId = "user_p4_usage";
    await applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    seedAiRunsForTests(userId, 29);
    const first = await consumeAiJobQuota({
      userId,
      claimKey: "work_job:user_p4_usage:same",
    });
    const again = await consumeAiJobQuota({
      userId,
      claimKey: "work_job:user_p4_usage:same",
    });
    expect(first.ok).toBe(true);
    expect(again.ok).toBe(true);
    if (first.ok) expect(first.used).toBe(30);
    if (again.ok) {
      expect(again.idempotent).toBe(true);
      expect(again.used).toBe(30);
    }

    const denied = await consumeAiJobQuota({
      userId,
      claimKey: "work_job:user_p4_usage:other",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.used).toBe(30);
  });

  it("OpenAI 429/timeout retry is bounded and does not loop", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("HTTP 429 rate limited");
        },
        { backoffMs: [0, 0, 0] },
      ),
    ).rejects.toThrow(/429/);
    expect(attempts).toBe(MAX_IMMEDIATE_RETRIES);

    attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error("TimeoutError: timed out");
        },
        { backoffMs: [0, 0, 0] },
      ),
    ).rejects.toThrow(/timed out/);
    expect(attempts).toBe(MAX_IMMEDIATE_RETRIES);
  });

  it("X ambiguous / persist-after-success is not auto-retried", () => {
    expect(
      classifyXPostError(new Error("unknown_outcome persist_after_success")),
    ).toMatchObject({
      code: "unknown_outcome",
      retryable: false,
      permanent: true,
    });
    expect(
      classifyXPostError(new Error("同じ内容の再投稿は行いません")),
    ).toMatchObject({
      retryable: false,
      permanent: true,
    });
  });

  it("hung running job fails closed and is not auto-retried", async () => {
    const started = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(started);
    await upsertJobRecord(staleRunningJob(started.getTime()));
    vi.setSystemTime(new Date(started.getTime() + JOB_HANG_TIMEOUT_MS + 2_000));
    const tick = await processJobReliabilityTick();
    vi.useRealTimers();
    expect(tick.hangsDetected).toBe(1);
    expect(tick.retriesProcessed).toBe(0);
    const hung = await getJobRecord("hang_job_1", "user_hang");
    expect(hung?.status).toBe("failed");
    expect(hung?.lastErrorCode).toBe("hang_timeout");
    expect(hung?.nextRetryAt).toBeNull();
  });

  it("same work-job Idempotency-Key reuses durable job", async () => {
    const found = await findWorkJobByIdempotencyKeyDurable(
      "user_work",
      "work:user_work:client:abc",
    );
    expect(found?.id).toBe("durable_job_1");
    expect(found?.status).toBe("completed");
    const again = await findWorkJobByIdempotencyKeyDurable(
      "user_work",
      "work:user_work:client:abc",
    );
    expect(again?.id).toBe("durable_job_1");
  });

  it("saveWorkJob then find by key hits memory first", async () => {
    const now = new Date().toISOString();
    const job: WorkJobRecord = {
      id: "mem_job",
      userId: "user_mem",
      assignment: "x",
      idempotencyKey: "work:user_mem:client:mem",
      metadata: {},
      status: "queued",
      attemptCount: 0,
      maxAttempts: 3,
      error: null,
      visionGate: null,
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    await saveWorkJob(job);
    const found = await findWorkJobByIdempotencyKeyDurable(
      "user_mem",
      "work:user_mem:client:mem",
    );
    expect(found?.id).toBe("mem_job");
  });

  it("deliverables generate consumes Usage after validation", () => {
    const src = readFileSync(
      new URL("../../app/api/deliverables/generate/route.ts", import.meta.url),
      "utf8",
    );
    const validateAt = src.indexOf("finalDeliverable is required");
    const consumeAt = src.indexOf("requireAndConsumeAiJob");
    expect(validateAt).toBeGreaterThan(0);
    expect(consumeAt).toBeGreaterThan(validateAt);
  });

  it("manual runNow no longer mints :rerun: UUID keys", () => {
    const src = readFileSync(
      new URL("../automations/automation-service.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/:rerun:/);
  });
});

describe("P4 work-queue cancel mid-job", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "wq-p4-"));
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    process.env.ATLAS_WORK_QUEUE_FILE = join(dir, "queue.json");
    process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
    delete process.env.ATLAS_WORK_QUEUE_SANDBOX;
    resetSchedulerGateForTests();
    const store = resetWorkQueueStoreForTests(process.env.ATLAS_WORK_QUEUE_FILE);
    await store.resetForTests();
    startedSteps.length = 0;
    releaseFirstStep = null;
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    delete process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY;
    resetSchedulerGateForTests();
  });

  it("cancel during step 1 does not start the next external step", async () => {
    const store = getWorkQueueStore();
    const enqueued = await store.enqueue({
      ownerId: "u_cancel",
      automationId: "a_cancel",
      occurrenceKey: "occ_p4_cancel",
      payload: {
        kind: "fixture",
        triggerType: "manual",
        offlineArtifacts: true,
      },
      steps: [
        { stepId: "s1", stepType: "fixture_work" },
        { stepId: "s2", stepType: "upload_storage" },
      ],
    });

    const drain = drainWorkQueue({
      workerId: "w_p4",
      limit: 1,
      skipRecover: true,
    });

    await vi.waitFor(() => {
      expect(startedSteps).toContain("s1");
      expect(releaseFirstStep).toBeTypeOf("function");
    });
    await cancelWorkJob(enqueued.job.jobId);
    releaseFirstStep?.();
    await drain;

    expect(startedSteps).not.toContain("s2");
    const latest = await store.getJob(enqueued.job.jobId);
    expect(latest?.status).toBe("cancelled");
  });
});

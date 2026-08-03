import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  cancelWorkJob,
  drainWorkQueue,
  enqueueManualAutomationRun,
  evaluateWorkQueueCompletion,
  resetWorkQueueStoreForTests,
  WORK_JOB_TRANSITIONS,
} from "@/lib/work-queue";
import { getWorkQueueStore } from "@/lib/work-queue/store";
import { defaultAutomationSteps } from "@/lib/work-queue/steps/execute-step";

const tmpRoot = join(
  process.cwd(),
  ".data",
  `wq-hard-${process.pid}-${Date.now()}`,
);

describe("work-queue durability hardening", () => {
  beforeEach(() => {
    mkdirSync(tmpRoot, { recursive: true });
    process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    resetWorkQueueStoreForTests(join(tmpRoot, "queue.json"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("cancel before side effect blocks completed", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u1",
      automationId: "a1",
      occurrenceKey: "occ:a1:cancel",
      payload: {
        kind: "fixture",
        automationName: "cancel-test",
        offlineArtifacts: true,
        triggerType: "automation",
      },
      steps: defaultAutomationSteps(true),
    });
    const ok = await cancelWorkJob(job.jobId);
    expect(ok).toBe(true);
    const drained = await drainWorkQueue({ limit: 5, workerId: "w-cancel" });
    expect(drained.completed).toBe(0);
    const latest = await store.getJob(job.jobId);
    expect(latest?.status).toBe("cancelled");
    const gate = evaluateWorkQueueCompletion(latest!);
    expect(gate.ok).toBe(false);
  });

  it("failed/cancelled cannot transition to completed", () => {
    expect(WORK_JOB_TRANSITIONS.failed.includes("completed")).toBe(false);
    expect(WORK_JOB_TRANSITIONS.cancelled.includes("completed")).toBe(false);
    expect(WORK_JOB_TRANSITIONS.dead_letter.includes("completed")).toBe(false);
  });

  it("side-effect idempotency reuses prior notify evidence", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u1",
      automationId: "a-idem",
      occurrenceKey: "occ:a-idem:1",
      payload: {
        kind: "fixture",
        automationName: "idem",
        offlineArtifacts: true,
        triggerType: "automation",
      },
      steps: defaultAutomationSteps(true),
    });
    const first = await drainWorkQueue({ limit: 1, workerId: "w1" });
    expect(first.completed).toBe(1);
    const done = await store.getJob(job.jobId);
    const notify = done!.steps.find((s) => s.stepId === "notify")!;
    const prior = await store.getSideEffect(notify.idempotencyKey);
    expect(prior).toBeTruthy();
    const notificationId = prior!.result.outputBindings
      ? (prior!.result.outputBindings as Record<string, unknown>).notificationId
      : (prior!.result as Record<string, unknown>).notificationId;

    const { executeWorkStep } = await import(
      "@/lib/work-queue/steps/execute-step"
    );
    const replay = await executeWorkStep({
      job: done!,
      step: { ...notify, status: "pending" },
      previousOutputs: done!.steps[0]!.outputBindings,
    });
    expect(replay.ok).toBe(true);
    expect(replay.externalApplied).toBe(true);
    if (notificationId) {
      expect(replay.outputBindings?.notificationId).toBe(notificationId);
    } else {
      expect(replay.outputBindings?.notifyReceipt).toBeTruthy();
    }
  });

  it("manual run enqueues without sync execution", async () => {
    const { job, created } = await enqueueManualAutomationRun({
      automationId: "manual-1",
      ownerId: "u1",
      automationName: "manual",
      offlineArtifacts: true,
    });
    expect(created).toBe(true);
    expect(job.status).toBe("queued");
    expect(job.payload.triggerType).toBe("manual");
    const store = getWorkQueueStore();
    const stillQueued = await store.getJob(job.jobId);
    expect(stillQueued?.status).toBe("queued");
  });

  it("step resume after generate success + upload fail does not regenerate", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u1",
      automationId: "a-resume",
      occurrenceKey: "occ:a-resume:1",
      maxAttempts: 3,
      payload: {
        kind: "fixture",
        automationName: "resume",
        offlineArtifacts: true,
        triggerType: "automation",
      },
      steps: [
        { stepId: "generate", stepType: "generate_deliverable" },
        {
          stepId: "upload",
          stepType: "upload_storage",
          inputBindings: { forceFail: true },
        },
        { stepId: "notify", stepType: "notify_complete" },
      ],
    });

    const first = await drainWorkQueue({ limit: 1, workerId: "w-r1" });
    expect(first.retried + first.failed).toBeGreaterThan(0);
    const mid = await store.getJob(job.jobId);
    const gen = mid!.steps.find((s) => s.stepId === "generate")!;
    expect(gen.status).toBe("completed");
    const artifactId = gen.artifactIds[0] ?? gen.outputBindings.artifactId;
    expect(artifactId).toBeTruthy();

    // Clear forceFail and make available immediately
    const upload = mid!.steps.find((s) => s.stepId === "upload")!;
    await store.updateStep({
      ...upload,
      status: "pending",
      inputBindings: {},
      errorCode: null,
      errorMessage: null,
    });
    await store.updateJob(job.jobId, {
      status: "queued",
      availableAt: new Date(0).toISOString(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });

    const second = await drainWorkQueue({ limit: 1, workerId: "w-r2" });
    expect(second.completed).toBe(1);
    const final = await store.getJob(job.jobId);
    const gen2 = final!.steps.find((s) => s.stepId === "generate")!;
    expect(gen2.artifactIds[0] ?? gen2.outputBindings.artifactId).toBe(
      artifactId,
    );
  });
});

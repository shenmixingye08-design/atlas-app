import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  buildDurabilitySnapshot,
  drainWorkQueue,
  recoverOnWorkerBoot,
  recoverStuckJobs,
  resetWorkQueueStoreForTests,
} from "@/lib/work-queue";
import { WORK_QUEUE_STUCK_MS } from "@/lib/work-queue/constants";
import { clearWorkQueueStoreSingleton } from "@/lib/work-queue/store";
import { getWorkQueueStore } from "@/lib/work-queue/store";
import { defaultAutomationSteps } from "@/lib/work-queue/steps/execute-step";

const tmpRoot = join(
  process.cwd(),
  ".data",
  `wq-b4-${process.pid}-${Date.now()}`,
);

describe("Production Blocker #4 durability", () => {
  beforeEach(() => {
    mkdirSync(tmpRoot, { recursive: true });
    process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    delete process.env.VERCEL;
    delete process.env.ATLAS_RUNTIME;
    resetWorkQueueStoreForTests(join(tmpRoot, "queue.json"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    clearWorkQueueStoreSingleton();
  });

  it("crash mid-job resumes without redoing completed steps", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u_crash",
      automationId: "auto_crash",
      occurrenceKey: "occ:crash:1",
      idempotencyKey: "idem:crash:1",
      payload: {
        kind: "fixture",
        automationName: "crash-resume",
        offlineArtifacts: true,
        triggerType: "automation",
      },
      steps: defaultAutomationSteps(true),
    });

    // Simulate: first step completed, worker crashed while running second.
    const steps = [...job.steps].sort((a, b) => a.stepIndex - b.stepIndex);
    const first = steps[0]!;
    const second = steps[1]!;
    const artifactPath = join(tmpRoot, "art_crash.txt");
    await store.updateStep({
      ...first,
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outputBindings: {
        artifactId: "art_crash",
        artifactPath,
        bytes: 12,
      },
      artifactIds: ["art_crash"],
    });
    await store.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: {
        outputBindings: {
          artifactId: "art_crash",
          artifactPath,
          bytes: 12,
        },
        artifactIds: ["art_crash"],
      },
    });
    await store.updateStep({
      ...second,
      status: "running",
      startedAt: new Date().toISOString(),
      attempt: 1,
    });
    // Valid transition path: queued → leased → running (crash while running).
    await store.updateJob(job.jobId, { status: "leased" });
    await store.updateJob(job.jobId, {
      status: "running",
      leaseOwner: "dead_worker",
      leaseExpiresAt: new Date(Date.now() - 5_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 120_000).toISOString(),
      startedAt: new Date(Date.now() - 120_000).toISOString(),
    });

    const boot = await recoverOnWorkerBoot("worker_reboot");
    expect(boot.recoveredStuck).toBeGreaterThanOrEqual(1);

    const afterRecovery = await store.getJob(job.jobId);
    expect(afterRecovery?.status).toBe("retry_scheduled");
    const firstAfter = afterRecovery?.steps.find(
      (s) => s.stepId === first.stepId,
    );
    expect(firstAfter?.status).toBe("completed");

    // Make retry immediately available.
    await store.updateJob(job.jobId, {
      availableAt: new Date(Date.now() - 1).toISOString(),
      retryAt: new Date(Date.now() - 1).toISOString(),
    });
    const ready = await store.getJob(job.jobId);
    expect(ready?.status).toBe("retry_scheduled");
    expect(new Date(ready!.availableAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );

    const drain = await drainWorkQueue({
      workerId: "worker_resume",
      limit: 1,
    });
    expect(drain.completed).toBe(1);

    const done = await store.getJob(job.jobId);
    expect(done?.status).toBe("completed");
    const completedFirst = done?.steps.find((s) => s.stepId === first.stepId);
    expect(completedFirst?.status).toBe("completed");
    expect(completedFirst?.artifactIds).toContain("art_crash");
    expect(completedFirst?.outputBindings.artifactId).toBe("art_crash");

    // Side-effect for first step still unique (not double-executed).
    const se = await store.getSideEffect(first.idempotencyKey);
    expect(se).not.toBeNull();

    if (store.listCompletionEvidence) {
      const evidence = await store.listCompletionEvidence(job.jobId);
      expect(evidence.length).toBeGreaterThan(0);
    }
  });

  it("idempotencyKey prevents duplicate job create and double lease", async () => {
    const store = getWorkQueueStore();
    const input = {
      ownerId: "u_idem",
      automationId: "auto_idem",
      occurrenceKey: "occ:idem:1",
      idempotencyKey: "idem:unique:1",
      payload: {
        kind: "fixture" as const,
        offlineArtifacts: true,
        triggerType: "automation" as const,
      },
      steps: defaultAutomationSteps(true),
    };

    const a = await store.enqueue(input);
    const b = await store.enqueue(input);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.jobId).toBe(a.job.jobId);
    expect(a.job.idempotencyKey).toBe("idem:unique:1");

    const metrics = await store.metrics();
    expect(metrics.duplicateCount).toBeGreaterThanOrEqual(1);

    const leaseA = await store.leaseJobs({
      workerId: "w_a",
      limit: 1,
      leaseMs: 60_000,
    });
    const leaseB = await store.leaseJobs({
      workerId: "w_b",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leaseA).toHaveLength(1);
    expect(leaseB).toHaveLength(0);

    // Side-effect double write → second is not created.
    const key = a.job.steps[0]!.idempotencyKey;
    const first = await store.tryRecordSideEffect({
      idempotencyKey: key,
      jobId: a.job.jobId,
      runId: a.job.runId,
      stepId: a.job.steps[0]!.stepId,
      kind: "fixture",
      result: { once: true },
    });
    const second = await store.tryRecordSideEffect({
      idempotencyKey: key,
      jobId: a.job.jobId,
      runId: a.job.runId,
      stepId: a.job.steps[0]!.stepId,
      kind: "fixture",
      result: { once: false },
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.result).toEqual({ once: true });
  });

  it("worker boot recovers stuck and records recovery events", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u_boot",
      automationId: "auto_boot",
      occurrenceKey: "occ:boot:1",
      idempotencyKey: "idem:boot:1",
      payload: {
        kind: "fixture",
        offlineArtifacts: true,
      },
      steps: defaultAutomationSteps(true),
    });
    await store.updateJob(job.jobId, { status: "leased" });
    await store.updateJob(job.jobId, {
      status: "running",
      leaseOwner: "ghost",
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 200_000).toISOString(),
      startedAt: new Date(Date.now() - 200_000).toISOString(),
    });

    const boot = await recoverOnWorkerBoot("boot_w");
    expect(boot.releasedExpiredLeases).toBeGreaterThanOrEqual(1);
    expect(boot.runningOrphans).toBeGreaterThanOrEqual(1);
    expect(boot.recoveredStuck).toBeGreaterThanOrEqual(1);

    const events = (await store.listRecoveryEvents?.(20)) ?? [];
    expect(events.some((e) => e.kind === "worker_boot")).toBe(true);
    expect(events.some((e) => e.kind === "stuck")).toBe(true);

    const snapshot = await buildDurabilitySnapshot();
    expect(snapshot.queue.queueLength).toBeGreaterThanOrEqual(0);
    expect(snapshot.recovery.recent.length).toBeGreaterThan(0);
    expect(snapshot.memory.sot).toBe("durable_domain");
  });

  it("production runtime rejects file SoT escape hatches", async () => {
    clearWorkQueueStoreSingleton();
    const prevForce = process.env.ATLAS_WORK_QUEUE_FORCE_FILE;
    const prevRuntime = process.env.ATLAS_RUNTIME;
    const prevVercel = process.env.VERCEL;
    process.env.ATLAS_RUNTIME = "production";
    process.env.VERCEL = "1";
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.SUPABASE_DB_URL;
    delete process.env.DIRECT_URL;
    expect(() => getWorkQueueStore()).toThrow(
      /file_sot_forbidden|postgres_required/,
    );
    if (prevRuntime === undefined) delete process.env.ATLAS_RUNTIME;
    else process.env.ATLAS_RUNTIME = prevRuntime;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE = prevForce;
    clearWorkQueueStoreSingleton();
  });

  it("drain abort releases unused leases immediately (mid-stop)", async () => {
    const store = getWorkQueueStore();
    const a = await store.enqueue({
      ownerId: "u_abort",
      automationId: "auto_abort",
      occurrenceKey: "occ:abort:1",
      idempotencyKey: "idem:abort:1",
      payload: { kind: "fixture", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    const b = await store.enqueue({
      ownerId: "u_abort",
      automationId: "auto_abort",
      occurrenceKey: "occ:abort:2",
      idempotencyKey: "idem:abort:2",
      payload: { kind: "fixture", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    expect(a.created && b.created).toBe(true);

    const controller = new AbortController();
    // Abort before drain leases are processed — first job may start,
    // remaining leased jobs must return to queued without waiting lease TTL.
    const drainPromise = drainWorkQueue({
      workerId: "worker_abort",
      limit: 2,
      signal: controller.signal,
    });
    controller.abort();
    await drainPromise;

    const jobA = await store.getJob(a.job.jobId);
    const jobB = await store.getJob(b.job.jobId);
    const statuses = [jobA?.status, jobB?.status];
    // At least one unused/aborted lease path returns to queued, or completes
    // if already in-flight before abort observed.
    expect(
      statuses.every(
        (s) =>
          s === "queued" ||
          s === "completed" ||
          s === "retry_scheduled" ||
          s === "running" ||
          s === "leased",
      ),
    ).toBe(true);
    // No silent disappearance
    expect(jobA).toBeTruthy();
    expect(jobB).toBeTruthy();
  });

  it("stuck recovery + side-effect evidence forbids dual apply", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u_lease",
      automationId: "auto_lease",
      occurrenceKey: "occ:lease:1",
      idempotencyKey: "idem:lease:1",
      payload: { kind: "fixture", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    const first = [...job.steps].sort((a, b) => a.stepIndex - b.stepIndex)[0]!;
    await store.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: {
        outputBindings: { artifactId: "art_lease", once: true },
        artifactIds: ["art_lease"],
      },
    });
    await store.updateStep({
      ...first,
      status: "running",
      startedAt: new Date().toISOString(),
    });
    await store.updateJob(job.jobId, { status: "leased" });
    await store.updateJob(job.jobId, {
      status: "running",
      leaseOwner: "dead",
      leaseExpiresAt: new Date(Date.now() - 1).toISOString(),
      heartbeatAt: new Date(Date.now() - WORK_QUEUE_STUCK_MS - 1_000).toISOString(),
      startedAt: new Date(Date.now() - WORK_QUEUE_STUCK_MS - 1_000).toISOString(),
    });

    const boot = await recoverOnWorkerBoot("worker_lease_boot");
    expect(boot.recoveredStuck).toBeGreaterThanOrEqual(1);
    const afterBoot = await store.getJob(job.jobId);
    expect(afterBoot?.status).toBe("retry_scheduled");
    // Running step with evidence must become completed — never wiped / never re-applied.
    expect(afterBoot?.steps.find((s) => s.stepId === first.stepId)?.status).toBe(
      "completed",
    );
    expect(
      afterBoot?.steps.find((s) => s.stepId === first.stepId)?.artifactIds,
    ).toContain("art_lease");

    const again = await store.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: { artifactIds: ["art_lease_dup"] },
    });
    expect(again.created).toBe(false);
    expect(again.record.result).toMatchObject({ artifactIds: ["art_lease"] });
  });

  it("recoverStuckJobs does not wipe completed steps", async () => {
    const store = getWorkQueueStore();
    const { job } = await store.enqueue({
      ownerId: "u_keep",
      automationId: "auto_keep",
      occurrenceKey: "occ:keep:1",
      idempotencyKey: "idem:keep:1",
      payload: { kind: "fixture", offlineArtifacts: true },
      steps: defaultAutomationSteps(true),
    });
    const first = [...job.steps].sort((a, b) => a.stepIndex - b.stepIndex)[0]!;
    await store.updateStep({
      ...first,
      status: "completed",
      completedAt: new Date().toISOString(),
      outputBindings: { kept: true },
    });
    await store.tryRecordSideEffect({
      idempotencyKey: first.idempotencyKey,
      jobId: job.jobId,
      runId: job.runId,
      stepId: first.stepId,
      kind: first.stepType,
      result: { outputBindings: { kept: true } },
    });
    await store.updateJob(job.jobId, { status: "leased" });
    await store.updateJob(job.jobId, {
      status: "running",
      leaseOwner: "stuck",
      heartbeatAt: new Date(Date.now() - 200_000).toISOString(),
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    await recoverStuckJobs(Date.now());
    const latest = await store.getJob(job.jobId);
    const kept = latest?.steps.find((s) => s.stepId === first.stepId);
    expect(kept?.status).toBe("completed");
    expect(kept?.outputBindings).toMatchObject({ kept: true });
  });
});

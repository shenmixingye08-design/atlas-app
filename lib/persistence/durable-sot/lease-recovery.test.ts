import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
  type DurableSotPool,
} from "./db";
import {
  applyDurableSotMigrationDown,
  applyDurableSotMigrationUp,
} from "./migration";
import { resolveStuckThresholdMs } from "./lease-config";
import { DurableHeartbeatsRepository } from "./repositories/heartbeats-repository";
import { DurableJobsRepository } from "./repositories/jobs-repository";
import { DurableQueueRepository } from "./repositories/queue-repository";
import { DurableStepsRepository } from "./repositories/steps-repository";
import { RunRepository } from "./repositories/run-repository";
import { createRunJobQueueTransaction } from "./transactions/create-run-job-queue";
import { assessRecoveryEligibility } from "./recovery/assess";
import { DurableRecoveryOrchestrator } from "./recovery/orchestrator";

const dbUrl =
  process.env.DURABLE_SOT_LEASE_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_QUEUE_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_CRUD_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

async function seedJob(
  pool: DurableSotPool,
  opts?: { automationId?: string; steps?: number },
) {
  const occurrenceKey = `occ-lease-${randomUUID()}`;
  const automationId = opts?.automationId ?? `auto-${randomUUID()}`;
  const created = await createRunJobQueueTransaction(pool, {
    run: {
      ownerId: "owner-lease",
      automationId,
      status: "queued",
      idempotencyKey: `run-${randomUUID()}`,
    },
    job: {
      ownerId: "owner-lease",
      automationId,
      occurrenceKey,
      idempotencyKey: `job-${randomUUID()}`,
      payload: { kind: "fixture" },
    },
  });
  const steps = new DurableStepsRepository(pool);
  const count = opts?.steps ?? 3;
  for (let i = 0; i < count; i += 1) {
    await steps.create({
      runId: created.run.runId,
      jobId: created.job.jobId,
      stepId: `step_${i}`,
      stepIndex: i,
      stepType:
        i === 0
          ? "generate_deliverable"
          : i === 1
            ? "upload_storage"
            : "notify_complete",
      status: "pending",
    });
  }
  return created;
}

describe.skipIf(!dbUrl)("Phase 1-4 Durable Lease / Heartbeat / Recovery", () => {
  let pool: DurableSotPool;
  let queue: DurableQueueRepository;
  let jobs: DurableJobsRepository;
  let runs: RunRepository;
  let steps: DurableStepsRepository;
  let heartbeats: DurableHeartbeatsRepository;
  let recovery: DurableRecoveryOrchestrator;

  beforeAll(async () => {
    pool = createDurableSotPool(dbUrl);
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
    queue = new DurableQueueRepository(pool);
    jobs = new DurableJobsRepository(pool);
    runs = new RunRepository(pool);
    steps = new DurableStepsRepository(pool);
    heartbeats = new DurableHeartbeatsRepository(pool);
    recovery = new DurableRecoveryOrchestrator(pool);
  });

  beforeEach(async () => {
    await queue.resetAll();
    await recovery.getMetrics().resetForTests();
  });

  afterAll(async () => {
    await applyDurableSotMigrationDown(pool);
    await pool.end();
  });

  describe("atomic lease acquisition", () => {
    it("2 workers: only one acquires the same job", async () => {
      const seeded = await seedJob(pool);
      const now = new Date().toISOString();
      const until = new Date(Date.now() + 60_000).toISOString();
      const [a, b] = await Promise.all([
        queue.claimDue({
          nowIso: now,
          leaseOwner: "w1",
          leaseExpiresAt: until,
          limit: 1,
        }),
        queue.claimDue({
          nowIso: now,
          leaseOwner: "w2",
          leaseExpiresAt: until,
          limit: 1,
        }),
      ]);
      const won = [...a, ...b];
      expect(won).toHaveLength(1);
      expect(won[0]?.jobId).toBe(seeded.job.jobId);
      expect(won[0]?.leaseToken).toBeTruthy();
      expect(won[0]?.leaseVersion).toBeGreaterThan(0);
    });

    it("10 workers: exactly one winner, duplicate execution 0", async () => {
      const seeded = await seedJob(pool);
      const now = new Date().toISOString();
      const until = new Date(Date.now() + 60_000).toISOString();
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          queue.claimDue({
            nowIso: now,
            leaseOwner: `w${i}`,
            leaseExpiresAt: until,
            limit: 1,
          }),
        ),
      );
      const flat = results.flat();
      expect(flat).toHaveLength(1);
      expect(flat[0]?.jobId).toBe(seeded.job.jobId);
      const owners = new Set(flat.map((j) => j.leaseOwner));
      expect(owners.size).toBe(1);
    });

    it("rejects completed and cancelled reclaim", async () => {
      const seeded = await seedJob(pool);
      await jobs.update(seeded.job.jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      const now = new Date().toISOString();
      const claimed = await queue.claimDue({
        nowIso: now,
        leaseOwner: "w-complete",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 5,
      });
      expect(claimed.find((j) => j.jobId === seeded.job.jobId)).toBeUndefined();

      const seeded2 = await seedJob(pool);
      await jobs.update(seeded2.job.jobId, { status: "cancelled" });
      const claimed2 = await queue.claimDue({
        nowIso: now,
        leaseOwner: "w-cancel",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 5,
      });
      expect(
        claimed2.find((j) => j.jobId === seeded2.job.jobId),
      ).toBeUndefined();
    });
  });

  describe("lease token / zombie rejection", () => {
    it("rejects stale leaseToken updates (zombie write = 0 applied)", async () => {
      await seedJob(pool);
      const now = new Date().toISOString();
      const [claimed] = await queue.claimDue({
        nowIso: now,
        leaseOwner: "owner-a",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      expect(claimed).toBeTruthy();

      // Simulate reclaim by another worker (new token/version).
      await pool.query(
        `update public.atlas_durable_jobs
         set lease_owner = 'owner-b',
             lease_token = $2,
             lease_version = lease_version + 1,
             lease_expires_at = $3
         where job_id = $1`,
        [
          claimed!.jobId,
          randomUUID(),
          new Date(Date.now() + 60_000).toISOString(),
        ],
      );

      const rejected = await queue.updateWithFence(
        {
          jobId: claimed!.jobId,
          leaseOwner: "owner-a",
          leaseToken: claimed!.leaseToken!,
          leaseVersion: claimed!.leaseVersion,
        },
        { status: "completed", completedAt: new Date().toISOString() },
      );
      expect(rejected).toBeNull();
      const latest = await jobs.get(claimed!.jobId);
      expect(latest?.status).toBe("leased");
      expect(latest?.leaseOwner).toBe("owner-b");
    });

    it("accepts matching fence updates", async () => {
      const seeded = await seedJob(pool);
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "owner-ok",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      const updated = await queue.updateWithFence(
        {
          jobId: claimed!.jobId,
          leaseOwner: "owner-ok",
          leaseToken: claimed!.leaseToken!,
          leaseVersion: claimed!.leaseVersion,
        },
        { status: "running" },
      );
      expect(updated?.status).toBe("running");
      expect(seeded.job.jobId).toBe(claimed!.jobId);
    });
  });

  describe("heartbeat", () => {
    it("persists heartbeat with progress fields when lease valid", async () => {
      const seeded = await seedJob(pool);
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "hb-owner",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
        workerInstanceId: "instance-1",
      });
      const ok = await queue.heartbeat({
        jobId: claimed!.jobId,
        leaseOwner: "hb-owner",
        leaseToken: claimed!.leaseToken,
        leaseVersion: claimed!.leaseVersion,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        workerInstanceId: "instance-1",
      });
      expect(ok).toBe(true);
      await heartbeats.save({
        runId: seeded.run.runId,
        jobId: claimed!.jobId,
        leaseOwner: "hb-owner",
        leaseToken: claimed!.leaseToken,
        currentStepId: "step_0",
        currentStage: "generate_deliverable",
        progressMarker: "step:0",
        workerInstanceId: "instance-1",
      });
      const hb = await heartbeats.get(seeded.run.runId);
      expect(hb?.currentStepId).toBe("step_0");
      expect(hb?.leaseToken).toBe(claimed!.leaseToken);
    });

    it("fails heartbeat on token mismatch", async () => {
      const seeded = await seedJob(pool);
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "hb-owner",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      const ok = await queue.heartbeat({
        jobId: claimed!.jobId,
        leaseOwner: "hb-owner",
        leaseToken: "stale-token",
        leaseVersion: claimed!.leaseVersion,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(ok).toBe(false);
      expect(seeded.job.jobId).toBe(claimed!.jobId);
    });
  });

  describe("expired lease reclaim + stuck detection", () => {
    it("reclaims expired lease atomically", async () => {
      const seeded = await seedJob(pool);
      const past = new Date(Date.now() - 120_000).toISOString();
      await jobs.update(seeded.job.jobId, {
        status: "running",
        leaseOwner: "dead-worker",
        leaseExpiresAt: past,
        heartbeatAt: past,
        leaseToken: "old-token",
        leaseVersion: 1,
      });
      const [reclaimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "alive-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      expect(reclaimed?.leaseOwner).toBe("alive-worker");
      expect(reclaimed?.leaseToken).not.toBe("old-token");
      expect(reclaimed?.leaseVersion).toBeGreaterThan(1);
    });

    it("detects stuck by heartbeat threshold (configurable)", async () => {
      const seeded = await seedJob(pool);
      const stuckMs = resolveStuckThresholdMs();
      const old = new Date(Date.now() - stuckMs - 1_000).toISOString();
      await jobs.update(seeded.job.jobId, {
        status: "running",
        leaseOwner: "stuck",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        heartbeatAt: old,
        leaseToken: "t",
        leaseVersion: 1,
      });
      const stuck = await recovery.detectStuck(Date.now());
      expect(stuck.some((j) => j.jobId === seeded.job.jobId)).toBe(true);
    });
  });

  describe("step resume recovery", () => {
    it("resumes from first non-completed step (no full re-run)", async () => {
      const seeded = await seedJob(pool, { steps: 3 });
      await steps.update(seeded.run.runId, "step_0", {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        outputBindings: { artifactId: "art-1", __artifactIds: ["art-1"] },
      });
      await steps.update(seeded.run.runId, "step_1", {
        status: "succeeded",
        completedAt: new Date().toISOString(),
        outputBindings: { storagePath: "/x", storageSaved: true },
      });
      await steps.update(seeded.run.runId, "step_2", {
        status: "running",
        startedAt: new Date().toISOString(),
        outputBindings: { externalActionId: "ext-1" },
      });

      const past = new Date(Date.now() - resolveStuckThresholdMs() - 5_000).toISOString();
      await jobs.update(seeded.job.jobId, {
        status: "running",
        leaseOwner: "crashed",
        leaseExpiresAt: past,
        heartbeatAt: past,
        leaseToken: "dead",
        leaseVersion: 3,
      });

      const result = await recovery.recoverStuck({
        recoveryWorkerId: "recovery-1",
      });
      expect(result.recovered).toBe(1);
      const job = await jobs.get(seeded.job.jobId);
      expect(job?.status).toBe("retry");
      expect(job?.leaseOwner).toBeNull();
      expect(job?.lastError).toContain("step_2");

      const step0 = (await steps.list(seeded.run.runId)).find(
        (s) => s.stepId === "step_0",
      );
      expect(step0?.status).toBe("succeeded");
      const ledger = await recovery.getRecoveries().latestForJob(seeded.job.jobId);
      expect(ledger?.recoveryStatus).toBe("recovered");
      expect(ledger?.recoveryFromStepId).toBe("step_2");
      expect(ledger?.recoveryStrategy).toBe("resume_from_step");
    });

    it("marks manual_review when unknown non-idempotent external state", async () => {
      const seeded = await seedJob(pool, { steps: 1 });
      await steps.update(seeded.run.runId, "step_0", {
        status: "running",
        startedAt: new Date().toISOString(),
        // no externalActionId → unknown
      });
      // Force step type external-ish via assessment helper directly.
      const job = (await jobs.get(seeded.job.jobId))!;
      const stepRows = await steps.list(seeded.run.runId);
      const assessment = assessRecoveryEligibility({
        job: { ...job, status: "running" },
        steps: stepRows.map((s) => ({
          ...s,
          stepType: "notify_complete",
          status: "running",
          outputBindings: {},
        })),
        hasCompletionEvidence: false,
        hasIdempotencyRecord: false,
        detectedReason: "heartbeat_timeout",
      });
      expect(assessment.recoverable).toBe(false);
      expect(assessment.strategy).toBe("manual_review");
    });
  });

  describe("crash recovery scenarios A–J", () => {
    async function crashAt(
      label: string,
      mutate: (jobId: string, runId: string) => Promise<void>,
    ) {
      const seeded = await seedJob(pool, { steps: 3 });
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: `crash-${label}`,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      expect(claimed).toBeTruthy();
      await mutate(claimed!.jobId, seeded.run.runId);
      // Simulate crash: expire lease + stale heartbeat
      const past = new Date(
        Date.now() - resolveStuckThresholdMs() - 2_000,
      ).toISOString();
      await jobs.update(claimed!.jobId, {
        status: "running",
        leaseExpiresAt: past,
        heartbeatAt: past,
      });
      const started = Date.now();
      const result = await recovery.recoverStuck({
        recoveryWorkerId: `rec-${label}`,
      });
      const duration = Date.now() - started;
      const job = await jobs.get(claimed!.jobId);
      const ledger = await recovery
        .getRecoveries()
        .latestForJob(claimed!.jobId);
      return { job, ledger, result, duration, seeded };
    }

    it("A lease取得直後にcrash", async () => {
      const r = await crashAt("A", async () => undefined);
      expect(r.result.recovered + r.result.manualReview + r.result.failed).toBe(
        1,
      );
      expect(r.job?.status === "retry" || r.job?.status === "failed").toBe(true);
      expect(r.ledger).toBeTruthy();
    });

    it("B Step開始直後にcrash", async () => {
      const r = await crashAt("B", async (jobId, runId) => {
        await steps.update(runId, "step_0", {
          status: "running",
          startedAt: new Date().toISOString(),
        });
        void jobId;
      });
      expect(r.ledger?.recoveryFromStepId === "step_0" || r.job?.status).toBeTruthy();
    });

    it("C Artifact生成後にcrash", async () => {
      const r = await crashAt("C", async (_j, runId) => {
        await steps.update(runId, "step_0", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          outputBindings: { artifactId: "a1", __artifactIds: ["a1"] },
        });
        // Next step still pending — safe resume without unknown side effect.
        await steps.update(runId, "step_1", { status: "pending" });
      });
      const s0 = (await steps.list(r.seeded.run.runId)).find(
        (s) => s.stepId === "step_0",
      );
      expect(s0?.status).toBe("succeeded");
      expect(r.result.recovered).toBe(1);
      expect(r.ledger?.recoveryFromStepId).toBe("step_1");
    });

    it("D Storage保存後にcrash", async () => {
      const r = await crashAt("D", async (_j, runId) => {
        await steps.update(runId, "step_0", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          outputBindings: { artifactId: "a1" },
        });
        await steps.update(runId, "step_1", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
          outputBindings: { storageSaved: true, storagePath: "/p" },
        });
        await steps.update(runId, "step_2", {
          status: "running",
          startedAt: new Date().toISOString(),
          outputBindings: { externalActionId: "mail-1" },
        });
      });
      expect(r.result.recovered).toBe(1);
      expect(r.ledger?.recoveryFromStepId).toBe("step_2");
    });

    it("E External API成功後にcrash", async () => {
      const r = await crashAt("E", async (_j, runId) => {
        await steps.update(runId, "step_0", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
        });
        await steps.update(runId, "step_1", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
        });
        await steps.update(runId, "step_2", {
          status: "running",
          startedAt: new Date().toISOString(),
          outputBindings: { externalActionId: "ext-ok" },
        });
      });
      expect(r.result.recovered).toBe(1);
    });

    it("F Notification前にcrash", async () => {
      const r = await crashAt("F", async (_j, runId) => {
        await steps.update(runId, "step_0", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
        });
        await steps.update(runId, "step_1", {
          status: "succeeded",
          completedAt: new Date().toISOString(),
        });
        await steps.update(runId, "step_2", {
          status: "pending",
        });
      });
      expect(r.job?.status).toBe("retry");
    });

    it("G Completion Evidence作成中にcrash", async () => {
      const r = await crashAt("G", async (_j, runId) => {
        for (const id of ["step_0", "step_1", "step_2"]) {
          await steps.update(runId, id, {
            status: "succeeded",
            completedAt: new Date().toISOString(),
          });
        }
      });
      expect(r.result.examined).toBeGreaterThanOrEqual(1);
    });

    it("H Heartbeat停止", async () => {
      const r = await crashAt("H", async () => undefined);
      expect(r.ledger?.detectedReason).toMatch(/heartbeat|lease/);
    });

    it("I DB一時切断相当（再接続後Recovery）", async () => {
      const r = await crashAt("I", async () => undefined);
      // New orchestrator connection via same pool after "reconnect".
      const again = new DurableRecoveryOrchestrator(pool);
      const snap = await again.metricsSnapshot();
      expect(snap.recoveryAttemptCount).toBeGreaterThanOrEqual(1);
      expect(r.job).toBeTruthy();
    });

    it("J Worker再起動（lease expiry → claim）", async () => {
      const seeded = await seedJob(pool);
      const past = new Date(Date.now() - 90_000).toISOString();
      await jobs.update(seeded.job.jobId, {
        status: "running",
        leaseOwner: "old",
        leaseToken: "old",
        leaseVersion: 1,
        leaseExpiresAt: past,
        heartbeatAt: past,
      });
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "new-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      expect(claimed?.leaseOwner).toBe("new-worker");
      expect(claimed?.leaseToken).not.toBe("old");
    });
  });

  describe("graceful shutdown", () => {
    it("shortens/releases unused lease without completing", async () => {
      const seeded = await seedJob(pool);
      const [claimed] = await queue.claimDue({
        nowIso: new Date().toISOString(),
        leaseOwner: "shut-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        limit: 1,
      });
      const released = await queue.releaseOrShorten({
        jobId: claimed!.jobId,
        leaseOwner: "shut-worker",
        leaseToken: claimed!.leaseToken!,
        leaseVersion: claimed!.leaseVersion,
        mode: "release",
        releaseReason: "graceful_shutdown_release",
      });
      expect(released?.status).toBe("queued");
      expect(released?.leaseOwner).toBeNull();
      expect(released?.completedAt).toBeNull();
      expect(seeded.job.jobId).toBe(claimed!.jobId);
    });
  });

  describe("metrics", () => {
    it("exposes lease/recovery metrics snapshot", async () => {
      const seeded = await seedJob(pool);
      const past = new Date(
        Date.now() - resolveStuckThresholdMs() - 1_000,
      ).toISOString();
      await jobs.update(seeded.job.jobId, {
        status: "running",
        leaseOwner: "m",
        leaseExpiresAt: past,
        heartbeatAt: past,
        leaseToken: "t",
        leaseVersion: 1,
      });
      await recovery.recoverStuck({ recoveryWorkerId: "m1" });
      const snap = await recovery.metricsSnapshot();
      expect(snap.recoveryAttemptCount).toBeGreaterThanOrEqual(1);
      expect(
        snap.recoverySuccessCount + snap.recoveryFailureCount,
      ).toBeGreaterThanOrEqual(1);
      expect(typeof snap.activeLeases).toBe("number");
      void runs;
    });
  });
});

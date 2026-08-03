/**
 * Restart / multi-instance proofs against real Postgres (not mock-only).
 * Simulates process restart by new store/orchestrator instances sharing DB.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
  type DurableSotPool,
} from "../db";
import {
  applyDurableSotMigrationDown,
  applyDurableSotMigrationUp,
} from "../migration";
import { DurableSotWorkQueueStore } from "../adapters/work-queue-store";
import { DurableRecoveryOrchestrator } from "../recovery/orchestrator";
import { DurableQueueRepository } from "../repositories/queue-repository";
import { DurableStepsRepository } from "../repositories/steps-repository";
import { resolveStuckThresholdMs } from "../lease-config";
import {
  migrateLegacyWorkQueueToDurable,
  rollbackLegacyMigrationBatch,
} from "./legacy-migration";
import { logDurableSot } from "./observability";

const dbUrl =
  process.env.DURABLE_SOT_CUTOVER_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_LEASE_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_QUEUE_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

describe.skipIf(!dbUrl)("Phase 1-5 restart + multi-instance proofs", () => {
  let pool: DurableSotPool;

  beforeAll(async () => {
    pool = createDurableSotPool(dbUrl);
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
  });

  beforeEach(async () => {
    await pool.query(
      `truncate table
         public.atlas_durable_job_recoveries,
         public.atlas_durable_lease_metrics,
         public.atlas_durable_jobs,
         public.atlas_durable_steps,
         public.atlas_durable_heartbeats,
         public.atlas_durable_leases,
         public.atlas_durable_runs,
         public.atlas_durable_scheduler_occurrences
       cascade`,
    );
  });

  afterAll(async () => {
    await applyDurableSotMigrationDown(pool);
    await pool.end();
  });

  async function enqueueFixture(store: DurableSotWorkQueueStore, key: string) {
    return store.enqueue({
      ownerId: "owner-cutover",
      automationId: `auto-${key}`,
      occurrenceKey: `occ-${key}-${randomUUID()}`,
      payload: { kind: "fixture" },
      steps: [
        { stepId: "step_0", stepType: "generate_deliverable" },
        { stepId: "step_1", stepType: "upload_storage" },
        { stepId: "step_2", stepType: "notify_complete" },
      ],
    });
  }

  it("A: queued → process restart → claim → complete", async () => {
    const store1 = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store1, "A");
    await store1.close();

    const store2 = new DurableSotWorkQueueStore(dbUrl);
    const loaded = await store2.getJob(job.jobId);
    expect(loaded?.status).toBe("queued");
    const [leased] = await store2.leaseJobs({
      workerId: "new-worker-A",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leased?.jobId).toBe(job.jobId);
    expect(leased?.leaseToken).toBeTruthy();
    await store2.updateJob(
      leased!.jobId,
      {
        status: "completed",
        completedAt: new Date().toISOString(),
        leaseOwner: null,
        leaseToken: null,
      },
      "new-worker-A",
      { leaseToken: leased!.leaseToken, leaseVersion: leased!.leaseVersion },
    );
    const final = await store2.getJob(job.jobId);
    expect(final?.status).toBe("completed");
    logDurableSot({
      event: "RECOVERY_AFTER_RESTART",
      jobId: job.jobId,
      runId: job.runId,
      status: "completed",
      detail: "case_A",
    });
    await store2.close();
  });

  it("B: running → crash → lease expiry → recovery → requeue", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "B");
    const [leased] = await store.leaseJobs({
      workerId: "old-worker-B",
      limit: 1,
      leaseMs: 60_000,
    });
    await store.updateJob(
      leased!.jobId,
      { status: "running" },
      "old-worker-B",
      { leaseToken: leased!.leaseToken, leaseVersion: leased!.leaseVersion },
    );
    const past = new Date(
      Date.now() - resolveStuckThresholdMs() - 2000,
    ).toISOString();
    await store.getJobsRepository().update(job.jobId, {
      leaseExpiresAt: past,
      heartbeatAt: past,
      status: "running",
    });
    await store.close();

    const recovery = new DurableRecoveryOrchestrator(createDurableSotPool(dbUrl));
    const result = await recovery.recoverStuck({
      recoveryWorkerId: "recovery-B",
    });
    expect(result.recovered).toBe(1);
    const store2 = new DurableSotWorkQueueStore(dbUrl);
    const after = await store2.getJob(job.jobId);
    expect(["retry", "retry_scheduled"]).toContain(String(after?.status));
    expect(after?.leaseOwner).toBeNull();
    await store2.close();
  });

  it("C: retry_scheduled survives restart and is claimable", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "C");
    await store.getJobsRepository().update(job.jobId, {
      status: "retry",
      availableAt: new Date(Date.now() - 1000).toISOString(),
      leaseOwner: null,
      leaseToken: null,
    });
    await store.close();

    const store2 = new DurableSotWorkQueueStore(dbUrl);
    const [leased] = await store2.leaseJobs({
      workerId: "worker-C",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leased?.jobId).toBe(job.jobId);
    await store2.close();
  });

  it("D: artifact step completed → restart → resume next step only", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "D");
    const stepsRepo = new DurableStepsRepository(createDurableSotPool(dbUrl));
    await stepsRepo.update(job.runId, "step_0", {
      status: "succeeded",
      completedAt: new Date().toISOString(),
      outputBindings: { artifactId: "art-D", __artifactIds: ["art-D"] },
    });
    const past = new Date(
      Date.now() - resolveStuckThresholdMs() - 1000,
    ).toISOString();
    await store.getJobsRepository().update(job.jobId, {
      status: "running",
      leaseOwner: "dead",
      leaseExpiresAt: past,
      heartbeatAt: past,
      leaseToken: "old",
      leaseVersion: 1,
    });
    await store.close();

    const recovery = new DurableRecoveryOrchestrator(createDurableSotPool(dbUrl));
    const result = await recovery.recoverStuck({ recoveryWorkerId: "rec-D" });
    expect(result.recovered).toBe(1);
    const ledger = await recovery.getRecoveries().latestForJob(job.jobId);
    expect(ledger?.recoveryFromStepId).toBe("step_1");
    const s0 = (await stepsRepo.list(job.runId)).find((s) => s.stepId === "step_0");
    expect(s0?.status).toBe("succeeded");
  });

  it("E: external action id present → no duplicate external on recovery", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "E");
    const stepsRepo = new DurableStepsRepository(createDurableSotPool(dbUrl));
    await stepsRepo.update(job.runId, "step_0", {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    await stepsRepo.update(job.runId, "step_1", {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    await stepsRepo.update(job.runId, "step_2", {
      status: "running",
      startedAt: new Date().toISOString(),
      outputBindings: { externalActionId: "ext-E-1" },
    });
    const past = new Date(
      Date.now() - resolveStuckThresholdMs() - 1000,
    ).toISOString();
    await store.getJobsRepository().update(job.jobId, {
      status: "running",
      leaseOwner: "dead",
      leaseExpiresAt: past,
      heartbeatAt: past,
      leaseToken: "t",
      leaseVersion: 2,
    });
    await store.close();
    const recovery = new DurableRecoveryOrchestrator(createDurableSotPool(dbUrl));
    const result = await recovery.recoverStuck({ recoveryWorkerId: "rec-E" });
    expect(result.recovered).toBe(1);
    const s2 = (await stepsRepo.list(job.runId)).find((s) => s.stepId === "step_2");
    expect(s2?.outputBindings.externalActionId).toBe("ext-E-1");
  });

  it("F: notification pending after prior steps → resume notify only", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "F");
    const stepsRepo = new DurableStepsRepository(createDurableSotPool(dbUrl));
    await stepsRepo.update(job.runId, "step_0", {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    await stepsRepo.update(job.runId, "step_1", {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    const past = new Date(
      Date.now() - resolveStuckThresholdMs() - 1000,
    ).toISOString();
    await store.getJobsRepository().update(job.jobId, {
      status: "running",
      leaseOwner: "dead",
      leaseExpiresAt: past,
      heartbeatAt: past,
      leaseToken: "t",
      leaseVersion: 1,
    });
    await store.close();
    const recovery = new DurableRecoveryOrchestrator(createDurableSotPool(dbUrl));
    const result = await recovery.recoverStuck({ recoveryWorkerId: "rec-F" });
    expect(result.recovered).toBe(1);
    const ledger = await recovery.getRecoveries().latestForJob(job.jobId);
    expect(ledger?.recoveryFromStepId).toBe("step_2");
  });

  it("2 / 5 / 10 workers: single lease winner, duplicate 0", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "multi");
    await store.close();
    const queue = new DurableQueueRepository(pool);

    for (const n of [2, 5, 10]) {
      // available_at in the past avoids Node/Postgres clock skew failing claimDue.
      const past = new Date(Date.now() - 60_000).toISOString();
      const reset = await pool.query(
        `update public.atlas_durable_jobs
         set status='queued', lease_owner=null, lease_token=null,
             lease_expires_at=null, lease_version=0, available_at=$2::timestamptz
         where job_id=$1
         returning job_id`,
        [job.jobId, past],
      );
      expect(reset.rowCount, `${n} workers reset`).toBe(1);
      const now = new Date(Date.now() + 5_000).toISOString();
      const until = new Date(Date.now() + 60_000).toISOString();
      const results = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          queue.claimDue({
            nowIso: now,
            leaseOwner: `w${n}-${i}`,
            leaseExpiresAt: until,
            limit: 1,
          }),
        ),
      );
      const won = results.flat();
      expect(won, `${n} workers`).toHaveLength(1);
      expect(won[0]?.jobId).toBe(job.jobId);
    }
  });

  it("legacy migration dry-run is safe when legacy table absent", async () => {
    const result = await migrateLegacyWorkQueueToDurable(pool, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.counts.beforeJobs).toBe(0);
    expect(result.counts.failed).toBe(0);
  });

  it("legacy migration apply + rollback with seeded jobs", async () => {
    const queuedId = randomUUID();
    const runningId = randomUUID();
    await pool.query(`
      create table if not exists public.atlas_work_queue_jobs (
        job_id uuid primary key,
        status text not null,
        updated_at timestamptz not null default now(),
        owner_id text not null,
        run_id uuid,
        automation_id text,
        occurrence_key text not null,
        schedule_id text,
        priority int default 0,
        available_at timestamptz not null default now(),
        scheduled_at timestamptz,
        started_at timestamptz,
        completed_at timestamptz,
        attempt int default 0,
        max_attempts int default 5,
        retry_at timestamptz,
        error_code text,
        diagnostic_id text,
        idempotency_key text not null unique,
        payload jsonb default '{}'::jsonb,
        result_summary text,
        first_error text,
        last_error text,
        created_at timestamptz not null default now(),
        lease_owner text,
        lease_expires_at timestamptz,
        heartbeat_at timestamptz
      )`);
    await pool.query(
      `insert into public.atlas_work_queue_jobs (
         job_id, status, owner_id, run_id, automation_id, occurrence_key,
         idempotency_key, payload
       ) values
       ($1,'queued','owner-mig',$3,'auto-mig','occ-q',$4,'{}'::jsonb),
       ($2,'running','owner-mig',$5,'auto-mig','occ-r',$6,'{}'::jsonb)`,
      [
        queuedId,
        runningId,
        randomUUID(),
        `idem-q-${queuedId}`,
        randomUUID(),
        `idem-r-${runningId}`,
      ],
    );

    const dry = await migrateLegacyWorkQueueToDurable(pool, { dryRun: true });
    expect(dry.counts.beforeJobs).toBe(2);
    expect(dry.manualReviewJobIds).toContain(runningId);

    const applied = await migrateLegacyWorkQueueToDurable(pool, {
      dryRun: false,
    });
    expect(applied.counts.success).toBe(2);
    expect(applied.counts.failed).toBe(0);
    expect(applied.counts.duplicates).toBe(0);
    expect(applied.manualReviewJobIds).toContain(runningId);
    const running = await pool.query(
      `select status from public.atlas_durable_jobs where job_id=$1`,
      [runningId],
    );
    expect(running.rows[0]?.status).toBe("retry");

    const rolled = await rollbackLegacyMigrationBatch(pool, [
      queuedId,
      runningId,
    ]);
    expect(rolled).toBe(2);
    const after = await pool.query(
      `select count(*)::int as c from public.atlas_durable_jobs
       where job_id = any($1::uuid[])`,
      [[queuedId, runningId]],
    );
    expect(Number(after.rows[0]?.c ?? 0)).toBe(0);

    await pool.query(`drop table if exists public.atlas_work_queue_jobs cascade`);
  });

  it("zombie stale update rejected after restart reclaim", async () => {
    const store = new DurableSotWorkQueueStore(dbUrl);
    const { job } = await enqueueFixture(store, "zombie");
    const [a] = await store.leaseJobs({
      workerId: "zombie-old",
      limit: 1,
      leaseMs: 1,
    });
    await store.getJobsRepository().update(job.jobId, {
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
      status: "running",
    });
    const [b] = await store.leaseJobs({
      workerId: "zombie-new",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(b?.leaseToken).not.toBe(a?.leaseToken);
    const rejected = await store.updateJob(
      job.jobId,
      { status: "completed", completedAt: new Date().toISOString() },
      "zombie-old",
      { leaseToken: a?.leaseToken, leaseVersion: a?.leaseVersion },
    );
    expect(rejected).toBeNull();
    const latest = await store.getJob(job.jobId);
    expect(latest?.leaseOwner).toBe("zombie-new");
    expect(latest?.status).not.toBe("completed");
    await store.close();
  });
});

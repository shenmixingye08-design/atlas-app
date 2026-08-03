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
import { DURABLE_QUEUE_STATUSES } from "./schema";
import { JobRepository } from "./repositories/jobs-repository";
import { DurableOccurrencesRepository } from "./repositories/occurrences-repository";
import { DurableQueueRepository } from "./repositories/queue-repository";
import { RunRepository } from "./repositories/run-repository";
import {
  createRunJobQueueTransaction,
  withDurableTransaction,
} from "./transactions/create-run-job-queue";
import { DurableSotUniqueViolationError } from "./types";

const dbUrl =
  process.env.DURABLE_SOT_QUEUE_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_CRUD_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_TEST_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

describe.skipIf(!dbUrl)("Phase 1-3 Run/Job/Queue durable migration", () => {
  let pool: DurableSotPool;
  let runs: RunRepository;
  let jobs: JobRepository;
  let queue: DurableQueueRepository;
  let occurrences: DurableOccurrencesRepository;

  beforeAll(async () => {
    pool = createDurableSotPool(dbUrl);
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
    runs = new RunRepository(pool);
    jobs = new JobRepository(pool);
    queue = new DurableQueueRepository(pool);
    occurrences = new DurableOccurrencesRepository(pool);
  });

  beforeEach(async () => {
    await queue.resetAll();
  });

  afterAll(async () => {
    await applyDurableSotMigrationDown(pool);
    await pool.end();
  });

  describe("Run CRUD", () => {
    it("creates, updates, gets, and completes a run via RunRepository only", async () => {
      const created = await runs.createRun({
        ownerId: "owner-1",
        status: "queued",
        triggerType: "manual",
        payload: { hello: "world" },
        idempotencyKey: `run-crud-${randomUUID()}`,
      });
      expect(created.runId).toBeTruthy();
      expect(created.status).toBe("queued");

      const updated = await runs.updateRun(created.runId, {
        status: "running",
        startedAt: new Date().toISOString(),
      });
      expect(updated?.status).toBe("running");

      const got = await runs.getRun(created.runId);
      expect(got?.runId).toBe(created.runId);

      const completed = await runs.completeRun(created.runId, {
        status: "succeeded",
        resultSummary: "ok",
      });
      expect(completed?.status).toBe("succeeded");
      expect(completed?.completedAt).toBeTruthy();
    });
  });

  describe("Job CRUD", () => {
    it("creates, updates, gets, and changes job status via JobRepository", async () => {
      const run = await runs.createRun({
        ownerId: "owner-1",
        status: "queued",
        idempotencyKey: `job-run-${randomUUID()}`,
      });
      const job = await jobs.create({
        runId: run.runId,
        ownerId: "owner-1",
        automationId: "auto-job",
        occurrenceKey: `occ-job-${randomUUID()}`,
        idempotencyKey: `job-${randomUUID()}`,
        payload: { kind: "fixture" },
      });
      expect(job.status).toBe("queued");

      const updated = await jobs.update(job.jobId, {
        status: "running",
        attempt: 1,
      });
      expect(updated?.status).toBe("running");
      expect(updated?.attempt).toBe(1);

      const got = await jobs.get(job.jobId);
      expect(got?.jobId).toBe(job.jobId);
      expect(await jobs.getByRunId(run.runId)).toMatchObject({
        jobId: job.jobId,
      });
    });
  });

  describe("Queue CRUD + statuses", () => {
    it("supports add/get/update/delete/retry/status for all required statuses", async () => {
      const run = await runs.createRun({
        ownerId: "owner-q",
        status: "queued",
        idempotencyKey: `q-run-${randomUUID()}`,
      });
      const job = await jobs.create({
        runId: run.runId,
        ownerId: "owner-q",
        automationId: "auto-q",
        occurrenceKey: `occ-q-${randomUUID()}`,
        idempotencyKey: `q-job-${randomUUID()}`,
      });
      const enqueued = await queue.enqueue(job);
      expect(enqueued.status).toBe("queued");
      expect(await queue.status(job.jobId)).toBe("queued");

      for (const status of DURABLE_QUEUE_STATUSES) {
        if (status === "queued") continue;
        if (status === "retry") {
          const retried = await queue.retry({
            jobId: job.jobId,
            attempt: 2,
            retryAt: new Date(Date.now() + 60_000).toISOString(),
            errorMessage: "temp",
          });
          expect(retried?.status).toBe("retry");
          expect(retried?.leaseOwner).toBeNull();
          continue;
        }
        const set = await queue.setStatus(job.jobId, status);
        expect(set?.status).toBe(status);
        expect(await queue.status(job.jobId)).toBe(status);
      }

      const deleted = await queue.delete(job.jobId);
      expect(deleted).toBe(true);
      expect(await queue.get(job.jobId)).toBeNull();
    });
  });

  describe("Transaction", () => {
    it("creates Run → Job → Queue atomically", async () => {
      const occurrenceKey = `occ-tx-${randomUUID()}`;
      const result = await createRunJobQueueTransaction(pool, {
        occurrence: {
          ownerId: "owner-tx",
          automationId: "auto-tx",
          occurrenceKey,
          scheduledAt: new Date().toISOString(),
          status: "enqueued",
        },
        run: {
          ownerId: "owner-tx",
          automationId: "auto-tx",
          status: "queued",
          idempotencyKey: `run-tx-${randomUUID()}`,
        },
        job: {
          ownerId: "owner-tx",
          automationId: "auto-tx",
          occurrenceKey,
          idempotencyKey: `job-tx-${randomUUID()}`,
          payload: { kind: "fixture" },
        },
      });
      expect(result.run.runId).toBeTruthy();
      expect(result.job.runId).toBe(result.run.runId);
      expect(result.queue.jobId).toBe(result.job.jobId);
      expect(result.queue.status).toBe("queued");
      expect(result.occurrence?.occurrenceKey).toBe(occurrenceKey);
      expect(result.run.jobId).toBe(result.job.jobId);
    });

    it("rolls back Run/Job/Queue when a later insert fails", async () => {
      const runIdem = `run-rollback-${randomUUID()}`;
      const beforeRuns = await pool.query(
        `select count(*)::int as c from public.atlas_durable_runs where idempotency_key = $1`,
        [runIdem],
      );
      expect(beforeRuns.rows[0]?.c).toBe(0);

      await expect(
        withDurableTransaction(pool, async (client) => {
          const localRuns = new RunRepository(client);
          const localJobs = new JobRepository(client);
          const run = await localRuns.createRun({
            ownerId: "owner-rb",
            status: "queued",
            idempotencyKey: runIdem,
          });
          await localJobs.create({
            runId: run.runId,
            ownerId: "owner-rb",
            automationId: "auto-rb",
            occurrenceKey: `occ-rb-${randomUUID()}`,
            idempotencyKey: `job-rb-${randomUUID()}`,
          });
          // Force failure after successful inserts.
          throw new Error("forced_tx_failure");
        }),
      ).rejects.toThrow("forced_tx_failure");

      const afterRuns = await pool.query(
        `select count(*)::int as c from public.atlas_durable_runs where idempotency_key = $1`,
        [runIdem],
      );
      expect(afterRuns.rows[0]?.c).toBe(0);
      const afterJobs = await pool.query(
        `select count(*)::int as c from public.atlas_durable_jobs`,
      );
      expect(afterJobs.rows[0]?.c).toBe(0);
    });
  });

  describe("Idempotency / Unique", () => {
    it("rejects duplicate run idempotency keys", async () => {
      const key = `run-dup-${randomUUID()}`;
      await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: key,
      });
      await expect(
        runs.createRun({ ownerId: "owner-1", idempotencyKey: key }),
      ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
    });

    it("rejects duplicate job idempotency keys", async () => {
      const runA = await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: `run-a-${randomUUID()}`,
      });
      const runB = await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: `run-b-${randomUUID()}`,
      });
      const key = `job-dup-${randomUUID()}`;
      await jobs.create({
        runId: runA.runId,
        ownerId: "owner-1",
        automationId: "auto-dup",
        occurrenceKey: `occ-a-${randomUUID()}`,
        idempotencyKey: key,
      });
      await expect(
        jobs.create({
          runId: runB.runId,
          ownerId: "owner-1",
          automationId: "auto-dup-2",
          occurrenceKey: `occ-b-${randomUUID()}`,
          idempotencyKey: key,
        }),
      ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
    });

    it("rejects duplicate job per run_id", async () => {
      const run = await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: `run-once-${randomUUID()}`,
      });
      await jobs.create({
        runId: run.runId,
        ownerId: "owner-1",
        automationId: "auto-once",
        occurrenceKey: `occ-once-${randomUUID()}`,
        idempotencyKey: `job-once-${randomUUID()}`,
      });
      await expect(
        jobs.create({
          runId: run.runId,
          ownerId: "owner-1",
          automationId: "auto-once-2",
          occurrenceKey: `occ-once-2-${randomUUID()}`,
          idempotencyKey: `job-once-2-${randomUUID()}`,
        }),
      ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
    });

    it("rejects duplicate automation_id + occurrence_key on jobs", async () => {
      const runA = await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: `run-occ-a-${randomUUID()}`,
      });
      const runB = await runs.createRun({
        ownerId: "owner-1",
        idempotencyKey: `run-occ-b-${randomUUID()}`,
      });
      const occurrenceKey = `occ-shared-${randomUUID()}`;
      await jobs.create({
        runId: runA.runId,
        ownerId: "owner-1",
        automationId: "auto-shared",
        occurrenceKey,
        idempotencyKey: `job-occ-a-${randomUUID()}`,
      });
      await expect(
        jobs.create({
          runId: runB.runId,
          ownerId: "owner-1",
          automationId: "auto-shared",
          occurrenceKey,
          idempotencyKey: `job-occ-b-${randomUUID()}`,
        }),
      ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
    });

    it("rejects duplicate occurrence reservation", async () => {
      const occurrenceKey = `occ-res-${randomUUID()}`;
      await occurrences.create({
        ownerId: "owner-1",
        automationId: "auto-res",
        occurrenceKey,
        scheduledAt: new Date().toISOString(),
      });
      await expect(
        occurrences.create({
          ownerId: "owner-1",
          automationId: "auto-res",
          occurrenceKey,
          scheduledAt: new Date().toISOString(),
        }),
      ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
    });
  });

  describe("Concurrency", () => {
    it("allows only one winner for concurrent duplicate job creates", async () => {
      const runA = await runs.createRun({
        ownerId: "owner-c",
        idempotencyKey: `run-c-a-${randomUUID()}`,
      });
      const runB = await runs.createRun({
        ownerId: "owner-c",
        idempotencyKey: `run-c-b-${randomUUID()}`,
      });
      const key = `job-concurrent-${randomUUID()}`;
      const results = await Promise.allSettled([
        jobs.create({
          runId: runA.runId,
          ownerId: "owner-c",
          automationId: "auto-c-1",
          occurrenceKey: `occ-c-1-${randomUUID()}`,
          idempotencyKey: key,
        }),
        jobs.create({
          runId: runB.runId,
          ownerId: "owner-c",
          automationId: "auto-c-2",
          occurrenceKey: `occ-c-2-${randomUUID()}`,
          idempotencyKey: key,
        }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason,
      ).toBeInstanceOf(DurableSotUniqueViolationError);
    });

    it("claimDue leases distinct jobs under concurrent workers", async () => {
      for (let i = 0; i < 5; i += 1) {
        await createRunJobQueueTransaction(pool, {
          run: {
            ownerId: "owner-lease",
            status: "queued",
            idempotencyKey: `run-lease-${i}-${randomUUID()}`,
          },
          job: {
            ownerId: "owner-lease",
            automationId: `auto-lease-${i}`,
            occurrenceKey: `occ-lease-${i}-${randomUUID()}`,
            idempotencyKey: `job-lease-${i}-${randomUUID()}`,
          },
        });
      }
      const now = new Date().toISOString();
      const leaseUntil = new Date(Date.now() + 60_000).toISOString();
      const [a, b] = await Promise.all([
        queue.claimDue({
          nowIso: now,
          leaseOwner: "worker-a",
          leaseExpiresAt: leaseUntil,
          limit: 3,
        }),
        queue.claimDue({
          nowIso: now,
          leaseOwner: "worker-b",
          leaseExpiresAt: leaseUntil,
          limit: 3,
        }),
      ]);
      const ids = [...a, ...b].map((j) => j.jobId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(5);
      expect([...a, ...b].every((j) => j.status === "leased")).toBe(true);
    });
  });

  describe("Repository surface", () => {
    it("exposes RunRepository / JobRepository / DurableQueueRepository methods", () => {
      expect(typeof runs.createRun).toBe("function");
      expect(typeof runs.updateRun).toBe("function");
      expect(typeof runs.getRun).toBe("function");
      expect(typeof runs.completeRun).toBe("function");
      expect(typeof jobs.create).toBe("function");
      expect(typeof jobs.update).toBe("function");
      expect(typeof jobs.get).toBe("function");
      expect(typeof queue.enqueue).toBe("function");
      expect(typeof queue.get).toBe("function");
      expect(typeof queue.update).toBe("function");
      expect(typeof queue.delete).toBe("function");
      expect(typeof queue.retry).toBe("function");
      expect(typeof queue.status).toBe("function");
      expect(typeof queue.setStatus).toBe("function");
      expect(typeof queue.claimDue).toBe("function");
    });
  });
});

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DurableStore } from "./durable-store";
import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
  type DurableSotPool,
} from "./db";
import {
  applyDurableSotMigrationDown,
  applyDurableSotMigrationUp,
} from "./migration";
import { PostgresDurableStore } from "./postgres-durable-store";
import { DurableSotUniqueViolationError } from "./types";

const dbUrl =
  process.env.DURABLE_SOT_CRUD_DATABASE_URL?.trim() ||
  process.env.DURABLE_SOT_TEST_DATABASE_URL?.trim() ||
  resolveDurableSotDatabaseUrl() ||
  "";

describe("DurableStore interface surface", () => {
  it("exposes required methods on PostgresDurableStore prototype", () => {
    const required: Array<keyof DurableStore> = [
      "createRun",
      "updateRun",
      "acquireLease",
      "releaseLease",
      "appendEvidence",
      "saveRetry",
      "saveHeartbeat",
      "findPendingRuns",
      "findRecoverableRuns",
      "findOccurrence",
      "recordCompletion",
    ];
    for (const method of required) {
      expect(typeof PostgresDurableStore.prototype[method]).toBe("function");
    }
  });
});

describe.skipIf(!dbUrl)("Durable SoT repositories (Postgres CRUD)", () => {
  let pool: DurableSotPool;
  let store: PostgresDurableStore;

  beforeAll(async () => {
    pool = createDurableSotPool(dbUrl);
    await applyDurableSotMigrationDown(pool);
    await applyDurableSotMigrationUp(pool);
    store = new PostgresDurableStore(pool);
  });

  afterAll(async () => {
    if (pool) {
      await applyDurableSotMigrationDown(pool);
    }
    if (store) {
      await store.close();
    }
  });

  beforeEach(async () => {
    // Isolate rows between tests without dropping schema.
    await pool.query(`
      truncate
        public.atlas_durable_idempotency_keys,
        public.atlas_durable_completion_evidence,
        public.atlas_durable_recovery_states,
        public.atlas_durable_retry_states,
        public.atlas_durable_heartbeats,
        public.atlas_durable_leases,
        public.atlas_durable_steps,
        public.atlas_durable_runs,
        public.atlas_durable_scheduler_occurrences
      cascade
    `);
  });

  it("CRUD run / step / lease / heartbeat / retry / recovery", async () => {
    const occurrence = await store.createOccurrence({
      ownerId: "user_1",
      automationId: "auto_1",
      occurrenceKey: "occ-1",
      scheduledAt: new Date().toISOString(),
    });

    const run = await store.createRun({
      ownerId: "user_1",
      automationId: "auto_1",
      occurrenceId: occurrence.occurrenceId,
      status: "queued",
      payload: { kind: "test" },
    });
    expect(run.runId).toBeTruthy();
    expect(run.status).toBe("queued");

    const step = await store.createStep({
      runId: run.runId,
      stepId: "s1",
      stepIndex: 0,
      stepType: "excel_generate",
    });
    expect(step.stepId).toBe("s1");

    const leased = await store.acquireLease({
      runId: run.runId,
      leaseOwner: "worker-a",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(leased.acquired).toBe(true);

    const hb = await store.saveHeartbeat({
      runId: run.runId,
      leaseOwner: "worker-a",
    });
    expect(hb.leaseOwner).toBe("worker-a");

    const retry = await store.saveRetry({
      runId: run.runId,
      attempt: 1,
      maxAttempts: 5,
      retryAt: new Date(Date.now() + 5_000).toISOString(),
      errorCode: "temporary",
    });
    expect(retry.attempt).toBe(1);

    const recovery = await store.saveRecovery({
      runId: run.runId,
      recoveryStatus: "needed",
      reason: "lease_expired",
    });
    expect(recovery.recoveryStatus).toBe("needed");

    const completed = await store.recordCompletion({
      runId: run.runId,
      status: "succeeded",
      resultSummary: "ok",
    });
    expect(completed?.status).toBe("succeeded");
    expect(completed?.resultSummary).toBe("ok");

    expect(await store.listSteps(run.runId)).toHaveLength(1);
    expect(await store.releaseLease(run.runId, "worker-a")).toBe(true);
  });

  it("findPendingRuns and findRecoverableRuns", async () => {
    const pending = await store.createRun({
      ownerId: "u",
      status: "pending",
    });
    await store.createRun({ ownerId: "u", status: "succeeded" });

    const pendingList = await store.findPendingRuns(10);
    expect(pendingList.some((r) => r.runId === pending.runId)).toBe(true);

    const stuck = await store.createRun({
      ownerId: "u",
      status: "running",
    });
    await store.acquireLease({
      runId: stuck.runId,
      leaseOwner: "dead-worker",
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const recoverable = await store.findRecoverableRuns({
      nowIso: new Date().toISOString(),
    });
    expect(recoverable.some((r) => r.runId === stuck.runId)).toBe(true);
  });

  it("rejects duplicate occurrence keys", async () => {
    await store.createOccurrence({
      ownerId: "u",
      automationId: "auto",
      occurrenceKey: "same",
      scheduledAt: new Date().toISOString(),
    });
    await expect(
      store.createOccurrence({
        ownerId: "u",
        automationId: "auto",
        occurrenceKey: "same",
        scheduledAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
  });

  it("rejects duplicate completion evidence", async () => {
    const run = await store.createRun({ ownerId: "u" });
    await store.appendEvidence({
      runId: run.runId,
      evidenceKind: "artifact",
      evidenceFingerprint: "sha-1",
    });
    await expect(
      store.appendEvidence({
        runId: run.runId,
        evidenceKind: "artifact",
        evidenceFingerprint: "sha-1",
      }),
    ).rejects.toBeInstanceOf(DurableSotUniqueViolationError);
  });

  it("idempotency key is unique per scope and returns existing", async () => {
    const run = await store.createRun({ ownerId: "u" });
    const first = await store.recordIdempotency({
      scope: "external_action",
      idempotencyKey: "k1",
      runId: run.runId,
    });
    expect(first.created).toBe(true);
    const second = await store.recordIdempotency({
      scope: "external_action",
      idempotencyKey: "k1",
      runId: run.runId,
    });
    expect(second.created).toBe(false);
    expect(second.record.idempotencyKey).toBe("k1");

    // Different scope may reuse key
    const other = await store.recordIdempotency({
      scope: "notify",
      idempotencyKey: "k1",
    });
    expect(other.created).toBe(true);
  });

  it("lease is one-per-run and blocks other owners while active", async () => {
    const run = await store.createRun({ ownerId: "u", status: "queued" });
    const a = await store.acquireLease({
      runId: run.runId,
      leaseOwner: "w1",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(a.acquired).toBe(true);
    const b = await store.acquireLease({
      runId: run.runId,
      leaseOwner: "w2",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(b.acquired).toBe(false);
    expect(b.lease.leaseOwner).toBe("w1");
  });

  it("findOccurrence returns reserved row", async () => {
    const key = `occ-${randomUUID()}`;
    await store.createOccurrence({
      ownerId: "u",
      automationId: "auto-x",
      occurrenceKey: key,
      scheduledAt: new Date().toISOString(),
    });
    const found = await store.findOccurrence({
      automationId: "auto-x",
      occurrenceKey: key,
    });
    expect(found?.occurrenceKey).toBe(key);
  });
});

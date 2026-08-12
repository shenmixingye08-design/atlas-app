/**
 * Regression: drain_1 500 from CHECK violation on attempt reclaim.
 * Covers claim attempt cap, stale lease, duplicate claim, retry, no-op drain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WORK_QUEUE_CLOCK_SKEW_MS,
  WORK_QUEUE_FORCE_FILE_ENV,
  WORK_QUEUE_LEASE_MS,
  WORK_QUEUE_STUCK_MS,
} from "./constants";
import {
  clearWorkQueueStoreSingletonForTests,
  resetWorkQueueStoreForTests,
} from "./store";
import { createFileWorkQueueStore } from "./store/file-store";
import { drainWorkQueue, recoverStuckJobs } from "./worker";
import { WORK_JOB_TRANSITIONS, type EnqueueJobInput } from "./types";

function fixtureInput(
  occurrenceKey: string,
  maxAttempts = 5,
): EnqueueJobInput {
  return {
    ownerId: "owner_drain_cv",
    automationId: "auto_drain_cv",
    occurrenceKey,
    payload: { kind: "fixture", offlineArtifacts: true },
    maxAttempts,
    steps: [
      {
        stepId: "generate",
        stepType: "fixture_work",
        inputBindings: {},
      },
    ],
  };
}

describe("drain CHECK violation / attempt-cap safety", () => {
  beforeEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_WORK_QUEUE_OFFLINE_NOTIFY", "1");
  });

  afterEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
  });

  it("1: reclaim of exhausted expired lease dead-letters (no CHECK-like overflow)", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_exhausted", 2));
    const [leased] = await store.leaseJobs({
      workerId: "w_ex",
      limit: 1,
      leaseMs: 1,
    });
    expect(leased).toBeTruthy();
    // Simulate prior reclaim climbs: attempt already at max_attempts.
    await store.updateJob(job.jobId, {
      attempt: 2,
      leaseOwner: "w_ex",
      leaseExpiresAt: new Date(
        Date.now() - WORK_QUEUE_CLOCK_SKEW_MS - 50,
      ).toISOString(),
      heartbeatAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const claimed = await store.leaseJobs({
      workerId: "w_rescue",
      limit: 1,
      leaseMs: WORK_QUEUE_LEASE_MS,
      nowMs: Date.now() + WORK_QUEUE_CLOCK_SKEW_MS + 20,
    });
    expect(claimed).toEqual([]);
    const after = await store.getJob(job.jobId);
    expect(after?.status).toBe("dead_letter");
    expect(after!.attempt).toBeLessThanOrEqual(after!.maxAttempts + 1);
  });

  it("2: invalid transition leased→completed is rejected by store FSM", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput("occ_bad_trans"));
    const [leased] = await store.leaseJobs({
      workerId: "w1",
      limit: 1,
      leaseMs: WORK_QUEUE_LEASE_MS,
    });
    await expect(
      store.updateJob(
        leased!.jobId,
        { status: "completed", completedAt: new Date().toISOString() },
        "w1",
      ),
    ).rejects.toThrow(/invalid_transition:leased->completed/);
    expect(WORK_JOB_TRANSITIONS.leased).toContain("dead_letter");
    expect(WORK_JOB_TRANSITIONS.leased).not.toContain("completed");
  });

  it("3: stale lease reclaim is single-winner and safe", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_stale"));
    await store.leaseJobs({
      workerId: "dead",
      limit: 1,
      leaseMs: 1,
    });
    const nowMs = Date.now() + WORK_QUEUE_CLOCK_SKEW_MS + 30;
    const [a, b] = await Promise.all([
      store.leaseJobs({
        workerId: "a",
        limit: 1,
        leaseMs: WORK_QUEUE_LEASE_MS,
        nowMs,
      }),
      store.leaseJobs({
        workerId: "b",
        limit: 1,
        leaseMs: WORK_QUEUE_LEASE_MS,
        nowMs,
      }),
    ]);
    const won = [...a, ...b];
    expect(won).toHaveLength(1);
    expect(won[0]!.jobId).toBe(job.jobId);
  });

  it("4: duplicate claim of same due job is impossible (concurrent)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drain-cv-"));
    const store = createFileWorkQueueStore(join(dir, "q.json"));
    await store.enqueue(fixtureInput(`occ_dup_${Date.now()}`));
    const claims = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.leaseJobs({
          workerId: `cw_${i}`,
          limit: 1,
          leaseMs: WORK_QUEUE_LEASE_MS,
        }),
      ),
    );
    expect(claims.flat()).toHaveLength(1);
  });

  it("5: concurrent drain no-op / success does not throw", async () => {
    resetWorkQueueStoreForTests();
    const results = await Promise.all([
      drainWorkQueue({ workerId: "d1", limit: 5, skipRecover: true }),
      drainWorkQueue({ workerId: "d2", limit: 5, skipRecover: true }),
      drainWorkQueue({ workerId: "d3", limit: 5, skipRecover: true }),
    ]);
    for (const r of results) {
      expect(r.leased).toBeGreaterThanOrEqual(0);
      expect(r.completed + r.failed + r.retried).toBeLessThanOrEqual(r.leased);
    }
  });

  it("6: retry after stuck recovery schedules without overflowing attempt", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_retry_safe", 3));
    const [leased] = await store.leaseJobs({
      workerId: "dead",
      limit: 1,
      leaseMs: 1,
    });
    await store.updateJob(
      leased!.jobId,
      {
        status: "running",
        attempt: 1,
        leaseExpiresAt: new Date(
          Date.now() - WORK_QUEUE_CLOCK_SKEW_MS - 1000,
        ).toISOString(),
        heartbeatAt: new Date(
          Date.now() - WORK_QUEUE_STUCK_MS - 5_000,
        ).toISOString(),
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      },
      "dead",
    );
    const n = await recoverStuckJobs(Date.now());
    expect(n).toBe(1);
    const after = await store.getJob(job.jobId);
    expect(after?.status).toBe("retry_scheduled");
    expect(after!.attempt).toBe(2);
    expect(after!.attempt).toBeLessThanOrEqual(after!.maxAttempts + 1);
  });

  it("7: valid drain success completes fixture job", async () => {
    resetWorkQueueStoreForTests();
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput(`occ_ok_${Date.now()}`));
    const result = await drainWorkQueue({
      workerId: "ok_w",
      limit: 5,
    });
    expect(result.leased).toBeGreaterThanOrEqual(1);
    expect(result.completed + result.failed + result.retried).toBe(
      result.leased,
    );
  });

  it("8: no-op drain on empty queue succeeds", async () => {
    resetWorkQueueStoreForTests();
    const result = await drainWorkQueue({
      workerId: "empty_w",
      limit: 5,
      skipRecover: true,
    });
    expect(result.leased).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("9: exhausted stuck reclaim → dead_letter (not attempt overflow)", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_dl", 2));
    const [leased] = await store.leaseJobs({
      workerId: "dead",
      limit: 1,
      leaseMs: 1,
    });
    await store.updateJob(
      leased!.jobId,
      {
        status: "running",
        attempt: 2,
        leaseExpiresAt: new Date(
          Date.now() - WORK_QUEUE_CLOCK_SKEW_MS - 1000,
        ).toISOString(),
        heartbeatAt: new Date(
          Date.now() - WORK_QUEUE_STUCK_MS - 5_000,
        ).toISOString(),
      },
      "dead",
    );
    const reclaimed = await store.reclaimStuckJob!({
      jobId: job.jobId,
      nowMs: Date.now(),
      stuckMs: WORK_QUEUE_STUCK_MS,
      attempt: 99,
      retryAt: null,
      status: "dead_letter",
      diagnosticId: "d_ex",
      lastError: "exhausted",
    });
    expect(reclaimed?.status).toBe("dead_letter");
    expect(reclaimed!.attempt).toBeLessThanOrEqual(reclaimed!.maxAttempts + 1);
  });

  it("10: prior pool_exhausted classification regression still holds", async () => {
    const { classifyWorkQueueFailure } = await import("./failure-class");
    const diag = classifyWorkQueueFailure(
      new Error("MaxClientsInSessionMode: max clients reached"),
      "drain",
    );
    expect(diag.developerCode).toBe("work_queue_pool_exhausted");
    expect(diag.failureClass).toBe("retryable");
  });
});

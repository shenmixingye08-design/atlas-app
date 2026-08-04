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
  getWorkQueueStore,
  resetWorkQueueStoreForTests,
  WorkQueueStoreUnavailableError,
} from "./store";
import { createFileWorkQueueStore } from "./store/file-store";
import { recoverStuckJobs } from "./worker";
import type { EnqueueJobInput } from "./types";

function fixtureInput(occurrenceKey: string): EnqueueJobInput {
  return {
    ownerId: "owner_p02",
    automationId: "auto_p02",
    occurrenceKey,
    payload: { kind: "fixture", offlineArtifacts: true, assignment: "P0-2" },
    steps: [
      {
        stepId: "generate",
        stepType: "fixture_work",
        inputBindings: {},
      },
    ],
  };
}

describe("P0-2 durable job claim", () => {
  beforeEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
  });

  it("1+2+3: concurrent workers claim same due job at most once (2/10/100)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p02-claim-"));
    const store = createFileWorkQueueStore(join(dir, "q.json"));
    await store.enqueue(fixtureInput(`occ_parallel_${Date.now()}`));

    for (const workers of [2, 10, 100]) {
      const claims = await Promise.all(
        Array.from({ length: workers }, (_, i) =>
          store.leaseJobs({
            workerId: `w_${workers}_${i}`,
            limit: 1,
            leaseMs: WORK_QUEUE_LEASE_MS,
          }),
        ),
      );
      const won = claims.flat();
      expect(won.length).toBe(1);
      const job = won[0]!;
      await store.updateJob(job.jobId, {
        status: "queued",
        leaseOwner: null,
        leaseExpiresAt: null,
        claimedAt: null,
        attempt: 0,
        availableAt: new Date(0).toISOString(),
      });
    }
  });

  it("4: worker crash leaves job reclaimable after lease expiry", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_crash"));
    const [leased] = await store.leaseJobs({
      workerId: "crashed_worker",
      limit: 1,
      leaseMs: 1,
    });
    expect(leased?.jobId).toBe(job.jobId);
    const nowMs = Date.now() + WORK_QUEUE_CLOCK_SKEW_MS + 50;
    const [reclaimed] = await store.leaseJobs({
      workerId: "rescue_worker",
      limit: 1,
      leaseMs: WORK_QUEUE_LEASE_MS,
      nowMs,
    });
    expect(reclaimed?.jobId).toBe(job.jobId);
    expect(reclaimed?.leaseOwner).toBe("rescue_worker");
  });

  it("5+6: heartbeat extends lease; another worker cannot steal before expiry", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput("occ_hb"));
    const [leased] = await store.leaseJobs({
      workerId: "owner_w",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leased).toBeTruthy();
    const ok = await store.heartbeat(leased!.jobId, "owner_w", 60_000);
    expect(ok).toBe(true);
    const stolen = await store.leaseJobs({
      workerId: "thief_w",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(stolen).toEqual([]);
    const denied = await store.heartbeat(leased!.jobId, "thief_w", 60_000);
    expect(denied).toBe(false);
  });

  it("7: lease expiry allows safe reclaim by another worker", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput("occ_expiry"));
    await store.leaseJobs({
      workerId: "old_w",
      limit: 1,
      leaseMs: 1,
    });
    const [next] = await store.leaseJobs({
      workerId: "new_w",
      limit: 1,
      leaseMs: 60_000,
      nowMs: Date.now() + WORK_QUEUE_CLOCK_SKEW_MS + 20,
    });
    expect(next?.leaseOwner).toBe("new_w");
  });

  it("8: complete is lease-owner guarded (duplicate complete rejected)", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput("occ_complete"));
    const [leased] = await store.leaseJobs({
      workerId: "owner_w",
      limit: 1,
      leaseMs: 60_000,
    });
    await store.updateJob(leased!.jobId, { status: "running" }, "owner_w");
    const first = await store.updateJob(
      leased!.jobId,
      {
        status: "completed",
        completedAt: new Date().toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
      "owner_w",
    );
    expect(first?.status).toBe("completed");
    const second = await store.updateJob(
      leased!.jobId,
      { status: "completed", resultSummary: "dup" },
      "other_w",
    );
    expect(second).toBeNull();
  });

  it("9: retry reclaim is single-winner under contention", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_retry"));
    await store.leaseJobs({
      workerId: "w1",
      limit: 1,
      leaseMs: 1,
    });
    await store.updateJob(job.jobId, {
      status: "running",
      heartbeatAt: new Date(Date.now() - WORK_QUEUE_STUCK_MS - 1000).toISOString(),
      leaseExpiresAt: new Date(
        Date.now() - WORK_QUEUE_CLOCK_SKEW_MS - 10,
      ).toISOString(),
      leaseOwner: "w1",
      attempt: 1,
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.reclaimStuckJob!({
          jobId: job.jobId,
          nowMs: Date.now(),
          stuckMs: WORK_QUEUE_STUCK_MS,
          attempt: 2,
          retryAt: new Date(Date.now() + 1000).toISOString(),
          status: "retry_scheduled",
          diagnosticId: "d1",
          lastError: "stuck",
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("10: scheduler double enqueue is idempotent (duplicate=0)", async () => {
    const store = resetWorkQueueStoreForTests();
    const a = await store.enqueue(fixtureInput("occ_idem"));
    const b = await store.enqueue(fixtureInput("occ_idem"));
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.job.jobId).toBe(b.job.jobId);
    const metrics = await store.metrics();
    expect(metrics.duplicateCount).toBeGreaterThanOrEqual(1);
  });

  it("11: Production without DB URL fail-closes (no file/memory claim)", () => {
    clearWorkQueueStoreSingletonForTests();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_URL", "");
    vi.stubEnv("SUPABASE_DB_URL", "");
    vi.stubEnv("DIRECT_URL", "");
    expect(() => getWorkQueueStore()).toThrow(WorkQueueStoreUnavailableError);
  });

  it("12: Production FORCE_FILE is refused", () => {
    clearWorkQueueStoreSingletonForTests();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    expect(() => getWorkQueueStore()).toThrow(/FORCE_FILE is forbidden/);
  });

  it("13: process restart (new store path) keeps queued job durable on file SoT used in tests", async () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "p02-restart-")),
      "queue.json",
    );
    const storeA = createFileWorkQueueStore(path);
    const { job } = await storeA.enqueue(fixtureInput("occ_restart"));
    const storeB = createFileWorkQueueStore(path);
    const loaded = await storeB.getJob(job.jobId);
    expect(loaded?.jobId).toBe(job.jobId);
    expect(loaded?.status).toBe("queued");
  });

  it("14: owner boundary — worker update with wrong lease owner cannot complete", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue({
      ...fixtureInput("occ_owner"),
      ownerId: "owner_a",
    });
    const [leased] = await store.leaseJobs({
      workerId: "worker_a",
      limit: 1,
      leaseMs: 60_000,
    });
    expect(leased?.ownerId).toBe("owner_a");
    const hijack = await store.updateJob(
      leased!.jobId,
      { status: "completed", completedAt: new Date().toISOString() },
      "worker_b",
    );
    expect(hijack).toBeNull();
    const still = await store.getJob(leased!.jobId);
    expect(still?.status).toBe("leased");
  });

  it("15: cancel vs complete race — cancelled job cannot be completed by stale owner", async () => {
    const store = resetWorkQueueStoreForTests();
    await store.enqueue(fixtureInput("occ_cancel"));
    const [leased] = await store.leaseJobs({
      workerId: "w_cancel",
      limit: 1,
      leaseMs: 60_000,
    });
    await store.updateJob(leased!.jobId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    const complete = await store.updateJob(
      leased!.jobId,
      { status: "completed", resultSummary: "late" },
      "w_cancel",
    );
    expect(complete).toBeNull();
    const final = await store.getJob(leased!.jobId);
    expect(final?.status).toBe("cancelled");
  });

  it("legacy automation claim refuses Map fallback in Production", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { claimAutomationJob, AutomationJobClaimUnavailableError } =
      await import("@/lib/jobs/job-store");
    await expect(
      claimAutomationJob({
        id: "job_x",
        userId: "u",
        automationId: "a",
        idempotencyKey: "k",
      }),
    ).rejects.toBeInstanceOf(AutomationJobClaimUnavailableError);
  });

  it("12b: Migration-missing Production still refuses file FORCE", () => {
    // Same gate as 12 — missing RPC is handled by inline SKIP LOCKED in Postgres store;
    // Production must never open file SoT when FORCE_FILE is set.
    clearWorkQueueStoreSingletonForTests();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/db");
    expect(() => getWorkQueueStore()).toThrow(/FORCE_FILE is forbidden/);
  });

  it("word + work-job Production refuse Map-only claim", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { claimWordJob, WordJobClaimUnavailableError } = await import(
      "@/lib/deliverables/word-job-stages"
    );
    await expect(
      claimWordJob({
        jobId: "wj1",
        userId: "u",
        assignment: "x",
        sourceContent: "y",
        baseFileName: "z",
      }),
    ).rejects.toBeInstanceOf(WordJobClaimUnavailableError);

    const { executeWorkJob } = await import("@/lib/work-jobs/run");
    await expect(executeWorkJob("missing", "u")).rejects.toThrow(
      /work_job_claim_unavailable/,
    );
  });

  it("stuck recovery uses atomic reclaim (single success)", async () => {
    const store = resetWorkQueueStoreForTests();
    const { job } = await store.enqueue(fixtureInput("occ_stuck_rec"));
    const [leased] = await store.leaseJobs({
      workerId: "dead",
      limit: 1,
      leaseMs: 1,
    });
    await store.updateJob(
      leased!.jobId,
      {
        status: "running",
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
  });
});

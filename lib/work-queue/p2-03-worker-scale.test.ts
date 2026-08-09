import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WORK_QUEUE_FORCE_FILE_ENV,
  WORK_QUEUE_WORKER_BATCH,
  WORK_QUEUE_WORKER_FANOUT_DEFAULT,
} from "./constants";
import { buildOccurrenceKey } from "./occurrence";
import {
  clearWorkQueueStoreSingletonForTests,
  getWorkQueueStore,
} from "./store";
import {
  computeWorkerScalePlan,
  drainWorkQueueHorizontal,
} from "./worker-scale";
import { probeWorkerScale } from "./worker-scale-probe";

describe("P2-03 worker水平スケール — plan / happy / invalid / failure", () => {
  beforeEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
    vi.stubEnv("NODE_ENV", "test");
    const dir = mkdtempSync(join(tmpdir(), "p203-wq-"));
    vi.stubEnv("ATLAS_WORK_QUEUE_FILE", join(dir, "q.json"));
    clearWorkQueueStoreSingletonForTests();
  });

  afterEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
  });

  it("happy: claim limit reviewed (>10) and default fan-out >= 2", () => {
    expect(WORK_QUEUE_WORKER_BATCH).toBeGreaterThan(10);
    expect(WORK_QUEUE_WORKER_BATCH).toBeLessThanOrEqual(25);
    expect(WORK_QUEUE_WORKER_FANOUT_DEFAULT).toBeGreaterThanOrEqual(2);
    const plan = computeWorkerScalePlan({ queued: 0 });
    expect(plan.fanOut).toBe(WORK_QUEUE_WORKER_FANOUT_DEFAULT);
    expect(plan.claimLimit).toBe(WORK_QUEUE_WORKER_BATCH);
    expect(plan.backpressure).toBe(false);
  });

  it("invalid: claimLimit 0 / fanOut 0 means no drain", async () => {
    const empty = await drainWorkQueueHorizontal({
      fanOut: 0,
      claimLimit: 0,
      skipMetrics: true,
    });
    expect(empty.workers).toEqual([]);
    expect(empty.leased).toBe(0);
  });

  it("failure/backpressure: in-flight pressure shrinks claim and fan-out", () => {
    const backlog = computeWorkerScalePlan({ queued: 100, running: 0, leased: 0 });
    const pressure = computeWorkerScalePlan({
      queued: 100,
      running: 25,
      leased: 10,
    });
    expect(backlog.fanOut).toBeGreaterThan(WORK_QUEUE_WORKER_FANOUT_DEFAULT);
    expect(pressure.backpressure).toBe(true);
    expect(pressure.claimLimit).toBeLessThan(backlog.claimLimit);
    expect(pressure.fanOut).toBeLessThanOrEqual(backlog.fanOut);
  });
});

describe("P2-03 — retry / duplicate / concurrency / multi-instance", () => {
  beforeEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
    vi.stubEnv("NODE_ENV", "test");
    const dir = mkdtempSync(join(tmpdir(), "p203-conc-"));
    vi.stubEnv("ATLAS_WORK_QUEUE_FILE", join(dir, "q.json"));
    clearWorkQueueStoreSingletonForTests();
  });

  afterEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
  });

  it("concurrency: horizontal drain uses distinct worker ids (no shared memory SoT)", async () => {
    const store = getWorkQueueStore();
    const stamp = Date.now();
    for (let i = 0; i < 9; i += 1) {
      await store.enqueue({
        ownerId: "user_p203",
        automationId: null,
        occurrenceKey: buildOccurrenceKey({
          automationId: `p203_job_${stamp}_${i}`,
          scheduledAt: new Date(stamp + i),
          timezone: "UTC",
        }),
        payload: {
          kind: "benchmark",
          offlineArtifacts: true,
          assignment: `scale ${i}`,
        },
        steps: [
          { stepId: "fixture", stepType: "fixture_work", inputBindings: {} },
        ],
      });
    }

    const drain = await drainWorkQueueHorizontal({
      fanOut: 3,
      claimLimit: 3,
      workerIdPrefix: "p203test",
    });
    expect(drain.workerIds).toHaveLength(3);
    expect(new Set(drain.workerIds).size).toBe(3);
    expect(drain.completed + drain.failed + drain.retried).toBeGreaterThan(0);
    // Duplicate worker id forbidden
    expect(drain.workerIds[0]).not.toBe(drain.workerIds[1]);
  });

  it("duplicate: plan is deterministic for same metrics", () => {
    const a = computeWorkerScalePlan({ queued: 40, running: 5, leased: 5 });
    const b = computeWorkerScalePlan({ queued: 40, running: 5, leased: 5 });
    expect(a).toEqual(b);
  });

  it("multi-worker lease: concurrent claim partitions jobs (fail-closed double-run)", async () => {
    const store = getWorkQueueStore();
    const stamp = Date.now();
    for (let i = 0; i < 4; i += 1) {
      await store.enqueue({
        ownerId: "user_p203_lease",
        automationId: null,
        occurrenceKey: buildOccurrenceKey({
          automationId: `p203_lease_${stamp}_${i}`,
          scheduledAt: new Date(stamp + i),
          timezone: "UTC",
        }),
        payload: { kind: "benchmark", offlineArtifacts: true, assignment: "lease" },
        steps: [
          { stepId: "fixture", stepType: "fixture_work", inputBindings: {} },
        ],
      });
    }
    const [a, b] = await Promise.all([
      store.leaseJobs({ workerId: "lease_a", limit: 2, leaseMs: 60_000 }),
      store.leaseJobs({ workerId: "lease_b", limit: 2, leaseMs: 60_000 }),
    ]);
    const ids = [...a, ...b].map((j) => j.jobId);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});

describe("P2-03 — probe / ownership / fail-closed posture", () => {
  beforeEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
    vi.stubEnv(WORK_QUEUE_FORCE_FILE_ENV, "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
    vi.stubEnv("NODE_ENV", "test");
    const dir = mkdtempSync(join(tmpdir(), "p203-probe-"));
    vi.stubEnv("ATLAS_WORK_QUEUE_FILE", join(dir, "q.json"));
    clearWorkQueueStoreSingletonForTests();
  });

  afterEach(() => {
    clearWorkQueueStoreSingletonForTests();
    vi.unstubAllEnvs();
  });

  it("probe passes on file store with wiring + multi-worker lease", async () => {
    const result = await probeWorkerScale();
    expect(result.claimLimitReviewed).toBe(true);
    expect(result.horizontalDrainWired).toBe(true);
    expect(result.backpressureConfigured).toBe(true);
    expect(result.minutePathPresent).toBe(true);
    expect(result.multiWorkerLeaseOk).toBe(true);
    expect(result.horizontalDrainOk).toBe(true);
    expect(result.failClosedUnauthorized).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it("ownership: probe owner id is dedicated (not a real user namespace)", async () => {
    // Probe uses __atlas_worker_scale_probe__ — assert via source contract.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "lib/work-queue/worker-scale-probe.ts",
      "utf8",
    );
    expect(src).toContain("__atlas_worker_scale_probe__");
    expect(src).toContain("releaseNonProbeLease");
  });
});

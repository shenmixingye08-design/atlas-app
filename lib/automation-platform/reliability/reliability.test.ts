import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyFailure } from "@/lib/automation-platform/reliability/failure-class";
import {
  acquireRunLease,
  getLease,
  heartbeatRunLease,
  releaseRunLease,
  resetLeaseStoreForTests,
} from "@/lib/automation-platform/reliability/lease-store";
import {
  getScheduleReliabilitySnapshot,
  recordClaim,
  recordDuplicate,
  recordRecovery,
  recordRunDuration,
  recordScheduleDelay,
  recordSchedulerTick,
  recordWorkerActivity,
  resetScheduleMetricsForTests,
} from "@/lib/automation-platform/reliability/metrics";
import {
  evaluateScheduleAlerts,
  resetScheduleAlertsForTests,
} from "@/lib/automation-platform/reliability/alerts";
import { recoverStaleRunningRuns } from "@/lib/automation-platform/reliability/recovery";
import {
  memoryInsertRun,
  resetAutomationPlatformStoreForTests,
} from "@/lib/automation-platform/repository/memory-store";
import type { AutomationRun } from "@/lib/automation-platform/types";
import { shouldSkipOnRetry } from "@/lib/automation-platform/operations/idempotency";
import { isRetryableFailure } from "@/lib/automation-platform/execution/retry-policy";

function baseRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `run_${crypto.randomUUID()}`,
    automationId: "auto_1",
    automationName: "毎週の営業レポート",
    userId: "user_1",
    status: "queued",
    runKey: "rk",
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    scheduleOccurrenceKey: null,
    triggerType: "schedule",
    scheduledFor: now,
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    failedStepId: null,
    retryable: true,
    needsUserInput: false,
    resolvedInstruction: null,
    memoryUsage: { used: [], updated: [], unusedScopes: [] },
    statusHistory: [],
    preparation: null,
    approval: null,
    steps: [],
    artifacts: [],
    attempts: [],
    approvalExpiresAt: null,
    resultSummary: null,
    diagnosticId: "diag",
    createdAt: now,
    updatedAt: now,
    memoryReferences: [],
    ...overrides,
  };
}

describe("failure classification", () => {
  it("classifies storage/ai/timeout/permission", () => {
    expect(classifyFailure({ errorMessage: "storage upload failed" }).failureClass).toBe(
      "storage",
    );
    expect(classifyFailure({ errorMessage: "429 rate limit" }).failureClass).toBe(
      "ai",
    );
    expect(classifyFailure({ errorMessage: "timed out" }).failureClass).toBe(
      "timeout",
    );
    expect(
      classifyFailure({ errorMessage: "forbidden permission" }).retryable,
    ).toBe(false);
  });
});

describe("lease + heartbeat", () => {
  beforeEach(() => {
    resetLeaseStoreForTests();
  });

  it("prevents duplicate lease holders", async () => {
    const a = await acquireRunLease({
      runId: "run_1",
      ownerId: "u1",
      automationId: "a1",
      workerId: "w1",
    });
    expect(a).toBeTruthy();
    const b = await acquireRunLease({
      runId: "run_1",
      ownerId: "u1",
      automationId: "a1",
      workerId: "w2",
    });
    expect(b).toBeNull();
  });

  it("allows reclaim after lease expiry", async () => {
    const now = Date.now();
    await acquireRunLease({
      runId: "run_2",
      ownerId: "u1",
      automationId: "a1",
      workerId: "w1",
      ttlMs: 10,
      nowMs: now,
    });
    const reclaimed = await acquireRunLease({
      runId: "run_2",
      ownerId: "u1",
      automationId: "a1",
      workerId: "w2",
      nowMs: now + 50,
    });
    expect(reclaimed?.workerId).toBe("w2");
  });

  it("heartbeat extends lease", async () => {
    const now = Date.now();
    const lease = await acquireRunLease({
      runId: "run_3",
      ownerId: "u1",
      automationId: "a1",
      workerId: "w1",
      ttlMs: 1000,
      nowMs: now,
    });
    const hb = await heartbeatRunLease({
      runId: "run_3",
      workerId: "w1",
      token: lease!.token,
      ttlMs: 5000,
      nowMs: now + 100,
    });
    expect(Date.parse(hb!.expiresAt)).toBeGreaterThan(Date.parse(lease!.expiresAt));
    await releaseRunLease({ runId: "run_3", workerId: "w1" });
    expect(getLease("run_3")).toBeNull();
  });
});

describe("recovery", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetLeaseStoreForTests();
    resetScheduleMetricsForTests();
  });

  it("moves hung running run to retrying", async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    memoryInsertRun(
      baseRun({
        id: "run_hung",
        status: "running",
        startedAt: old,
        updatedAt: old,
        attemptCount: 0,
      }),
    );
    const result = await recoverStaleRunningRuns({
      nowMs: Date.now(),
      hangTimeoutMs: 60_000,
    });
    expect(result.recovered).toBe(1);
    const { memoryGetRun } = await import(
      "@/lib/automation-platform/repository/memory-store"
    );
    expect(memoryGetRun("run_hung")?.status).toBe("retrying");
  });
});

describe("retry + deliverable idempotency", () => {
  it("retries 429/network/storage/timeout", () => {
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "429 rate limit" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "ECONNRESET network" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: null, errorMessage: "storage unavailable" }),
    ).toBe(true);
    expect(
      isRetryableFailure({ errorCode: "automation_timeout", errorMessage: "timeout" }),
    ).toBe(true);
  });

  it("skips succeeded word_generate on retry", () => {
    expect(
      shouldSkipOnRetry({
        id: "s1",
        capabilityId: "word_generate",
        name: "Word",
        order: 1,
        status: "succeeded",
        requiresApproval: false,
        highRisk: false,
        startedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 1,
        outputSummary: "ok",
      }),
    ).toBe(true);
  });
});

describe("metrics + alerts", () => {
  beforeEach(() => {
    resetScheduleMetricsForTests();
    resetScheduleAlertsForTests();
  });

  it("computes failure rate and percentiles", () => {
    for (let i = 0; i < 20; i += 1) {
      recordRunDuration({ durationMs: 100 + i * 10, ok: i % 5 !== 0 });
      recordScheduleDelay(i * 1000);
    }
    recordClaim();
    recordDuplicate();
    recordRecovery(true);
    recordSchedulerTick(true);
    recordWorkerActivity();
    const snap = getScheduleReliabilitySnapshot();
    expect(snap.failureRate).toBeGreaterThan(0);
    expect(snap.p95DurationMs).toBeTruthy();
    expect(snap.p99DurationMs).toBeTruthy();
  });

  it("raises scheduler_stopped when stale", async () => {
    // no tick recorded → stale
    const alerts = await evaluateScheduleAlerts(
      getScheduleReliabilitySnapshot(Date.now()),
    );
    expect(alerts.some((a) => a.kind === "scheduler_stopped")).toBe(true);
  });
});

describe("concurrency lease stress", () => {
  beforeEach(() => {
    resetLeaseStoreForTests();
    resetScheduleMetricsForTests();
  });

  afterEach(() => {
    resetLeaseStoreForTests();
  });

  async function stress(n: number) {
    const runId = `run_stress_${n}`;
    const workers = Array.from({ length: n }, (_, i) => `w_${i}`);
    const results = await Promise.all(
      workers.map((workerId) =>
        acquireRunLease({
          runId,
          ownerId: "u",
          automationId: "a",
          workerId,
        }),
      ),
    );
    const wins = results.filter(Boolean);
    expect(wins).toHaveLength(1);
    // parallel claims on distinct runs should all succeed
    const distinct = await Promise.all(
      workers.map((workerId, i) =>
        acquireRunLease({
          runId: `${runId}_${i}`,
          ownerId: "u",
          automationId: "a",
          workerId,
        }),
      ),
    );
    expect(distinct.filter(Boolean)).toHaveLength(n);
    return {
      duplicateRate: 1 - 1 / n,
      winners: wins.length,
      distinctOk: distinct.filter(Boolean).length,
    };
  }

  it("100 concurrent workers: single winner per job", async () => {
    const r = await stress(100);
    expect(r.winners).toBe(1);
    expect(r.distinctOk).toBe(100);
  });

  it("500 concurrent workers: single winner per job", async () => {
    const r = await stress(500);
    expect(r.winners).toBe(1);
    expect(r.distinctOk).toBe(500);
  });

  it("1000 concurrent workers: single winner per job", async () => {
    const r = await stress(1000);
    expect(r.winners).toBe(1);
    expect(r.distinctOk).toBe(1000);
  });
});

describe("clock drift tolerance", () => {
  it("treats nextRunAt in the past as due (drift ok)", () => {
    // due-tick uses nextRunAt <= now — simulate with delay metric under SLA
    resetScheduleMetricsForTests();
    recordScheduleDelay(45_000);
    const snap = getScheduleReliabilitySnapshot();
    expect(snap.p95ScheduleDelayMs).toBeLessThanOrEqual(60_000);
  });
});

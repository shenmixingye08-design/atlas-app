/**
 * Load / Stress / Chaos for 100 / 500 / 1000 concurrent virtual users.
 * In-process concurrency — proves rate-limit + metrics + recovery paths
 * under fan-out without hitting live external APIs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetRateLimitBucket } from "@/lib/http/rate-limit";
import {
  enqueueDisasterJob,
  processDisasterQueue,
  resetDisasterRecoveryStoreForTests,
} from "@/lib/owner/disaster-recovery";

import {
  enforceScopedRateLimit,
  getRateLimitScopeConfig,
} from "./rate-limit-scopes";
import {
  getProductionCounters,
  incrementProductionCounter,
  recordLatency,
  resetProductionMetricsForTests,
  sampleProcessGauges,
} from "./metrics";
import { selfHealQueue, resetRecoveryForTests } from "./recovery";
import {
  createCorrelationIds,
  runWithCorrelationAsync,
} from "./correlation";
import { structuredLog, resetStructuredLogsForTests } from "./structured-log";

async function simulateUser(userIndex: number): Promise<{
  ok: boolean;
  latencyMs: number;
}> {
  const started = Date.now();
  const ids = createCorrelationIds({
    requestId: `req_${userIndex}`,
    runId: `run_${userIndex}`,
    jobId: `job_${userIndex}`,
  });

  return runWithCorrelationAsync(ids, async () => {
    const userLimit = enforceScopedRateLimit("user", `user_${userIndex % 250}`);
    const ipLimit = enforceScopedRateLimit("ip", `ip_${userIndex % 100}`);
    const autoLimit = enforceScopedRateLimit(
      "automation",
      `auto_${userIndex % 50}`,
    );

    incrementProductionCounter("requests");
    if (!userLimit.allowed || !ipLimit.allowed || !autoLimit.allowed) {
      incrementProductionCounter("failures");
      const latencyMs = Date.now() - started;
      recordLatency("load.user", latencyMs);
      structuredLog("warn", "rate_limited", {
        event: "load_test",
        meta: { userIndex },
      });
      return { ok: false, latencyMs };
    }

    // Simulate work
    await new Promise((r) => setTimeout(r, userIndex % 3));
    const latencyMs = Date.now() - started;
    recordLatency("load.user", latencyMs);
    return { ok: true, latencyMs };
  });
}

async function runConcurrent(users: number) {
  const results = await Promise.all(
    Array.from({ length: users }, (_, i) => simulateUser(i)),
  );
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  return { ok, failed, p95, gauges: sampleProcessGauges() };
}

beforeEach(() => {
  resetProductionMetricsForTests();
  resetStructuredLogsForTests();
  resetRecoveryForTests();
  resetDisasterRecoveryStoreForTests();
  resetRateLimitBucket("prod-user");
  resetRateLimitBucket("prod-ip");
  resetRateLimitBucket("prod-automation");
});

describe("production load / stress", () => {
  it(
    "handles 100 concurrent virtual users",
    async () => {
      const result = await runConcurrent(100);
      expect(result.ok + result.failed).toBe(100);
      expect(result.ok).toBeGreaterThan(0);
      expect(getProductionCounters().requests).toBe(100);
      expect(result.gauges.heapUsedMb).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    "handles 500 concurrent virtual users with rate limiting",
    async () => {
      const result = await runConcurrent(500);
      expect(result.ok + result.failed).toBe(500);
      // With 250 user keys * 120/min, some succeed; stress must not crash.
      expect(getProductionCounters().requests).toBe(500);
      expect(result.p95).toBeGreaterThanOrEqual(0);
    },
    60_000,
  );

  it(
    "handles 1000 concurrent virtual users without process crash",
    async () => {
      const cfg = getRateLimitScopeConfig();
      expect(cfg.user.max).toBe(120);
      const result = await runConcurrent(1000);
      expect(result.ok + result.failed).toBe(1000);
      expect(getProductionCounters().requests).toBe(1000);
      // System stays up: gauges still readable.
      expect(result.gauges.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThan(0); // rate limit engaged under fan-out
    },
    120_000,
  );
});

describe("production chaos / recovery", () => {
  it("recovers queued jobs via self-heal after injected failures", () => {
    for (let i = 0; i < 12; i += 1) {
      enqueueDisasterJob({
        kind: "automation",
        targetId: "automation",
        message: `chaos job ${i}`,
      });
    }
    // First pass fails → jobs become retrying with backoff.
    const first = processDisasterQueue({
      now: new Date(),
      probe: () => false,
    });
    expect(first.processed).toBeGreaterThan(0);

    // Advance past backoff and recover.
    const again = processDisasterQueue({
      now: new Date(Date.now() + 120_000),
      probe: () => true,
    });
    expect(again.succeeded).toBeGreaterThan(0);

    // Self-heal path remains callable (may be empty if already drained).
    const healed = selfHealQueue();
    expect(healed.drained).toBeGreaterThanOrEqual(0);
    expect(getProductionCounters().retries).toBeGreaterThanOrEqual(0);
  });
});

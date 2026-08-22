import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TICK_SOFT_DEADLINE_MS,
  TICK_IN_REQUEST_LIMITS,
  TICK_MAX_SOFT_DEADLINE_MS,
  VERCEL_HARD_TIMEOUT_MS,
  buildAutomationTickSummary,
  createTickBudget,
  resolveTickSoftDeadlineMs,
  runTickStage,
} from "./tick-budget";

describe("automation tick budget", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("keeps the soft deadline far below the Vercel 300s kill", () => {
    expect(DEFAULT_TICK_SOFT_DEADLINE_MS).toBeLessThan(60_000);
    expect(TICK_MAX_SOFT_DEADLINE_MS).toBeLessThan(VERCEL_HARD_TIMEOUT_MS);
    expect(TICK_IN_REQUEST_LIMITS.v2Dispatch).toBeLessThanOrEqual(2);
    expect(TICK_IN_REQUEST_LIMITS.v1WorkerClaim).toBeLessThanOrEqual(2);
    expect(TICK_IN_REQUEST_LIMITS.v1WorkerFanOut).toBe(1);
  });

  it("caps an oversized env override so HTTP cannot approach 300s", () => {
    expect(
      resolveTickSoftDeadlineMs({
        ATLAS_AUTOMATION_TICK_SOFT_DEADLINE_MS: "300000",
      }),
    ).toBe(TICK_MAX_SOFT_DEADLINE_MS);
  });

  it("defers a stage when the soft deadline has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00.000Z"));
    const budget = createTickBudget(Date.now());
    vi.setSystemTime(new Date("2026-08-22T00:01:00.000Z"));
    const ran = vi.fn(async () => "ran");
    const result = await runTickStage({
      budget,
      stage: "v2_dispatch",
      run: ran,
    });
    expect(result.deferred).toBe(true);
    expect(result.value).toBeNull();
    expect(ran).not.toHaveBeenCalled();
    expect(budget.deadlineReached()).toBe(true);
    budget.dispose();
  });

  it("records AUTOMATION_TICK_SUMMARY fields without secrets", () => {
    const summary = buildAutomationTickSummary({
      tickId: "tick_test",
      startedAtMs: Date.now() - 20,
      stages: [
        {
          stage: "v2_dispatch",
          durationMs: 12,
          jobId: "job_1",
          automationId: "auto_1",
          success: true,
          failure: false,
          timeout: false,
          abort: false,
        },
      ],
      discoveredJobs: 9,
      claimedJobs: 2,
      completedJobs: 1,
      failedJobs: 0,
      deferredJobs: 7,
      externalCalls: 2,
      deadlineReached: true,
      schemaErrors: ["atlas_automation_jobs:PGRST205"],
    });
    expect(summary.tickId).toBe("tick_test");
    expect(summary.slowestStage).toBe("v2_dispatch");
    expect(summary.slowestStageDurationMs).toBe(12);
    expect(summary.deferredJobs).toBe(7);
    expect(summary.deadlineReached).toBe(true);
    expect(summary.schemaErrors[0]).toContain("atlas_automation_jobs");
    expect(JSON.stringify(summary)).not.toMatch(/Bearer |api_key=/i);
  });
});

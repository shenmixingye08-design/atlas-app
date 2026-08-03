import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import { resetWorkQueueStoreForTests } from "@/lib/work-queue/store";
import { getWorkQueueStore } from "@/lib/work-queue/store";

import { resetSchedulerCoreStoreForTests } from "../durable";
import { buildSchedulerOpsSnapshot } from "./production-ops";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
}));

describe("scheduler production ops (phase 2-5)", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    vi.stubEnv("ATLAS_SCHEDULER_CORE_FORCE_FILE", "true");
    vi.stubEnv("SCHEDULER_CRON_SECRET", "ops-test-secret-value-32chars!!");
    vi.stubEnv("ENABLE_SCHEDULED_CRON", "true");
    vi.stubEnv("VERCEL_ENV", "development");
    const core = resetSchedulerCoreStoreForTests();
    await core.resetForTests();
    const wq = resetWorkQueueStoreForTests();
    await wq.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ops snapshot exposes Health + Metrics fields from live stores", async () => {
    const wq = getWorkQueueStore();
    await wq.recordScheduleDelay(10);
    await wq.recordScheduleDelay(20);
    await wq.recordScheduleDelay(100);
    await wq.recordSchedulerSuccess(new Date().toISOString());
    await wq.recordRecovery(true);

    const ops = await buildSchedulerOpsSnapshot();
    expect(ops.phase).toBe("2-5");
    expect(ops.health).toMatchObject({
      running: expect.any(Boolean),
      healthy: expect.any(Boolean),
    });
    expect(ops.metrics.p50DelayMs).toBeTypeOf("number");
    expect(ops.metrics.p90DelayMs).toBeTypeOf("number");
    expect(ops.metrics.p95DelayMs).toBeTypeOf("number");
    expect(ops.metrics.p99DelayMs).toBeTypeOf("number");
    expect(ops.metrics.recoveryCount).toBeGreaterThanOrEqual(1);
    expect(ops.sections).toEqual({
      scheduler: true,
      queue: true,
      worker: true,
      automation: true,
      health: true,
    });
    expect(ops.killSwitches.schedulerSecretConfigured).toBe(true);
  });

  it("emits duplicate / p95 / miss-related alerts when induced", async () => {
    const wq = getWorkQueueStore();
    // Force duplicate count via enqueue twice same occurrence
    const input = {
      ownerId: "ops",
      automationId: "a1",
      occurrenceKey: "occ:a1:UTC:202001010900",
      scheduledAt: "2020-01-01T09:00:00.000Z",
      payload: { kind: "fixture" as const, offlineArtifacts: true },
      steps: [{ stepId: "s1", stepType: "fixture_work" as const }],
    };
    await wq.enqueue(input);
    await wq.enqueue(input);
    for (let i = 0; i < 3; i += 1) await wq.recordScheduleDelay(150_000);

    const alerts = await evaluateWorkQueueAlerts();
    const codes = alerts.map((a) => a.code);
    expect(codes).toContain("duplicate_detected");
    expect(codes).toContain("p95_delay_exceeded");
  });
});

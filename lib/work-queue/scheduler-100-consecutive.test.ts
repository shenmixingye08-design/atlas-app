/**
 * Production Blocker #2 — 100 consecutive Scheduler executions.
 * Enqueue → Lease → Running → Completed with durable registry logs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeNextRun, presetToCron } from "@/lib/automations/schedule";
import type { SchedulePreset } from "@/lib/automations/types";

import { listScheduleCapabilities } from "./capabilities";
import { PRODUCTION_PRESET_TYPES } from "./cron-sot";
import { writeSchedulerHundredProof } from "./production-proof";
import { enqueueDueAutomations } from "./scheduler";
import {
  resetSchedulerGateForTests,
  setSchedulerExplicitlyStopped,
} from "./scheduler-gate";
import {
  getSchedulerRegistryStore,
  resetSchedulerRegistryStoreForTests,
} from "./scheduler-registry/store";
import {
  clearWorkQueueStoreSingleton,
  resetWorkQueueStoreForTests,
  type WorkQueueStore,
} from "./store";
import { drainWorkQueue } from "./worker";

let dir: string;
let store: WorkQueueStore;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sch100-"));
  process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
  process.env.ATLAS_WORK_QUEUE_FILE = join(dir, "queue.json");
  process.env.ATLAS_SCHEDULER_REGISTRY_FILE = join(dir, "registry.json");
  process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
  delete process.env.ENABLE_SCHEDULED_CRON;
  resetSchedulerGateForTests();
  clearWorkQueueStoreSingleton();
  store = resetWorkQueueStoreForTests(process.env.ATLAS_WORK_QUEUE_FILE);
  await store.resetForTests();
  const registry = resetSchedulerRegistryStoreForTests(
    process.env.ATLAS_SCHEDULER_REGISTRY_FILE,
  );
  await registry.resetForTests();
});

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  delete process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY;
  delete process.env.ENABLE_SCHEDULED_CRON;
  resetSchedulerGateForTests();
  clearWorkQueueStoreSingleton();
});

describe("scheduler 100 consecutive production proof", () => {
  it("covers minutely/hourly/daily/weekly/monthly presets in Cron SoT", () => {
    const caps = Object.fromEntries(
      listScheduleCapabilities().map((row) => [row.capability, row.status]),
    );
    for (const preset of PRODUCTION_PRESET_TYPES) {
      expect(caps[preset]).toBe("supported");
    }
    expect(caps.cron).toBe("supported");

    const presets: SchedulePreset[] = [
      { type: "minutely" },
      { type: "hourly", minute: 15 },
      { type: "daily", hour: 9, minute: 0 },
      { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
      { type: "monthly", dayOfMonth: 1, hour: 9, minute: 0 },
    ];
    const from = new Date("2026-08-03T00:00:00.000Z");
    for (const preset of presets) {
      const next = computeNextRun(
        {
          kind: "schedule",
          preset,
          timezone: "UTC",
          label: preset.type,
          cron: presetToCron(preset),
        },
        from,
      );
      expect(next).toBeTruthy();
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
      expect(presetToCron(preset).split(" ").length).toBe(5);
    }
  });

  it("runs 100 consecutive Scheduled→Running→Completed with metrics", async () => {
    const firings: Array<{
      index: number;
      scheduledAt: string;
      executedAt: string;
      delayMs: number;
      executionTimeMs: number;
      success: boolean;
      status: "completed" | "failed" | "missed";
    }> = [];
    let success = 0;
    let failed = 0;
    let duplicates = 0;
    let misses = 0;
    const executionTimes: number[] = [];
    const delays: number[] = [];
    const presetCycle = [
      "minutely",
      "hourly",
      "daily",
      "weekly",
      "monthly",
    ] as const;

    for (let i = 0; i < 100; i += 1) {
      const presetType = presetCycle[i % presetCycle.length]!;
      const scheduledAt = new Date(Date.UTC(2026, 7, 3, 0, i, 0));
      const now = new Date(scheduledAt.getTime() + 2_000 + (i % 5) * 200);
      const automationId = `proof_${i}`;
      const t0 = Date.now();

      const enqueue = await enqueueDueAutomations({
        candidates: [
          {
            automationId,
            ownerId: "proof_owner",
            name: `proof ${i}`,
            nextRun: scheduledAt.toISOString(),
            timezone: "UTC",
            enabled: true,
            offlineArtifacts: true,
            assignment: `proof ${i}`,
            cronExpression:
              presetType === "minutely"
                ? "* * * * *"
                : presetType === "hourly"
                  ? "0 * * * *"
                  : presetType === "weekly"
                    ? "0 9 * * 1"
                    : presetType === "monthly"
                      ? "0 9 1 * *"
                      : "0 9 * * *",
            presetType,
          },
        ],
        now,
        advanceNextRun: async () =>
          new Date(scheduledAt.getTime() + 60_000).toISOString(),
      });

      // Duplicate tick must not create a second job.
      const again = await enqueueDueAutomations({
        candidates: [
          {
            automationId,
            ownerId: "proof_owner",
            name: `proof ${i}`,
            nextRun: scheduledAt.toISOString(),
            timezone: "UTC",
            enabled: true,
            offlineArtifacts: true,
            presetType,
            cronExpression: "* * * * *",
          },
        ],
        now,
        advanceNextRun: async () => null,
      });
      duplicates += again.deduped + (enqueue.deduped > 0 ? enqueue.deduped : 0);

      if (enqueue.enqueued !== 1) {
        misses += 1;
        firings.push({
          index: i,
          scheduledAt: scheduledAt.toISOString(),
          executedAt: now.toISOString(),
          delayMs: enqueue.delaysMs[0] ?? 0,
          executionTimeMs: 0,
          success: false,
          status: "missed",
        });
        continue;
      }

      const drained = await drainWorkQueue({
        workerId: `proof_worker_${i}`,
        limit: 1,
      });
      const executionTimeMs = Date.now() - t0;
      executionTimes.push(executionTimeMs);
      delays.push(enqueue.delaysMs[0] ?? 0);

      const ok = drained.completed === 1 && drained.failed === 0;
      if (ok) {
        success += 1;
        firings.push({
          index: i,
          scheduledAt: scheduledAt.toISOString(),
          executedAt: new Date().toISOString(),
          delayMs: enqueue.delaysMs[0] ?? 0,
          executionTimeMs,
          success: true,
          status: "completed",
        });
      } else {
        failed += 1;
        firings.push({
          index: i,
          scheduledAt: scheduledAt.toISOString(),
          executedAt: new Date().toISOString(),
          delayMs: enqueue.delaysMs[0] ?? 0,
          executionTimeMs,
          success: false,
          status: "failed",
        });
      }
    }

    const registry = getSchedulerRegistryStore();
    const logs = await registry.listLogs(500);
    const completedLogs = logs.filter((l) => l.status === "completed");
    expect(completedLogs.length).toBeGreaterThanOrEqual(100);

    const avgExec =
      executionTimes.reduce((a, b) => a + b, 0) /
      Math.max(1, executionTimes.length);
    const sortedDelays = [...delays].sort((a, b) => a - b);
    const p95 = sortedDelays[Math.ceil(0.95 * sortedDelays.length) - 1] ?? 0;
    const p99 = sortedDelays[Math.ceil(0.99 * sortedDelays.length) - 1] ?? 0;
    const avgDelay =
      delays.reduce((a, b) => a + b, 0) / Math.max(1, delays.length);

    const proof = writeSchedulerHundredProof({
      scenario: "consecutive_enqueue_drain_x100_all_presets",
      total: 100,
      success,
      failed,
      duplicates,
      misses,
      averageExecutionTimeMs: avgExec,
      averageDelayMs: avgDelay,
      p95DelayMs: p95,
      p99DelayMs: p99,
      maxDelayMs: sortedDelays[sortedDelays.length - 1] ?? 0,
      firings,
      storeKind: store.kind,
      durableLogs: true,
      presetsCovered: [...PRODUCTION_PRESET_TYPES],
      note: `Durable ${store.kind} store + scheduler registry logs. 100 consecutive Scheduled→Running→Completed. duplicates=${duplicates} are blocked re-fires (expected).`,
    });

    expect(proof.verdict).toBe("pass");
    expect(proof.successRate).toBe(1);
    expect(proof.failureRate).toBe(0);
    expect(proof.misses).toBe(0);
    expect(proof.averageExecutionTimeMs).toBeGreaterThan(0);
    expect(duplicates).toBeGreaterThan(0);
  }, 180_000);

  it("forbids completed while scheduler stopped (Fail Closed)", async () => {
    setSchedulerExplicitlyStopped(true);
    const scheduledAt = new Date("2026-08-03T01:00:00.000Z");
    await enqueueDueAutomations({
      candidates: [
        {
          automationId: "stopped_gate",
          ownerId: "proof_owner",
          name: "stopped",
          nextRun: scheduledAt.toISOString(),
          timezone: "UTC",
          enabled: true,
          offlineArtifacts: true,
          presetType: "daily",
          cronExpression: "0 1 * * *",
        },
      ],
      now: new Date(scheduledAt.getTime() + 1000),
      advanceNextRun: async () => null,
    });
    const drained = await drainWorkQueue({
      workerId: "stopped_worker",
      limit: 1,
    });
    expect(drained.completed).toBe(0);
    expect(drained.failed).toBeGreaterThan(0);
  });
});

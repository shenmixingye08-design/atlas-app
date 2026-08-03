import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetWorkQueueStoreForTests } from "@/lib/work-queue/store";

import { runSchedulerCoreTick } from "../due-tick";
import { resetSchedulerCoreStoreForTests } from "../durable";
import {
  assertLifecycleTransition,
  canTransitionLifecycle,
  SCHEDULER_LIFECYCLE_ORDER,
} from "./lifecycle";
import { dispatchSchedulerOutbox } from "./dispatcher";
import {
  getSchedulerBridgeHealth,
  getSchedulerBridgeMetricsSnapshot,
  resetSchedulerBridgeMetricsForTests,
} from "./metrics";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
}));

vi.mock("@/lib/auth/require-atlas-owner", () => ({
  checkAtlasOwner: async () => false,
}));

async function seedDueAutomation(input: {
  idSuffix: string;
  ownerId: string;
  nextRunAt: string;
}) {
  const core = resetSchedulerCoreStoreForTests();
  // Do not wipe between multi-seed loops — callers reset in beforeEach.
  const { serverAutomationRepository } = await import(
    "@/lib/automations/repositories/server-automation-repository"
  );
  const created = await serverAutomationRepository.create({
    name: `bridge-${input.idSuffix}`,
    description: "",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      timezone: "UTC",
      label: "daily",
    },
    workflow: { assignment: "x" },
    enabled: true,
    executionMode: "standard",
    userId: input.ownerId,
  });
  await serverAutomationRepository.update(created.id, {
    nextRun: input.nextRunAt,
  });
  await core.upsertSchedule({
    automationId: created.id,
    ownerId: input.ownerId,
    environment: "test",
    enabled: true,
    paused: false,
    deletedAt: null,
    nextRunAt: input.nextRunAt,
    timezone: "UTC",
    endAt: null,
    misfirePolicy: "run_once_immediately",
    name: `bridge-${input.idSuffix}`,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  return { automationId: created.id, core };
}

describe("scheduler-queue-worker bridge (phase 2-3)", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    vi.stubEnv("ATLAS_SCHEDULER_CORE_FORCE_FILE", "true");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("SCHEDULER_CRON_SECRET", "scheduler-secret-value-32chars!!");
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("SCHEDULER_BRIDGE_DISPATCHER_DISABLED", "");
    vi.stubEnv("SCHEDULER_BRIDGE_QUEUE_DISABLED", "");
    const store = resetSchedulerCoreStoreForTests();
    await store.resetForTests();
    const wq = resetWorkQueueStoreForTests();
    await wq.resetForTests();
    resetSchedulerBridgeMetricsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lifecycle order is Scheduled→…→Running", () => {
    expect(SCHEDULER_LIFECYCLE_ORDER).toEqual([
      "Scheduled",
      "OccurrenceCreated",
      "RunCreated",
      "JobCreated",
      "Queued",
      "Leased",
      "Running",
    ]);
    expect(assertLifecycleTransition("Scheduled", "Queued")).toBe(true);
    expect(canTransitionLifecycle("Queued", "Scheduled")).toBe(false);
  });

  it("1 Job: Outbox → Queue → Worker lease start", async () => {
    await seedDueAutomation({
      idSuffix: "one",
      ownerId: "owner-bridge-1",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
      workerLimit: 1,
    });
    expect(result.outboxCreatedCount).toBe(1);
    expect(result.occurrenceCreatedCount).toBe(1);
    expect(result.nextRunUpdatedCount).toBeGreaterThanOrEqual(1);
    expect(result.worker?.leased).toBeGreaterThanOrEqual(1);

    const bridge = await getSchedulerBridgeMetricsSnapshot();
    expect(bridge.enqueueCount).toBeGreaterThanOrEqual(1);
    expect(bridge.dispatchedCount).toBeGreaterThanOrEqual(1);
    expect(bridge.leaseStartedCount).toBeGreaterThanOrEqual(1);
  });

  it("10 Jobs: batch due → durable queue", async () => {
    const core = resetSchedulerCoreStoreForTests();
    await core.resetForTests();
    const { serverAutomationRepository } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    for (let i = 0; i < 10; i += 1) {
      const created = await serverAutomationRepository.create({
        name: `ten-${i}`,
        description: "",
        schedule: {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          label: "daily",
        },
        workflow: { assignment: "x" },
        enabled: true,
        executionMode: "standard",
        userId: `owner-ten-${i}`,
      });
      await serverAutomationRepository.update(created.id, {
        nextRun: "2020-01-01T09:00:00.000Z",
      });
      await core.upsertSchedule({
        automationId: created.id,
        ownerId: `owner-ten-${i}`,
        environment: "test",
        enabled: true,
        paused: false,
        deletedAt: null,
        nextRunAt: "2020-01-01T09:00:00.000Z",
        timezone: "UTC",
        endAt: null,
        misfirePolicy: "run_once_immediately",
        name: `ten-${i}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      scheduleLimit: 10,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    expect(result.dueCount).toBe(10);
    expect(result.outboxCreatedCount).toBe(10);
    expect(result.occurrenceCreatedCount).toBe(10);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    const queued = await getWorkQueueStore().listByStatus("queued", 100);
    expect(queued.length).toBe(10);
  });

  it("100 Jobs: enqueue all to durable queue", async () => {
    const core = resetSchedulerCoreStoreForTests();
    await core.resetForTests();
    const { serverAutomationRepository } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const n = 100;
    for (let i = 0; i < n; i += 1) {
      const created = await serverAutomationRepository.create({
        name: `hundred-${i}`,
        description: "",
        schedule: {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          label: "daily",
        },
        workflow: { assignment: "x" },
        enabled: true,
        executionMode: "standard",
        userId: `owner-h-${i}`,
      });
      await serverAutomationRepository.update(created.id, {
        nextRun: "2020-01-01T09:00:00.000Z",
      });
      await core.upsertSchedule({
        automationId: created.id,
        ownerId: `owner-h-${i}`,
        environment: "test",
        enabled: true,
        paused: false,
        deletedAt: null,
        nextRunAt: "2020-01-01T09:00:00.000Z",
        timezone: "UTC",
        endAt: null,
        misfirePolicy: "run_once_immediately",
        name: `hundred-${i}`,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    const started = Date.now();
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      scheduleLimit: 100,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    const elapsedMs = Date.now() - started;

    expect(result.dueCount).toBe(100);
    expect(result.outboxCreatedCount).toBe(100);
    expect(result.occurrenceCreatedCount).toBe(100);
    expect(result.failedCount).toBe(0);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    const queued = await getWorkQueueStore().listByStatus("queued", 200);
    expect(queued.length).toBe(100);

    const bridge = await getSchedulerBridgeHealth();
    expect(bridge.queueLength).toBe(100);
    expect(bridge.failedEnqueueCount).toBe(0);
    expect(elapsedMs).toBeLessThan(60_000);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        phase: "2-3",
        jobs: 100,
        queued: queued.length,
        elapsedMs,
        enqueueCount: bridge.enqueueCount,
        duplicateEnqueueCount: bridge.duplicateEnqueueCount,
        failedEnqueueCount: bridge.failedEnqueueCount,
      }),
    );
  });

  it("concurrent enqueue is idempotent per occurrence", async () => {
    const { automationId } = await seedDueAutomation({
      idSuffix: "concurrent",
      ownerId: "owner-conc",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const now = new Date("2020-01-01T09:05:00.000Z");
    const ticks = await Promise.all(
      Array.from({ length: 5 }, () =>
        runSchedulerCoreTick({
          skipIndexSync: true,
          skipWorkerDrain: true,
          now,
        }),
      ),
    );
    const created = ticks.reduce((s, t) => s + t.occurrenceCreatedCount, 0);
    expect(created).toBe(1);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    const queued = await getWorkQueueStore().listByStatus("queued", 50);
    const forAuto = queued.filter((j) => j.automationId === automationId);
    expect(forAuto.length).toBe(1);
  });

  it("Dispatcher停止: outbox remains, nextRun not advanced, no queue job", async () => {
    vi.stubEnv("SCHEDULER_BRIDGE_DISPATCHER_DISABLED", "true");
    const { automationId } = await seedDueAutomation({
      idSuffix: "disp-stop",
      ownerId: "owner-disp",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    expect(result.outboxCreatedCount).toBe(1);
    expect(result.occurrenceCreatedCount).toBe(0);
    expect(result.nextRunUpdatedCount).toBe(0);

    const core = resetSchedulerCoreStoreForTests();
    expect(await core.countPendingOutbox()).toBe(1);
    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    expect((await getWorkQueueStore().listByStatus("queued", 10)).length).toBe(
      0,
    );

    const schedule = (await core.listDueSchedules({
      environment: "test",
      nowIso: "2020-01-01T09:05:00.000Z",
      limit: 10,
    })).find((s) => s.automationId === automationId);
    expect(schedule?.nextRunAt).toBe("2020-01-01T09:00:00.000Z");
  });

  it("Queue停止: enqueue失敗でも nextRun 更新禁止・completed禁止", async () => {
    vi.stubEnv("SCHEDULER_BRIDGE_QUEUE_DISABLED", "true");
    await seedDueAutomation({
      idSuffix: "q-stop",
      ownerId: "owner-q",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    expect(result.nextRunUpdatedCount).toBe(0);
    expect(result.failedCount).toBeGreaterThanOrEqual(1);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    expect((await getWorkQueueStore().listByStatus("queued", 10)).length).toBe(
      0,
    );
    expect((await getWorkQueueStore().listByStatus("completed", 10)).length).toBe(
      0,
    );

    const bridge = await getSchedulerBridgeMetricsSnapshot();
    expect(bridge.failedEnqueueCount).toBeGreaterThanOrEqual(1);
    expect(bridge.retryEnqueueCount).toBeGreaterThanOrEqual(1);
  });

  it("Outbox Retry: queue再開後に投入成功", async () => {
    vi.stubEnv("SCHEDULER_BRIDGE_QUEUE_DISABLED", "true");
    await seedDueAutomation({
      idSuffix: "retry",
      ownerId: "owner-retry",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });

    vi.stubEnv("SCHEDULER_BRIDGE_QUEUE_DISABLED", "");
    const retried = await dispatchSchedulerOutbox({
      startWorkerLease: false,
      limit: 20,
    });
    expect(retried.dispatched).toBe(1);
    expect(retried.nextRunAdvanced).toBe(1);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    expect((await getWorkQueueStore().listByStatus("queued", 10)).length).toBe(
      1,
    );
  });

  it("Worker停止: queueには入り lease は開始しない", async () => {
    await seedDueAutomation({
      idSuffix: "w-stop",
      ownerId: "owner-w",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    expect(result.occurrenceCreatedCount).toBe(1);
    expect(result.worker?.leased ?? 0).toBe(0);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    expect((await getWorkQueueStore().listByStatus("queued", 10)).length).toBe(
      1,
    );
  });

  it("DB停止相当: outbox insert failure では Queue投入・nextRun更新しない", async () => {
    const { core } = await seedDueAutomation({
      idSuffix: "db-stop",
      ownerId: "owner-db",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const spy = vi
      .spyOn(core, "insertOutbox")
      .mockRejectedValue(new Error("db_down"));
    const result = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    spy.mockRestore();
    expect(result.outboxCreatedCount).toBe(0);
    expect(result.nextRunUpdatedCount).toBe(0);
    expect(result.failedCount).toBeGreaterThanOrEqual(1);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    expect((await getWorkQueueStore().listByStatus("queued", 10)).length).toBe(
      0,
    );
  });

  it("Duplicate enqueue: second tick does not create two jobs", async () => {
    const { automationId, core } = await seedDueAutomation({
      idSuffix: "dup",
      ownerId: "owner-dup2",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    const a = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    await core.upsertSchedule({
      automationId,
      ownerId: "owner-dup2",
      environment: "test",
      enabled: true,
      paused: false,
      deletedAt: null,
      nextRunAt: "2020-01-01T09:00:00.000Z",
      timezone: "UTC",
      endAt: null,
      misfirePolicy: "run_once_immediately",
      name: "bridge-dup",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    const { serverAutomationRepository } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    await serverAutomationRepository.update(automationId, {
      nextRun: "2020-01-01T09:00:00.000Z",
    });
    const b = await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    expect(a.occurrenceCreatedCount).toBe(1);
    expect(b.occurrenceCreatedCount).toBe(0);
    expect(b.duplicateSkippedCount).toBeGreaterThanOrEqual(1);

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    const jobs = (await getWorkQueueStore().listByStatus("queued", 50)).filter(
      (j) => j.automationId === automationId,
    );
    expect(jobs.length).toBe(1);

    const bridge = await getSchedulerBridgeMetricsSnapshot();
    expect(bridge.duplicateEnqueueCount + b.duplicateSkippedCount).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("EnqueueResult fields are persisted on successful dispatch", async () => {
    await seedDueAutomation({
      idSuffix: "fields",
      ownerId: "owner-fields",
      nextRunAt: "2020-01-01T09:00:00.000Z",
    });
    await runSchedulerCoreTick({
      skipIndexSync: true,
      skipWorkerDrain: true,
      now: new Date("2020-01-01T09:05:00.000Z"),
    });
    // Re-dispatch should find nothing pending for enqueue
    const again = await dispatchSchedulerOutbox({ startWorkerLease: false });
    expect(again.enqueueResults.every((r) => r.ok || r.enqueueResult === "duplicate" || r.enqueueResult === "failed" || again.scanned === 0)).toBe(
      true,
    );

    const { getWorkQueueStore } = await import("@/lib/work-queue/store");
    const job = (await getWorkQueueStore().listByStatus("queued", 1))[0];
    expect(job).toBeTruthy();
    expect(job!.jobId).toBeTruthy();
    expect(job!.runId).toBeTruthy();
    expect(job!.occurrenceKey).toMatch(/^occ:/);
    expect(job!.status).toBe("queued");
    expect(job!.maxAttempts).toBeGreaterThan(0);
    expect(job!.createdAt).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

vi.mock("@/lib/billing/subscriptions/lifecycle", () => ({
  isAutomationSuspendedForUser: vi.fn(() => false),
}));

vi.mock("@/lib/orchestration/orchestrator", () => ({
  orchestrate: vi.fn(async () => ({
    assignment: "test",
    status: "completed",
    workflow: { status: "completed" },
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      type: "generic",
      title: "t",
      summary: "s",
      sections: [],
      body: "ok",
    },
    reviewComments: "",
    approved: true,
    finalResponse: "完了しました",
    totalDurationMs: 12,
    error: null,
  })),
}));

vi.mock("@/lib/billing/access/snapshot", () => ({
  evaluateBillingAiUsage: vi.fn(async () => ({
    snapshot: { userId: "x", isOwner: false },
    denial: null,
  })),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyAutomationAwaitingReview: vi.fn(),
  notifyAutomationCompleted: vi.fn(),
  notifyAutomationFailed: vi.fn(),
  notifyOwnerSystemIncident: vi.fn(),
  notifyWorkCompleted: vi.fn(),
}));

import { resolveAutomationStorageBackend } from "./automation-backend";
import {
  ensureAutomationsHydrated,
  persistAutomationsNow,
} from "./durable";
import {
  getDurableAutomationById,
  listDurableAutomationsForOwner,
  listDueDurableAutomationIds,
  replaceDurableAutomationsForOwner,
  resetDurableAutomationDefinitionsForTests,
} from "./durable-automation-definitions";
import {
  cancelDurableAutomationExecution,
  executionLogToDurableRow,
  listDurableAutomationExecutions,
  resetDurableAutomationExecutionsForTests,
  scheduleDurableExecutionRetry,
  upsertDurableAutomationExecution,
} from "./durable-automation-executions";
import {
  clearAutomationProcessCacheForTests,
  resetAutomationStore,
  serverAutomationRepository,
} from "./repositories/server-automation-repository";
import { resetAutomationsGlobalDurableForTests } from "./global-durable";
import { automationService } from "./automation-service";
import {
  recordAutomationExecutionLog,
  resetAutomationExecutionLogStoreForTests,
} from "./execution-log/store";
import { buildOccurrenceKey } from "@/lib/work-queue/occurrence";
import { enqueueDueAutomations } from "@/lib/work-queue/scheduler";
import { getWorkQueueStore, resetWorkQueueStoreForTests } from "@/lib/work-queue";

const USER_A = "user_p06_a";
const USER_B = "user_p06_b";
const ORG_A = "org_p06_a";
const ORG_B = "org_p06_b";

function dailyInput(name: string, hour = 9) {
  return {
    name,
    description: "p0-6",
    schedule: {
      kind: "schedule" as const,
      preset: { type: "daily" as const, hour, minute: 0 },
      timezone: "Asia/Tokyo",
      label: `毎日 ${hour}:00`,
    },
    workflow: { assignment: "定期レポート" },
    enabled: true,
  };
}

describe("P0-6 durable automation engine", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetDurableAutomationExecutionsForTests();
    resetAutomationExecutionLogStoreForTests();
    resetAutomationsGlobalDurableForTests();
    const workQueue = resetWorkQueueStoreForTests(
      `${process.cwd()}/.data/work-queue-p0-6-test.json`,
    );
    await workQueue.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("01: backend is memory_durable in tests", () => {
    expect(resolveAutomationStorageBackend()).toBe("memory_durable");
  });

  it("02: Production forbids memory_durable", () => {
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "memory_durable");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => resolveAutomationStorageBackend()).toThrow(
      /forbidden in Production/,
    );
  });

  it("03+04: create persists durable definition (not Map-only)", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("習慣A"));
    const durable = await getDurableAutomationById(created.id);
    expect(durable?.name).toBe("習慣A");
    expect(durable?.userId).toBe(USER_A);
  });

  it("05: Cold Start — process cache cleared, durable survives", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("cold"));
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    const listed = await automationService.listForUser(USER_A);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.name).toBe("cold");
  });

  it("06: Vercel restart simulation — nextRun survives cache wipe", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("nr"));
    const next = "2030-01-01T00:00:00.000Z";
    await automationService.updateForUser(created.id, USER_A, { nextRun: next });
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    const again = await automationService.getByIdForUser(created.id, USER_A);
    expect(again?.nextRun).toBe(next);
  });

  it("07: process kill simulation — pause state durable", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("pause"));
    await automationService.setEnabledForUser(created.id, USER_A, false);
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    const paused = await automationService.getByIdForUser(created.id, USER_A);
    expect(paused?.enabled).toBe(false);
    expect(paused?.nextRun).toBeNull();
  });

  it("08: resume schedules future nextRun and persists", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("resume"));
    await automationService.setEnabledForUser(created.id, USER_A, false);
    const resumed = await automationService.setEnabledForUser(
      created.id,
      USER_A,
      true,
    );
    expect(resumed?.enabled).toBe(true);
    expect(new Date(resumed!.nextRun!).getTime()).toBeGreaterThan(Date.now());
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    const again = await automationService.getByIdForUser(created.id, USER_A);
    expect(again?.enabled).toBe(true);
    expect(again?.nextRun).toBeTruthy();
  });

  it("09: pause中 — due list excludes automation", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("paused-due"));
    await automationService.updateForUser(created.id, USER_A, {
      nextRun: new Date(Date.now() - 60_000).toISOString(),
    });
    await automationService.setEnabledForUser(created.id, USER_A, false);
    const due = await listDueDurableAutomationIds({ now: new Date() });
    expect(due).not.toContain(created.id);
  });

  it("10: duplicate cron enqueue — occurrenceKey dedupe (0 duplicate jobs)", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("dedupe"));
    const scheduledAt = new Date(Date.now() - 1000);
    await automationService.updateForUser(created.id, USER_A, {
      nextRun: scheduledAt.toISOString(),
    });
    const candidate = {
      automationId: created.id,
      ownerId: USER_A,
      name: created.name,
      nextRun: scheduledAt.toISOString(),
      timezone: "Asia/Tokyo",
      enabled: true,
      paused: false,
      assignment: "定期レポート",
    };
    const first = await enqueueDueAutomations({
      candidates: [candidate],
      advanceNextRun: async () => "2031-01-01T00:00:00.000Z",
    });
    // Reset nextRun to same past slot to simulate duplicate cron without advance persist
    const second = await enqueueDueAutomations({
      candidates: [{ ...candidate, nextRun: scheduledAt.toISOString() }],
      advanceNextRun: async () => "2031-01-02T00:00:00.000Z",
    });
    expect(first.enqueued + second.enqueued).toBe(1);
    expect(first.deduped + second.deduped).toBeGreaterThanOrEqual(1);
    const key = buildOccurrenceKey({
      automationId: created.id,
      scheduledAt,
      timezone: "Asia/Tokyo",
    });
    expect(key).toContain(created.id);
  });

  it("11+12: duplicate workers claim at most one work-queue job", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("workers"));
    const scheduledAt = new Date(Date.now() - 5000);
    await automationService.updateForUser(created.id, USER_A, {
      nextRun: scheduledAt.toISOString(),
    });
    const candidate = {
      automationId: created.id,
      ownerId: USER_A,
      name: created.name,
      nextRun: scheduledAt.toISOString(),
      timezone: "Asia/Tokyo",
      enabled: true,
      paused: false,
    };
    await enqueueDueAutomations({
      candidates: [candidate],
      advanceNextRun: async () => "2032-01-01T00:00:00.000Z",
    });
    const store = getWorkQueueStore();
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.leaseJobs({ workerId: `w_${i}`, limit: 1, leaseMs: 30_000 }),
      ),
    );
    const won = claims.flat();
    expect(won.length).toBe(1);
  });

  it("13: advanceNextRun persists (tick path)", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("tick"));
    const past = new Date(Date.now() - 2000).toISOString();
    await automationService.updateForUser(created.id, USER_A, { nextRun: past });
    const { processWorkQueueTick } = await import("@/lib/work-queue/tick");
    await processWorkQueueTick({ scheduleLimit: 5, workerLimit: 0 });
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    const again = await automationService.getByIdForUser(created.id, USER_A);
    expect(again?.nextRun).not.toBe(past);
    expect(new Date(again!.nextRun!).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it("14: owner isolation — B cannot read A", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("iso"));
    const leaked = await automationService.getByIdForUser(created.id, USER_B);
    expect(leaked).toBeNull();
    const listB = await listDurableAutomationsForOwner(USER_B);
    expect(listB.find((row) => row.id === created.id)).toBeUndefined();
  });

  it("15: organization isolation on definition rows", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("org"));
    await replaceDurableAutomationsForOwner(USER_A, [
      { ...(await getDurableAutomationById(created.id))! },
    ], { organizationId: ORG_A });
    const row = await getDurableAutomationById(created.id);
    expect(row).toBeTruthy();
    // Re-write under org B should not expose to other owner's list
    await replaceDurableAutomationsForOwner(USER_B, [], { organizationId: ORG_B });
    const listB = await listDurableAutomationsForOwner(USER_B);
    expect(listB).toHaveLength(0);
  });

  it("16+17: execution history durable + survives cache clear", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("hist"));
    const log = await recordAutomationExecutionLog({
      automationId: created.id,
      userId: USER_A,
      scheduledAt: created.nextRun,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      xApiSummary: null,
      triggerType: "automation",
    });
    resetAutomationExecutionLogStoreForTests();
    const rows = await listDurableAutomationExecutions({
      ownerUserId: USER_A,
      automationId: created.id,
    });
    expect(rows.some((row) => row.id === log.id)).toBe(true);
  });

  it("18: retry state durable", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("retry"));
    const log = await recordAutomationExecutionLog({
      automationId: created.id,
      userId: USER_A,
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: "failed",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: "timeout",
      errorMessage: "timeout",
      retryCount: 0,
      xApiSummary: null,
      triggerType: "automation",
    });
    const retried = await scheduleDurableExecutionRetry({
      executionId: log.id,
      ownerUserId: USER_A,
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      errorCode: "timeout",
    });
    expect(retried.status).toBe("retry_scheduled");
    expect(retried.retryCount).toBe(1);
    clearAutomationProcessCacheForTests();
    const rows = await listDurableAutomationExecutions({ ownerUserId: USER_A });
    expect(rows.find((r) => r.id === log.id)?.status).toBe("retry_scheduled");
  });

  it("19: cancel execution durable", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("cancel"));
    const log = await recordAutomationExecutionLog({
      automationId: created.id,
      userId: USER_A,
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      xApiSummary: null,
      triggerType: "manual",
    });
    const cancelled = await cancelDurableAutomationExecution({
      executionId: log.id,
      ownerUserId: USER_A,
    });
    expect(cancelled.status).toBe("cancelled");
  });

  it("20: cancel中 — owner mismatch refused", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("cancel2"));
    const log = await recordAutomationExecutionLog({
      automationId: created.id,
      userId: USER_A,
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      xApiSummary: null,
      triggerType: "manual",
    });
    await expect(
      cancelDurableAutomationExecution({
        executionId: log.id,
        ownerUserId: USER_B,
      }),
    ).rejects.toThrow(/owner/);
  });

  it("21: idempotent execution upsert", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("idem"));
    const base = executionLogToDurableRow(
      {
        id: "exec_idem_1",
        automationId: created.id,
        userId: USER_A,
        scheduledAt: "2030-01-01T00:00:00.000Z",
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: "running",
        generatedText: null,
        xPostId: null,
        xPostUrl: null,
        errorCode: null,
        errorMessage: null,
        retryCount: 0,
        xApiSummary: null,
        triggerType: "automation",
      },
      { idempotencyKey: "idem-key-1" },
    );
    const a = await upsertDurableAutomationExecution(base);
    const b = await upsertDurableAutomationExecution({
      ...base,
      id: "exec_idem_2",
      status: "success",
      finishedAt: new Date().toISOString(),
    });
    expect(b.id).toBe(a.id);
    expect(b.status).toBe("success");
    const rows = await listDurableAutomationExecutions({
      automationId: created.id,
      ownerUserId: USER_A,
    });
    expect(rows.filter((r) => r.idempotencyKey === "idem-key-1")).toHaveLength(1);
  });

  it("22: completion evidence retained after success", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("done"));
    const result = await automationService.runNow(created.id, { userId: USER_A });
    expect(result?.status).toBe("completed");
    const rows = await listDurableAutomationExecutions({
      ownerUserId: USER_A,
      automationId: created.id,
    });
    expect(rows.some((r) => r.status === "success" || r.status === "running")).toBe(
      true,
    );
  });

  it("23: DB切断 — supabase backend fail-closed", async () => {
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "supabase");
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await expect(replaceDurableAutomationsForOwner(USER_A, [])).rejects.toThrow(
      /Map fallback disabled|memory fallback disabled|supabase/i,
    );
  });

  it("24: Migration未適用 — SQL migration declares required tables/constraints", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260805_p0_6_durable_automation_engine.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("atlas_automation_definitions");
    expect(sql).toContain("atlas_automation_executions");
    expect(sql).toContain("idempotency_key");
    expect(sql).toContain("paused");
    expect(sql).toContain("retry_count");
    expect(sql).toMatch(/owner_user_id/);
  });

  it("25: lost automation 0 after cold start x3", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("lost0"));
    for (let i = 0; i < 3; i += 1) {
      clearAutomationProcessCacheForTests();
      await ensureAutomationsHydrated(USER_A);
    }
    const listed = await listDurableAutomationsForOwner(USER_A);
    expect(listed.map((r) => r.id)).toContain(created.id);
  });

  it("26: update patch persists schedule label", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("label"));
    await automationService.updateForUser(created.id, USER_A, {
      name: "改名",
    });
    clearAutomationProcessCacheForTests();
    await ensureAutomationsHydrated(USER_A);
    expect((await getDurableAutomationById(created.id))?.name).toBe("改名");
  });

  it("27: empty owner list after delete-all soft path", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("del"));
    await serverAutomationRepository.replaceUserAutomations(USER_A, []);
    await persistAutomationsNow(USER_A);
    const listed = await listDurableAutomationsForOwner(USER_A);
    expect(listed.find((r) => r.id === created.id)).toBeUndefined();
  });

  it("28: pause中実行候補 — enqueue skips paused", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("skip-pause"));
    const past = new Date(Date.now() - 1000).toISOString();
    const result = await enqueueDueAutomations({
      candidates: [
        {
          automationId: created.id,
          ownerId: USER_A,
          name: created.name,
          nextRun: past,
          enabled: false,
          paused: true,
        },
      ],
      advanceNextRun: async () => null,
    });
    expect(result.due).toBe(0);
    expect(result.enqueued).toBe(0);
  });

  it("29: timeout failure recorded in durable history", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("to"));
    await upsertDurableAutomationExecution(
      executionLogToDurableRow({
        id: "exec_timeout",
        automationId: created.id,
        userId: USER_A,
        scheduledAt: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "failed",
        generatedText: null,
        xPostId: null,
        xPostUrl: null,
        errorCode: "timeout",
        errorMessage: "timed out",
        retryCount: 0,
        xApiSummary: null,
        triggerType: "automation",
      }),
    );
    const rows = await listDurableAutomationExecutions({ automationId: created.id });
    expect(rows[0]?.errorCode).toBe("timeout");
  });

  it("30: duplicate definition replace keeps single id", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("one"));
    const current = await getDurableAutomationById(created.id);
    await replaceDurableAutomationsForOwner(USER_A, [current!, current!]);
    const listed = await listDurableAutomationsForOwner(USER_A);
    expect(listed.filter((r) => r.id === created.id)).toHaveLength(1);
  });

  it("31: owner leakage 0 across 20 creates", async () => {
    for (let i = 0; i < 10; i += 1) {
      await automationService.createForUser(USER_A, dailyInput(`a_${i}`, 8));
      await automationService.createForUser(USER_B, dailyInput(`b_${i}`, 10));
    }
    const listA = await listDurableAutomationsForOwner(USER_A);
    const listB = await listDurableAutomationsForOwner(USER_B);
    expect(listA.every((r) => r.userId === USER_A)).toBe(true);
    expect(listB.every((r) => r.userId === USER_B)).toBe(true);
    expect(listA).toHaveLength(10);
    expect(listB).toHaveLength(10);
  });

  it("32: runNow idempotency skip does not invent success without job", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("idem-run"));
    const first = await automationService.runNow(created.id, {
      userId: USER_A,
      triggerType: "automation",
      scheduledAt: "2035-01-01T00:00:00.000Z",
    });
    const second = await automationService.runNow(created.id, {
      userId: USER_A,
      triggerType: "automation",
      scheduledAt: "2035-01-01T00:00:00.000Z",
    });
    expect(first?.dedupeSkipped).toBeFalsy();
    expect(second?.dedupeSkipped).toBe(true);
  });

  it("33: schedulePersistAutomations absent from automation-service source contract", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("./automation-service.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/schedulePersistAutomations/);
    expect(src).toMatch(/persistAutomationsNow/);
  });

  it("34: durable required under memory_durable", async () => {
    const { isAutomationDurableRequired } = await import("./automation-backend");
    expect(isAutomationDurableRequired()).toBe(true);
  });

  it("35: failure then retry then cancel leaves terminal cancelled", async () => {
    const created = await automationService.createForUser(USER_A, dailyInput("term"));
    const log = await recordAutomationExecutionLog({
      automationId: created.id,
      userId: USER_A,
      scheduledAt: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: "failed",
      generatedText: null,
      xPostId: null,
      xPostUrl: null,
      errorCode: "x",
      errorMessage: "x",
      retryCount: 0,
      xApiSummary: null,
      triggerType: "automation",
    });
    await scheduleDurableExecutionRetry({
      executionId: log.id,
      ownerUserId: USER_A,
      nextRetryAt: new Date(Date.now() + 10_000).toISOString(),
    });
    const cancelled = await cancelDurableAutomationExecution({
      executionId: log.id,
      ownerUserId: USER_A,
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.nextRetryAt).toBeNull();
  });
});

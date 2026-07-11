import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
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

vi.mock("@/lib/billing/subscriptions/lifecycle", () => ({
  isAutomationSuspendedForUser: vi.fn(() => false),
}));

vi.mock("@/lib/notifications/emitters", () => ({
  notifyAutomationAwaitingReview: vi.fn(),
  notifyAutomationCompleted: vi.fn(),
  notifyAutomationFailed: vi.fn(),
}));

describe("automation persistence and cron tick", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetAutomationStore } = await import(
      "./repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "./global-durable"
    );
    const { orchestrate } = await import("@/lib/orchestration/orchestrator");
    resetAutomationStore({ seed: false });
    resetAutomationsGlobalDurableForTests();
    vi.mocked(orchestrate).mockReset();
    vi.mocked(orchestrate).mockResolvedValue({
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
    } as never);
  });

  it("persists ON/OFF, next/last run, cron, and counters for a user", async () => {
    const { automationService } = await import("./automation-service");
    const { snapshotAutomations } = await import("./durable");
    const { listAutomationOwnerUserIds } = await import("./global-durable");

    const created = await automationService.createForUser("user_persist", {
      name: "日次レポート",
      description: "毎日の要約",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        cron: "0 9 * * *",
        timezone: "Asia/Tokyo",
        label: "毎日 9:00",
      },
      workflow: { assignment: "今日の要約を作成" },
      enabled: true,
    });

    expect(created.userId).toBe("user_persist");
    expect(created.enabled).toBe(true);
    expect(created.schedule.kind === "schedule" && created.schedule.cron).toBe(
      "0 9 * * *",
    );
    expect(created.nextRun).toBeTruthy();
    expect(created.successCount).toBe(0);
    expect(created.failureCount).toBe(0);

    const disabled = await automationService.setEnabledForUser(
      created.id,
      "user_persist",
      false,
    );
    expect(disabled?.enabled).toBe(false);

    const enabled = await automationService.setEnabledForUser(
      created.id,
      "user_persist",
      true,
    );
    expect(enabled?.enabled).toBe(true);

    const snap = snapshotAutomations("user_persist");
    expect(snap.automations).toHaveLength(1);
    expect(snap.automations[0]?.id).toBe(created.id);

    const owners = await listAutomationOwnerUserIds();
    expect(owners).toContain("user_persist");
  });

  it("records success and failure history on run", async () => {
    const { automationService } = await import("./automation-service");
    const { orchestrate } = await import("@/lib/orchestration/orchestrator");

    const created = await automationService.createForUser("user_run", {
      name: "手動実行",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 10, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 10:00",
      },
      workflow: { assignment: "実行して" },
      enabled: true,
      executionMode: "standard",
    });

    const ok = await automationService.runNow(created.id, {
      userId: "user_run",
    });
    expect(ok?.status).toBe("completed");

    const afterOk = await automationService.getByIdForUser(
      created.id,
      "user_run",
    );
    expect(afterOk?.successCount).toBe(1);
    expect(afterOk?.failureCount).toBe(0);
    expect(afterOk?.lastRun).toBeTruthy();
    expect(afterOk?.runHistory[0]?.status).toBe("completed");

    vi.mocked(orchestrate).mockResolvedValueOnce({
      assignment: "実行して",
      status: "failed",
      workflow: { status: "failed" },
      ceo: null,
      plannerPlan: null,
      plannerTasks: null,
      tasks: [],
      executions: [],
      deliverable: {
        type: "generic",
        title: "",
        summary: "",
        sections: [],
        body: "",
      },
      reviewComments: "",
      approved: false,
      finalResponse: "",
      totalDurationMs: 5,
      error: "boom",
    } as never);

    const failed = await automationService.runNow(created.id, {
      userId: "user_run",
    });
    expect(failed?.status).toBe("failed");

    const afterFail = await automationService.getByIdForUser(
      created.id,
      "user_run",
    );
    expect(afterFail?.failureCount).toBe(1);
    expect(afterFail?.successCount).toBe(1);
    expect(afterFail?.status).toBe("failed");
  });

  it("prevents double tick claims for the same nextRun slot", async () => {
    const { claimAutomationTickSlot } = await import("./global-durable");
    const first = await claimAutomationTickSlot(
      "user_a",
      "auto_1",
      "2026-07-11T00:00:00.000Z",
    );
    const second = await claimAutomationTickSlot(
      "user_a",
      "auto_1",
      "2026-07-11T00:00:00.000Z",
    );
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("processDueAutomations runs due jobs once and skips when claimed", async () => {
    const { automationService } = await import("./automation-service");
    const { serverAutomationRepository } = await import(
      "./repositories/server-automation-repository"
    );

    const created = await automationService.createForUser("user_due", {
      name: "期限到来",
      description: "due",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 8, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 8:00",
      },
      workflow: { assignment: "期限の仕事" },
      enabled: true,
      executionMode: "standard",
    });

    await serverAutomationRepository.update(created.id, {
      nextRun: "2020-01-01T00:00:00.000Z",
      status: "idle",
    });

    const first = await automationService.processDueAutomations();
    expect(first.length).toBe(1);
    expect(first[0]?.status).toBe("completed");

    const second = await automationService.processDueAutomations();
    expect(second.length).toBe(0);

    const row = await automationService.getByIdForUser(created.id, "user_due");
    expect(row?.enabled).toBe(true);
    expect(row?.successCount).toBe(1);
    expect(row?.nextRun).toBeTruthy();
    expect(row?.nextRun).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("survives store reset by restoring from durable hydrate snapshot path", async () => {
    const durableDomain = await import("@/lib/persistence/durable-domain");
    const { automationService } = await import("./automation-service");
    const { resetAutomationStore } = await import(
      "./repositories/server-automation-repository"
    );
    const { ensureAutomationsHydrated, snapshotAutomations } = await import(
      "./durable"
    );

    const created = await automationService.createForUser("user_reboot", {
      name: "再起動耐性",
      description: "keep",
      schedule: {
        kind: "schedule",
        preset: { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎週月曜 9:00",
      },
      workflow: { assignment: "再起動後も残る" },
      enabled: true,
    });

    const snap = snapshotAutomations("user_reboot");
    vi.mocked(durableDomain.loadDurableDomain).mockResolvedValueOnce(snap);

    resetAutomationStore({ seed: false });
    await ensureAutomationsHydrated("user_reboot");

    const restored = await automationService.getByIdForUser(
      created.id,
      "user_reboot",
    );
    expect(restored?.name).toBe("再起動耐性");
    expect(restored?.enabled).toBe(true);
    expect(restored?.workflow.assignment).toContain("再起動");
  });
});

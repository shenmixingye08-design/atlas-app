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

describe("automation pause and resume scheduling", () => {
  beforeEach(async () => {
    const { resetAutomationStore } = await import(
      "./repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "./global-durable"
    );
    resetAutomationStore({ seed: false });
    resetAutomationsGlobalDurableForTests();
  });

  it("clears nextRun on pause and schedules only a future slot on resume", async () => {
    const { automationService } = await import("./automation-service");

    const created = await automationService.createForUser("user_pause", {
      name: "停止再開テスト",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 9:00",
      },
      workflow: { assignment: "要約を作成" },
      enabled: true,
    });

    // Force a past nextRun as if the job was overdue while active.
    await automationService.updateForUser(created.id, "user_pause", {
      nextRun: "2020-01-01T00:00:00.000Z",
    });

    const paused = await automationService.setEnabledForUser(
      created.id,
      "user_pause",
      false,
    );
    expect(paused?.enabled).toBe(false);
    expect(paused?.nextRun).toBeNull();

    const resumed = await automationService.setEnabledForUser(
      created.id,
      "user_pause",
      true,
    );
    expect(resumed?.enabled).toBe(true);
    expect(resumed?.nextRun).toBeTruthy();
    expect(new Date(resumed!.nextRun!).getTime()).toBeGreaterThan(Date.now());
  });
});

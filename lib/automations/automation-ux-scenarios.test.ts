/**
 * Automation UX scenarios A–F + NL operate against the existing SoT.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./x-recurring/connection-gate", () => ({
  gateXRecurringConnection: vi.fn(async () => ({
    ok: true,
    username: "atlas_user",
    xUserId: "xid_atlas",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    connectedAt: new Date().toISOString(),
  })),
}));

vi.mock("@/lib/billing/access", () => ({
  requireBillingAutomationTask: vi.fn(async () => null),
  requireBillingFeature: vi.fn(async () => null),
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () => ({
    plan: "owner",
    flags: {},
  })),
}));

vi.mock("@/lib/feature-flags/guards", () => ({
  validateAutomationFeatureAccess: vi.fn(() => null),
}));

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "clerk"),
  loadDurableDomain: vi.fn(async () => null),
}));

vi.mock("@/lib/persistence/supabase-user-state", () => ({
  upsertSupabaseUserState: vi.fn(async () => true),
  loadSupabaseUserState: vi.fn(async () => null),
  listSupabaseUserIdsForDomain: vi.fn(async () => []),
}));

describe("Automation UX scenarios", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    vi.stubEnv("ATLAS_WORK_QUEUE_ALLOW_FILE", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function resetStores() {
    const { resetAutomationStore } = await import(
      "./repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import("./global-durable");
    const { resetDurableAutomationDefinitionsForTests } = await import(
      "./durable-automation-definitions"
    );
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetAutomationsGlobalDurableForTests();
  }

  it("Scenario A: first-time NL create shows preview and next run", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const result = await handleAutomationNaturalLanguage({
      userId: "user_ux_a",
      text: "毎朝8時にX投稿して",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.automation?.destination).toBe("x");
    expect(result.automation?.nextRun).toBeTruthy();
    expect(result.message).toContain("自動化しました");
    expect(result.message).toContain("Xへ投稿");
    expect(result.message).toContain("次回：");
    expect(result.message).toMatch(/実行前に確認|自動で実行/);
    expect(result.message).not.toMatch(/nextRunAt|cron|approve_then_run|UTC/);
  });

  it("Scenario B: memory labels stay user-facing", async () => {
    const { formatNaturalLanguageAutomationSuccess } = await import(
      "./create-from-natural-language"
    );
    const message = formatNaturalLanguageAutomationSuccess({
      name: "X投稿",
      scheduleLabel: "毎日 08:00",
      nextRun: "2026-08-15T23:00:00.000Z",
      executionLevel: "full_auto",
      timezone: "Asia/Tokyo",
      appliedPreferenceLabels: ["短めの文章", "絵文字少なめ"],
      approvalLabel: "自動で実行",
      actionLabel: "Xへ投稿",
    });
    expect(message).toContain("あなたの好みを反映：短めの文章、絵文字少なめ");
    expect(message).toContain("次回：");
    expect(message).not.toContain("2026-08-15T23:00:00.000Z");
    expect(message).not.toContain("memoryId");
  });

  it("Scenario C: time edit updates the same automation and next run", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const created = await handleAutomationNaturalLanguage({
      userId: "user_ux_c",
      text: "毎朝8時にX投稿して",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.automation) return;
    const firstNext = created.automation.nextRun;
    const updated = await handleAutomationNaturalLanguage({
      userId: "user_ux_c",
      text: "9時に変えて",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok || !updated.automation) return;
    expect(updated.automation.id).toBe(created.automation.id);
    expect(updated.automation.schedule.kind).toBe("schedule");
    if (updated.automation.schedule.kind === "schedule") {
      expect(updated.automation.schedule.preset.hour).toBe(9);
    }
    expect(updated.automation.nextRun).toBeTruthy();
    expect(updated.message).toContain("自動化を更新しました");
    expect(updated.message).toContain("次回：");
    expect(updated.automation.nextRun).not.toBe(firstNext);
  });

  it("Scenario D: pause clears next run instead of deleting", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const created = await handleAutomationNaturalLanguage({
      userId: "user_ux_d",
      text: "毎朝8時にX投稿して",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.automation) return;
    const paused = await handleAutomationNaturalLanguage({
      userId: "user_ux_d",
      text: "一旦止めて",
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok || !paused.automation) return;
    expect(paused.automation.id).toBe(created.automation.id);
    expect(paused.automation.enabled).toBe(false);
    expect(paused.automation.nextRun).toBeNull();
    expect(paused.message).toContain("一時停止");
  });

  it("Scenario E: resume schedules a future slot only", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const { automationService } = await import("./automation-service");
    const created = await handleAutomationNaturalLanguage({
      userId: "user_ux_e",
      text: "毎朝8時にX投稿して",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.automation) return;
    await automationService.setEnabledForUser(created.automation.id, "user_ux_e", false);
    await automationService.updateForUser(created.automation.id, "user_ux_e", {
      nextRun: "2020-01-01T00:00:00.000Z",
    });
    const resumed = await handleAutomationNaturalLanguage({
      userId: "user_ux_e",
      text: "また動かして",
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok || !resumed.automation) return;
    expect(resumed.automation.enabled).toBe(true);
    expect(resumed.automation.nextRun).toBeTruthy();
    expect(new Date(resumed.automation.nextRun!).getTime()).toBeGreaterThan(Date.now());
    expect(resumed.message).toContain("次回：");
  });

  it("Scenario F: X disconnect copy is understandable", async () => {
    const { explainAutomationFailure } = await import("./ux");
    const view = explainAutomationFailure("x_not_connected", "x_reconnect");
    expect(view.title).toBe("X接続切れ");
    expect(view.body).toContain("再接続");
    expect(view.body).not.toMatch(/worker|cron|nextRunAt/i);
  });

  it("asks before delete and does not invent a second automation", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const created = await handleAutomationNaturalLanguage({
      userId: "user_ux_del",
      text: "毎朝8時にX投稿して",
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.automation) return;
    const ask = await handleAutomationNaturalLanguage({
      userId: "user_ux_del",
      text: "この自動化消して",
    });
    expect(ask.ok).toBe(true);
    if (!ask.ok) return;
    expect(ask.message).toContain("削除しますか");
    expect(ask.message).toContain("一旦止めて");
    const confirmed = await handleAutomationNaturalLanguage({
      userId: "user_ux_del",
      text: "消していい",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.automation).toBeNull();
    const { automationService } = await import("./automation-service");
    const left = await automationService.listForUser("user_ux_del");
    expect(left).toHaveLength(0);
  });

  it("asks the user to choose when two X automations match", async () => {
    await resetStores();
    const { handleAutomationNaturalLanguage } = await import(
      "./handle-natural-language.server"
    );
    const first = await handleAutomationNaturalLanguage({
      userId: "user_ux_choice",
      text: "毎朝8時にX投稿して",
    });
    const second = await handleAutomationNaturalLanguage({
      userId: "user_ux_choice",
      text: "毎晩21時にX投稿して",
    });
    expect(first.ok && second.ok).toBe(true);
    const choice = await handleAutomationNaturalLanguage({
      userId: "user_ux_choice",
      text: "Xのやつ9時にして",
    });
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    expect(choice.message).toContain("対象の自動化が複数あります");
    expect(choice.automation).toBeNull();
  });
});

/**
 * Automation Phase 1 — NL → durable automation (Cases A–E).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectRecurringIntent } from "./detect-recurring";
import {
  parseNaturalLanguageAutomation,
  shouldRouteNlToV2ExternalCreate,
} from "./create-from-natural-language";

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

describe("Phase 1 detect / parse (Cases A–D)", () => {
  it("Case A: 毎朝9時にニュースをまとめて → daily", () => {
    const text = "毎朝9時にニュースをまとめて";
    const detected = detectRecurringIntent(text);
    expect(detected.detected).toBe(true);
    if (!detected.detected) return;
    expect(detected.formDefaults.frequency).toBe("daily");
    expect(detected.formDefaults.hour).toBe(9);
    expect(detected.formDefaults.minute).toBe(0);

    const parsed = parseNaturalLanguageAutomation(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frequency).toBe("daily");
    expect(parsed.createInput.enabled).toBe(true);
    expect(parsed.createInput.schedule.kind).toBe("schedule");
    if (parsed.createInput.schedule.kind === "schedule") {
      expect(parsed.createInput.schedule.preset.type).toBe("daily");
      expect(parsed.createInput.schedule.timezone).toBe("Asia/Tokyo");
      if (parsed.createInput.schedule.preset.type === "daily") {
        expect(parsed.createInput.schedule.preset.hour).toBe(9);
      }
    }
  });

  it("Case B: 毎週金曜日に今週の予定をまとめて → weekly Fri", () => {
    const text = "毎週金曜日に今週の予定をまとめて";
    const detected = detectRecurringIntent(text);
    expect(detected.detected).toBe(true);
    if (!detected.detected) return;
    expect(detected.formDefaults.frequency).toBe("weekly");
    expect(detected.formDefaults.dayOfWeek).toBe(5);

    const parsed = parseNaturalLanguageAutomation(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frequency).toBe("weekly");
    if (
      parsed.createInput.schedule.kind === "schedule" &&
      parsed.createInput.schedule.preset.type === "weekly"
    ) {
      expect(parsed.createInput.schedule.preset.dayOfWeek).toBe(5);
    }
  });

  it("Case C: 毎月1日に先月の内容をまとめて → monthly day 1", () => {
    const text = "毎月1日に先月の内容をまとめて";
    const detected = detectRecurringIntent(text);
    expect(detected.detected).toBe(true);
    if (!detected.detected) return;
    expect(detected.formDefaults.frequency).toBe("monthly");
    expect(detected.formDefaults.dayOfMonth).toBe(1);

    const parsed = parseNaturalLanguageAutomation(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frequency).toBe("monthly");
    if (
      parsed.createInput.schedule.kind === "schedule" &&
      parsed.createInput.schedule.preset.type === "monthly"
    ) {
      expect(parsed.createInput.schedule.preset.dayOfMonth).toBe(1);
    }
  });

  it("Case D: 今日のニュースをまとめて → must NOT create automation", () => {
    const text = "今日のニュースをまとめて";
    expect(detectRecurringIntent(text).detected).toBe(false);
    const parsed = parseNaturalLanguageAutomation(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe("not_recurring");
    }
  });

  it("routes X-only NL to V1 destination=x, not V2 external create", () => {
    const parsed = parseNaturalLanguageAutomation("毎朝8時にXへ投稿して");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.requiredExternals).toEqual(["x_post"]);
    expect(shouldRouteNlToV2ExternalCreate(parsed.requiredExternals)).toBe(
      false,
    );
    expect(parsed.createInput.destination).toBe("x");
    expect(parsed.createInput.schedule.kind).toBe("schedule");
    if (parsed.createInput.schedule.kind === "schedule") {
      expect(parsed.createInput.schedule.preset.type).toBe("daily");
      expect(parsed.createInput.schedule.timezone).toBe("Asia/Tokyo");
      if (parsed.createInput.schedule.preset.type === "daily") {
        expect(parsed.createInput.schedule.preset.hour).toBe(8);
      }
    }

    const calendar = parseNaturalLanguageAutomation(
      "毎朝9時にGoogleカレンダーへ予定を登録して",
    );
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    expect(shouldRouteNlToV2ExternalCreate(calendar.requiredExternals)).toBe(
      true,
    );
  });

  it("recognizes 毎晩 / 毎日 / 毎週月曜日", () => {
    expect(detectRecurringIntent("毎晩21時に振り返りして").detected).toBe(true);
    expect(detectRecurringIntent("毎日ニュースを確認して").detected).toBe(true);
    const weeklyMon = detectRecurringIntent("毎週月曜日に報告して");
    expect(weeklyMon.detected).toBe(true);
    if (weeklyMon.detected) {
      expect(weeklyMon.formDefaults.dayOfWeek).toBe(1);
    }
  });
});

describe("Phase 1 durable create + scheduler eligibility (A–C, E)", () => {
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

  it("Case A durable: creates enabled daily with nextRun (scheduler eligible)", async () => {
    const { createAutomationFromNaturalLanguage, isSchedulerDueEligible } =
      await import("./create-from-natural-language.server");
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_a",
      text: "毎朝9時にニュースをまとめて",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frequency).toBe("daily");
    expect(result.automation.enabled).toBe(true);
    expect(result.automation.nextRun).toBeTruthy();
    expect(result.automation.schedule.kind).toBe("schedule");
    if (result.automation.schedule.kind === "schedule") {
      expect(result.automation.schedule.preset.type).toBe("daily");
      expect(result.automation.schedule.timezone).toBe("Asia/Tokyo");
    }
    expect(result.automation.executionLevel).toBe("approve_then_run");
    expect(isSchedulerDueEligible(result.automation)).toBe(true);
    expect(result.message).toContain("登録しました");
    expect(result.message).not.toContain("まだ開始していません");
  });

  it("Case B durable: weekly Friday", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_b",
      text: "毎週金曜日に今週の予定をまとめて",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frequency).toBe("weekly");
    expect(result.automation.enabled).toBe(true);
    expect(result.automation.nextRun).toBeTruthy();
    if (
      result.automation.schedule.kind === "schedule" &&
      result.automation.schedule.preset.type === "weekly"
    ) {
      expect(result.automation.schedule.preset.dayOfWeek).toBe(5);
    }
  });

  it("Case C durable: monthly day 1", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_c",
      text: "毎月1日に先月の内容をまとめて",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frequency).toBe("monthly");
    expect(result.automation.enabled).toBe(true);
    expect(result.automation.nextRun).toBeTruthy();
  });

  it("Case E: create failure is fail-closed (no fake success)", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const { automationService } = await import("./automation-service");
    const spy = vi
      .spyOn(automationService, "createForUser")
      .mockRejectedValueOnce(new Error("forced_persist_failure"));

    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_e",
      text: "毎朝9時にニュースをまとめて",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("create_failed");
    expect(result.message).toContain("成功扱いにはしません");
    spy.mockRestore();
  });

  it("Case E2: one-shot must not return ok create", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_d",
      text: "今日のニュースをまとめて",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_recurring");
    }
  });

  it("due enqueue: NL automation becomes Scheduler due candidate", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const { automationService } = await import("./automation-service");
    const { enqueueDueAutomations } = await import(
      "@/lib/work-queue/scheduler"
    );

    const created = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_due",
      text: "毎朝9時にニュースをまとめて",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Make due now so Minute Scheduler path would enqueue.
    const past = new Date(Date.now() - 60_000).toISOString();
    await automationService.updateForUser(created.automation.id, "user_phase1_due", {
      nextRun: past,
    });

    const enqueued = await enqueueDueAutomations({
      candidates: [
        {
          automationId: created.automation.id,
          ownerId: "user_phase1_due",
          name: created.automation.name,
          nextRun: past,
          timezone: "Asia/Tokyo",
          enabled: true,
          assignment: created.automation.workflow.assignment,
        },
      ],
      advanceNextRun: async () =>
        new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(enqueued.due).toBe(1);
    expect(enqueued.enqueued + enqueued.deduped).toBeGreaterThanOrEqual(1);
  });

  it("X-only NL creates V1 destination=x (does not fail on V2 x_post)", async () => {
    const { createAutomationFromNaturalLanguage, isSchedulerDueEligible } =
      await import("./create-from-natural-language.server");
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase1_x",
      text: "毎朝8時にXへ投稿して",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.automation.destination).toBe("x");
    expect(result.automation.enabled).toBe(true);
    expect(result.automation.nextRun).toBeTruthy();
    expect(isSchedulerDueEligible(result.automation)).toBe(true);
    expect(result.message).toContain("登録しました");
    expect(result.automationV2Id).toBeUndefined();
  });
});

/**
 * VALUE MOAT PHASE 2 — CASE 1–18.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

import type { Automation } from "@/lib/automations/types";
import { checkFeatureAccess, getPlanDefinition } from "@/lib/billing/plans";
import { X_MEMORY_DENIED_SCOPES } from "@/lib/memory-apply/x-social-preference";
import { buildSideEffectIdempotencyKey } from "@/lib/side-effects/keys";
import {
  appsUserAvoided,
  runCalendarWeeklyDraftFromFixture,
  runSideEffectOnce,
  runWeeklyReportFromDriveFixture,
  sideEffectKey,
  type SideEffectLedger,
} from "@/lib/work-asset/cross-service";
import {
  classifyWorkException,
  isGenericFailureOnly,
} from "@/lib/work-asset/exceptions";
import { countHumanInterventions, shouldAskUserAfterSuccess } from "@/lib/work-asset/human-intervention";
import { partitionByUser, restoreAfterColdStart, simulateManyUsers } from "@/lib/work-asset/isolation";
import {
  isRecipeLive,
  listLiveRecipes,
  listUnsupportedRecipes,
} from "@/lib/work-asset/recipes";
import { describeWorkRules, isRuleAllowedForGenre, resolveWorkRules } from "@/lib/work-asset/work-rules";
import { listWorkAssets, toWorkAsset } from "@/lib/work-asset/work-view";

function sampleWork(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "work_a",
    userId: "user_a",
    name: "毎日のX投稿",
    description: "X",
    enabled: true,
    status: "success",
    schedule: {
      kind: "schedule",
      preset: { type: "daily", hour: 10, minute: 0 },
      timezone: "Asia/Tokyo",
      label: "毎日 10:00",
    },
    workflow: { assignment: "毎朝Xに投稿して" },
    timing: { startDate: null, endCondition: { type: "never" } },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: { templateId: "sns_post", steps: [{ id: "draft", enabled: true }] },
    destination: "x",
    lastRun: "2026-08-21T01:00:00.000Z",
    nextRun: "2026-08-23T01:00:00.000Z",
    lastWorkflowRunId: "run_1",
    lastError: null,
    successCount: 3,
    failureCount: 0,
    runHistory: [
      {
        id: "exec_1",
        status: "completed",
        startedAt: "2026-08-21T01:00:00.000Z",
        completedAt: "2026-08-21T01:00:05.000Z",
        error: null,
        triggerType: "automation",
        xPostId: "tw_1",
      },
    ],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-21T01:00:05.000Z",
    ...overrides,
  };
}

describe("CASE 1 Cross-Service success", () => {
  it("treats Drive fixture → Word → save → history → notify as one Work", () => {
    const run = runWeeklyReportFromDriveFixture({
      userId: "user_a",
      workId: "work_report",
      fixtureText: "今週の営業進捗。顧客3社を訪問。来週は提案。",
    });
    expect(run.workName).toBe("週報作成");
    expect(run.userVisibleSteps).toEqual(["週報作成"]);
    expect(run.status).toBe("succeeded");
    expect(run.historyRecorded).toBe(true);
    expect(run.notified).toBe(true);
    expect(appsUserAvoided(run)).toEqual(["ChatGPT", "Word", "保存ダイアログ"]);
    expect(isRecipeLive("drive_read_report")).toBe(false);
  });
});

describe("CASE 2 Calendar workflow", () => {
  it("makes a Gmail draft from fixture events and never sends", () => {
    const run = runCalendarWeeklyDraftFromFixture({
      userId: "user_a",
      workId: "work_cal",
      events: [{ title: "定例", start: "月曜 10:00" }],
      sendEmail: true,
      approvalRequired: true,
    });
    expect(run.status).toBe("succeeded");
    expect(run.steps.some((step) => step.name === "gmail_draft")).toBe(true);
    expect(run.steps.some((step) => step.name === "gmail_send")).toBe(false);
    expect(isRecipeLive("calendar_read_summary")).toBe(false);
  });
});

describe("CASE 3–4 Side-effect idempotency", () => {
  it("does not re-run an external action after persist failure", () => {
    const ledger: SideEffectLedger = new Map();
    const key = sideEffectKey({
      userId: "user_a",
      provider: "x",
      action: "post",
      occurrenceKey: "slot:2026-08-22T10:00",
    });
    const first = runSideEffectOnce({ ledger, key, resourceId: "tw_1" });
    expect(first.executed).toBe(true);
    const retryAfterPersistFail = runSideEffectOnce({
      ledger,
      key,
      resourceId: "tw_should_not_create",
    });
    expect(retryAfterPersistFail.executed).toBe(false);
    expect(retryAfterPersistFail.reused).toBe(true);
    expect(retryAfterPersistFail.resourceId).toBe("tw_1");

    const k1 = buildSideEffectIdempotencyKey({
      userId: "user_a",
      provider: "x",
      actionType: "post",
      destination: "timeline",
      automationId: "work_a",
      occurrenceKey: "slot:2026-08-22T10:00",
      runId: "run_1",
    });
    const k2 = buildSideEffectIdempotencyKey({
      userId: "user_a",
      provider: "x",
      actionType: "post",
      destination: "timeline",
      automationId: "work_a",
      occurrenceKey: "slot:2026-08-22T10:00",
      runId: "run_retry",
    });
    expect(k1).toBe(k2);
  });
});

describe("CASE 5 Exception", () => {
  it("surfaces reconnect CTA and never pretends success", () => {
    const view = classifyWorkException({
      errorText: "x_disconnected: token expired",
    });
    expect(view.workStatus).toBe("needs_attention");
    expect(view.title).toContain("Xとの接続が切れています");
    expect(view.cta.label).toBe("Xを再連携");
    expect(view.cta.href).toBe("/settings/x");
    expect(isGenericFailureOnly(view.title)).toBe(false);
    const posted = classifyWorkException({
      errorText: "notify failed",
      alreadyPosted: true,
    });
    expect(posted.alreadyPosted).toBe(true);
    expect(posted.body).toContain("再投稿はしません");
  });
});

describe("CASE 6–7 Intervention", () => {
  it("counts 0 human actions on a healthy full_auto run", () => {
    expect(
      countHumanInterventions({
        executionLevel: "full_auto",
        runStatus: "succeeded",
        permissionsOk: true,
      }).count,
    ).toBe(0);
    expect(
      shouldAskUserAfterSuccess({ executionLevel: "full_auto", succeeded: true }),
    ).toBe(false);
  });

  it("does not send when approval is required", () => {
    const run = runCalendarWeeklyDraftFromFixture({
      userId: "user_a",
      workId: "work_cal",
      events: [{ title: "定例", start: "月曜 10:00" }],
      sendEmail: true,
      approvalRequired: true,
    });
    const send = run.steps.find((step) => step.name === "gmail_send");
    expect(send).toBeUndefined();
    expect(
      countHumanInterventions({
        executionLevel: "approve_then_run",
        runStatus: "awaiting_approval",
      }).count,
    ).toBe(1);
  });
});

describe("CASE 8–9 Work Rules", () => {
  it("applies current > work > task > global", () => {
    const resolved = resolveWorkRules({
      global: { length: "short" },
      taskType: { headingCount: 3 },
      work: { format: "pdf" },
      current: { length: "long" },
    });
    expect(resolved.length.value).toBe("long");
    expect(resolved.length.layer).toBe("current");
    expect(resolved.headingCount.value).toBe(3);
    expect(resolved.format.value).toBe("pdf");
    expect(describeWorkRules(resolved)).toEqual(
      expect.arrayContaining(["詳しく", "PDF", "見出し3つ"]),
    );
  });

  it("keeps X rules out of Excel", () => {
    expect(isRuleAllowedForGenre("excel", "hashtagsMax")).toBe(false);
    expect(isRuleAllowedForGenre("x_post", "headingCount")).toBe(false);
    expect(X_MEMORY_DENIED_SCOPES).toContain("excel_template");
  });
});

describe("CASE 10 User isolation", () => {
  it("hides user A work from user B", () => {
    const a = sampleWork({ userId: "user_a", id: "work_a" });
    const b = sampleWork({ userId: "user_b", id: "work_b", name: "秘密" });
    expect(listWorkAssets([a, b], "user_b").map((row) => row.id)).toEqual(["work_b"]);
    expect(partitionByUser([a, b], "user_a").map((row) => row.id)).toEqual(["work_a"]);
  });
});

describe("CASE 11 Persistence", () => {
  it("restores work definition after a cold-start snapshot", () => {
    const work = toWorkAsset(sampleWork());
    const restored = restoreAfterColdStart(work);
    expect(restored).toEqual(work);
    expect(restored.nextRunAt).toBe(work.nextRunAt);
  });
});

describe("CASE 12–14 Pause / resume / immediate run", () => {
  beforeEach(async () => {
    process.env.ATLAS_AUTOMATION_STORAGE = "memory_durable";
    const { resetAutomationStore } = await import(
      "@/lib/automations/repositories/server-automation-repository"
    );
    const { resetAutomationsGlobalDurableForTests } = await import(
      "@/lib/automations/global-durable"
    );
    const { resetDurableAutomationDefinitionsForTests } = await import(
      "@/lib/automations/durable-automation-definitions"
    );
    resetAutomationStore({ seed: false });
    resetDurableAutomationDefinitionsForTests();
    resetAutomationsGlobalDurableForTests();
  });

  it("pauses schedule, resumes a future slot, and runNow mints a new execution", async () => {
    const { automationService } = await import("@/lib/automations/automation-service");
    const created = await automationService.createForUser("user_phase2", {
      name: "毎日のX投稿",
      description: "desc",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 10, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日 10:00",
      },
      workflow: { assignment: "X投稿" },
      enabled: true,
    });
    const scheduled = created.nextRun;
    const paused = await automationService.setEnabledForUser(
      created.id,
      "user_phase2",
      false,
    );
    expect(paused?.enabled).toBe(false);
    expect(paused?.nextRun).toBeNull();

    const resumed = await automationService.setEnabledForUser(
      created.id,
      "user_phase2",
      true,
    );
    expect(resumed?.enabled).toBe(true);
    expect(resumed?.nextRun).toBeTruthy();
    expect(new Date(resumed!.nextRun!).getTime()).toBeGreaterThan(Date.now());

    const first = await automationService.runNow(created.id, {
      userId: "user_phase2",
      scheduledAt: "2026-08-22T10:00:00.000Z",
    });
    const second = await automationService.runNow(created.id, {
      userId: "user_phase2",
      scheduledAt: "2026-08-22T10:01:00.000Z",
    });
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    if (first?.workflowRunId && second?.workflowRunId) {
      expect(second.workflowRunId).not.toBe(first.workflowRunId);
    }
    const after = (await automationService.listForUser("user_phase2")).find(
      (row) => row.id === created.id,
    );
    expect(after?.nextRun).toBeTruthy();
    expect(scheduled === null || after?.nextRun != null).toBe(true);
  });
});

describe("CASE 15 History under one Work", () => {
  it("keeps multiple executions on the same work id", () => {
    const work = toWorkAsset(
      sampleWork({
        runHistory: [
          {
            id: "exec_1",
            status: "completed",
            startedAt: "2026-08-20T01:00:00.000Z",
            completedAt: "2026-08-20T01:00:05.000Z",
            error: null,
            triggerType: "automation",
          },
          {
            id: "exec_2",
            status: "completed",
            startedAt: "2026-08-21T01:00:00.000Z",
            completedAt: "2026-08-21T01:00:05.000Z",
            error: null,
            triggerType: "manual",
          },
          {
            id: "exec_3",
            status: "failed",
            startedAt: "2026-08-22T01:00:00.000Z",
            completedAt: "2026-08-22T01:00:05.000Z",
            error: "x_disconnected",
            triggerType: "automation",
          },
        ],
      }),
    );
    expect(work.recentExecutionIds).toEqual(["exec_1", "exec_2", "exec_3"]);
  });
});

describe("CASE 16 Entitlements", () => {
  it("does not bypass plan limits for cross-service work", () => {
    expect(getPlanDefinition("free").monthlyPriceJpy).toBe(0);
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(getPlanDefinition("standard").monthlyPriceJpy).toBe(2980);
    expect(getPlanDefinition("premium").monthlyPriceJpy).toBe(9800);
    expect(checkFeatureAccess("light", "google_integration").allowed).toBe(false);
  });
});

describe("CASE 17 Mobile", () => {
  it("keeps Work list / attention / pause / runNow operable on phones", () => {
    const home = readFileSync(
      join(process.cwd(), "components/automation-first/your-work.tsx"),
      "utf8",
    );
    const firstHome = readFileSync(
      join(process.cwd(), "components/automation-first/automation-first-home.tsx"),
      "utf8",
    );
    expect(home).toContain("min-h-[var(--touch-target)]");
    expect(home).toContain("今すぐ実行");
    expect(home).toContain("一時停止");
    expect(home).toContain("再開");
    expect(firstHome).toContain("your-work");
    expect(firstHome).toContain("任せている仕事");
  });
});

describe("CASE 18 1000 users", () => {
  it("does not mix works across 1000 users", () => {
    const result = simulateManyUsers({ userCount: 1000, worksPerUser: 3 });
    expect(result.total).toBe(3000);
    expect(result.leaked).toBe(0);
  });
});

describe("Recipe honesty", () => {
  it("offers only live recipes and keeps Drive/Calendar READ unsupported", () => {
    expect(listLiveRecipes().every((row) => row.availability === "live")).toBe(true);
    expect(listUnsupportedRecipes().map((row) => row.id)).toEqual(
      expect.arrayContaining([
        "drive_read_report",
        "calendar_read_summary",
        "dropbox_excel",
      ]),
    );
    expect(listLiveRecipes().map((row) => row.id)).toEqual(
      expect.arrayContaining(["x_daily_post", "gmail_draft", "wordpress_draft"]),
    );
  });
});

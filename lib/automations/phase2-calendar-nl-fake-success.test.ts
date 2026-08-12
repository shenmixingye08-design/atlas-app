/**
 * Automation Phase 2 — production fake-success regression (Calendar NL).
 *
 * Production evidence (2026-08-13 ~01:00 JST):
 * User created「毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して」
 * UI showed 本日成功:1 but Google Calendar had no event.
 *
 * Root cause: NL → V1 durable create with destination none / generic orchestrate
 * only — Calendar text stayed in description; no Production google_calendar step.
 *
 * 【ATLAS機能評価】
 * 機能名：NL→Calendar Production step + external fail-closed
 * ユーザー価値：依頼どおり実カレンダー予定が作られ、偽成功で安心しない
 * 差別化：自然文の必須外部操作を step / adapter / event ID まで検証
 * 繰り返し作業の削減：はい（毎日の予定作成の手作業）
 * AI必要度：不要（ルール検出 + Production adapter）
 * AIなしで実装可能：はい
 * 運営コスト：低（検出・ゲートは通常コード）
 * 外部APIコスト：Google Calendar API（承認後 / スケジュール実行時のみ）
 * コスト削減案：エコN/A / まとめてN/A / 副作用idempotency / 予約実行 /
 *   AI起動なし / APIは実行時のみ / 承認後実行維持 / 再生成禁止
 * 優先度：P0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/billing/access", () => ({
  requireBillingAutomationTask: vi.fn(async () => null),
  requireBillingFeature: vi.fn(async () => null),
}));

vi.mock("@/lib/feature-flags/resolve-context", () => ({
  resolveFeatureAccessContext: vi.fn(async () => ({
    email: "owner@example.com",
    isOwner: true,
    isBetaUser: false,
  })),
}));

vi.mock("@/lib/feature-flags/guards", () => ({
  validateAutomationFeatureAccess: vi.fn(() => null),
}));

vi.mock("@/lib/automation-platform/bridge/v2-to-v1-scheduler", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/automation-platform/bridge/v2-to-v1-scheduler")
  >("@/lib/automation-platform/bridge/v2-to-v1-scheduler");
  return {
    ...actual,
    syncV2ToV1Scheduler: vi.fn(async (automation: { id: string }) => ({
      v1Id: `v1-shadow-${automation.id}`,
      registered: true,
    })),
  };
});

import {
  detectRequiredExternalActions,
  extractCalendarEventTitle,
  requiresGoogleCalendarAction,
} from "./detect-external-intent";
import { parseNaturalLanguageAutomation } from "./create-from-natural-language";
import {
  assertRequiredExternalEvidence,
  assertRequiredExternalStepsPresent,
  v1CannotSatisfyRequiredExternals,
} from "./required-external-fail-closed";
import {
  buildV2CreateInputFromNaturalLanguage,
  canCreateProductionExternalSteps,
} from "./create-external-v2-from-nl";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import {
  buildV1CreateInputFromV2,
  v1ShadowMustStayDisabled,
} from "@/lib/automation-platform/bridge/v2-to-v1-scheduler";
import { resetAutomationPlatformStoreForTests } from "@/lib/automation-platform/repository/memory-store";
import {
  resetFeatureFlagStore,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import type { AutomationV2 } from "@/lib/automation-platform/types";

/** Exact production fixture — do not paraphrase. */
const PRODUCTION_CALENDAR_NL =
  "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して";

describe("Phase 2 Calendar NL fake-success regression", () => {
  beforeEach(() => {
    resetAutomationPlatformStoreForTests();
    resetFeatureFlagStore();
    setFeatureFlagState("automation_v2_enabled", "on");
    setFeatureFlagState("google", "on");
    setFeatureFlagState("automation_approval_enabled", "on");
    vi.stubEnv("ATLAS_AUTOMATION_STORAGE", "memory_durable");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("detects Google Calendar as required external from exact production text", () => {
    expect(requiresGoogleCalendarAction(PRODUCTION_CALENDAR_NL)).toBe(true);
    expect(detectRequiredExternalActions(PRODUCTION_CALENDAR_NL)).toEqual([
      "google_calendar",
    ]);
    expect(extractCalendarEventTitle(PRODUCTION_CALENDAR_NL)).toBe(
      "MINERVOT自動化テスト",
    );
  });

  it("NL parse → durable schedule + requiredExternals (not description-only)", () => {
    const parsed = parseNaturalLanguageAutomation(PRODUCTION_CALENDAR_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frequency).toBe("daily");
    expect(parsed.requiredExternals).toContain("google_calendar");
    expect(parsed.createInput.schedule.kind).toBe("schedule");
    if (parsed.createInput.schedule.kind === "schedule") {
      expect(parsed.createInput.schedule.preset.type).toBe("daily");
      if (parsed.createInput.schedule.preset.type === "daily") {
        expect(parsed.createInput.schedule.preset.hour).toBe(1);
        expect(parsed.createInput.schedule.preset.minute).toBe(0);
      }
    }
  });

  it("builds V2 Production google_calendar step (FAIL if missing)", () => {
    const parsed = parseNaturalLanguageAutomation(PRODUCTION_CALENDAR_NL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(canCreateProductionExternalSteps(parsed.requiredExternals)).toBe(
      true,
    );
    const built = buildV2CreateInputFromNaturalLanguage({
      createInput: parsed.createInput,
      sourceText: parsed.sourceText,
      requiredExternals: parsed.requiredExternals,
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;

    const calendarSteps = built.workflow.steps.filter(
      (step) => step.enabled && step.type === "google_calendar",
    );
    expect(calendarSteps.length).toBeGreaterThan(0);
    expect(calendarSteps[0]?.configuration.eventTitle).toBe(
      "MINERVOT自動化テスト",
    );
    expect(
      built.instruction?.structuredOptions?.requiredExternals,
    ).toContain("google_calendar");
  });

  it("wizard NL propose emits google_calendar (not orchestrate-only)", () => {
    const draft = proposeWizardFromNaturalLanguage(PRODUCTION_CALENDAR_NL);
    const types = draft.steps.filter((s) => s.enabled).map((s) => s.type);
    expect(types).toContain("google_calendar");
    expect(types.includes("orchestrate") && types.length === 1).toBe(false);
  });

  it("missing Calendar step cannot be treated as completed", () => {
    const gate = assertRequiredExternalStepsPresent({
      required: ["google_calendar"],
      enabledStepTypes: ["orchestrate", "notify"],
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.code).toBe("external_step_missing");
  });

  it("Calendar step without provider event ID cannot succeed", () => {
    const gate = assertRequiredExternalEvidence({
      required: ["google_calendar"],
      enabledStepTypes: ["google_calendar"],
      executedStepTypes: ["google_calendar"],
      externalActionIds: [],
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.code).toBe("provider_evidence_missing");
  });

  it("Calendar step + event ID satisfies evidence gate", () => {
    const gate = assertRequiredExternalEvidence({
      required: ["google_calendar"],
      enabledStepTypes: ["google_calendar"],
      executedStepTypes: ["google_calendar"],
      externalActionIds: ["evt_prod_regression_1"],
    });
    expect(gate.ok).toBe(true);
  });

  it("V1 orchestrate path fail-closes for Calendar NL (no fake 本日成功)", () => {
    const gate = v1CannotSatisfyRequiredExternals(PRODUCTION_CALENDAR_NL);
    expect(gate.ok).toBe(false);
  });

  it("V1 scheduler shadow stays disabled when V2 has google_calendar", () => {
    const automation = {
      id: "auto_v2_cal",
      userId: "user_cal",
      name: "カレンダー入力自動化テスト",
      description: PRODUCTION_CALENDAR_NL,
      status: "active",
      trigger: {
        type: "schedule",
        timezone: "Asia/Tokyo",
        schedule: {
          frequency: "daily",
          hour: 1,
          minute: 0,
          cronDerived: null,
          startAt: null,
          endAt: null,
          maxOccurrences: null,
        },
        event: null,
        condition: null,
      },
      workflow: {
        version: 1,
        steps: [
          {
            id: "google_calendar",
            type: "google_calendar",
            name: "Google Calendar",
            order: 0,
            inputBindings: {},
            configuration: { eventTitle: "MINERVOT自動化テスト" },
            requiresApproval: true,
            retryPolicy: { maxAttempts: 1, backoffMs: [] },
            timeoutMs: 10_000,
            onSuccess: null,
            onFailure: null,
            enabled: true,
          },
        ],
        onFailure: { strategy: "stop", notify: true },
        timeoutPolicy: {
          workflowTimeoutMs: 60_000,
          stepDefaultTimeoutMs: 10_000,
        },
      },
      executionPolicy: { mode: "review_before_run", systemHighRiskOverride: true },
      notificationPolicy: {
        beforeRun: false,
        onSuccess: true,
        onFailure: true,
        onNeedsInput: true,
        channels: ["in_app"],
      },
      instruction: {
        freeformNotes: PRODUCTION_CALENDAR_NL,
        structuredOptions: { requiredExternals: ["google_calendar"] },
      },
      memoryPolicy: { enabled: false },
      nextRunAt: "2026-08-13T16:00:00.000Z",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    } as unknown as AutomationV2;

    expect(v1ShadowMustStayDisabled(automation)).toBe(true);
    const v1Input = buildV1CreateInputFromV2(automation);
    expect(v1Input).toBeTruthy();
    expect(v1Input?.enabled).toBe(false);
  });

  it("createAutomationFromNaturalLanguage routes Calendar NL to V2 with calendar step", async () => {
    const { createAutomationFromNaturalLanguage } = await import(
      "./create-from-natural-language.server"
    );
    const result = await createAutomationFromNaturalLanguage({
      userId: "user_phase2_cal_nl",
      text: PRODUCTION_CALENDAR_NL,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.automationV2Id).toBeTruthy();
    expect(result.automation.enabled).toBe(true);
    expect(result.automation.nextRun).toBeTruthy();
    expect(result.frequency).toBe("daily");

    const { automationPlatformService } = await import(
      "@/lib/automation-platform/service/automation-service"
    );
    const { buildFeatureAccessContext } = await import(
      "@/lib/feature-flags/access"
    );
    const v2 = await automationPlatformService.get(
      "user_phase2_cal_nl",
      result.automationV2Id!,
      buildFeatureAccessContext("owner@example.com"),
    );
    const calendarSteps = v2.workflow.steps.filter(
      (step) => step.enabled && step.type === "google_calendar",
    );
    expect(calendarSteps.length).toBeGreaterThan(0);
    expect(calendarSteps[0]?.configuration.eventTitle).toBe(
      "MINERVOT自動化テスト",
    );
  });
});

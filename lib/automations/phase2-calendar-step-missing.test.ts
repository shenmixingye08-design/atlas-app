/**
 * Production regression — diagnosticId aaef8557-500a-461f-a95a-d8df3e1905e4
 *
 * UI: 「必須の外部手順が未生成のため完了できません: Googleカレンダーへの予定作成」
 * errorCode: automation_run_failed / external_step_missing
 *
 * Shape that failed: freeformNotes (or declared requiredExternals) required
 * google_calendar, but workflow.steps stayed orchestrate-only → executor
 * fail-closed after other steps "succeeded". Credential hydrate / Calendar
 * adapter / Google API were NOT reached.
 *
 * 【ATLAS機能評価】
 * 機能名：required external → google_calendar step 自動補完
 * ユーザー価値：依頼どおりの予定作成手順が欠落せず、偽失敗メッセージで止まらない
 * 差別化：notes と steps の不整合を create/enqueue で自己修復
 * 繰り返し作業の削減：はい
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：低
 * 外部APIコスト：実行時のみ（補完自体はゼロ）
 * コスト削減案：エコN/A / キャッシュN/A / APIは adapter 到達後のみ /
 *   承認後実行維持 / 同じ定義を再生成しない（idempotent inject）
 * 優先度：P0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { buildCreateInputFromWizard } from "@/lib/automation-platform/wizard/builders";
import { createEmptyWizardDraft } from "@/lib/automation-platform/wizard/builders";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import {
  assertRequiredExternalStepsPresent,
  resolveRequiredExternals,
} from "@/lib/automations/required-external-fail-closed";
import {
  ensureRequiredExternalSteps,
  buildGoogleCalendarStepFromText,
} from "@/lib/automations/ensure-external-steps";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

/** Exact Production NL fixture (same as #290 fake-success incident). */
const PRODUCTION_CALENDAR_NL =
  "毎日1時にMINERVOT自動化テストという予定をGoogleカレンダーに作成して";

function orchestrateOnlyStep(): AutomationWorkflowStep {
  return {
    id: "orchestrate",
    type: "orchestrate",
    name: "仕事の遂行",
    order: 1,
    inputBindings: {},
    configuration: {},
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 60_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

describe("Phase 2 Calendar step-missing (diagnosticId aaef8557…)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("reproduces Production fail-closed shape: notes require Calendar, steps are orchestrate-only", () => {
    const required = resolveRequiredExternals({
      sourceText: PRODUCTION_CALENDAR_NL,
      declared: null,
    });
    expect(required).toEqual(["google_calendar"]);

    const gate = assertRequiredExternalStepsPresent({
      required,
      enabledStepTypes: ["orchestrate"],
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.code).toBe("external_step_missing");
    expect(gate.reason).toContain(
      "必須の外部手順が未生成のため完了できません: Googleカレンダーへの予定作成",
    );
  });

  it("ensureRequiredExternalSteps injects google_calendar and drops orphan orchestrate", () => {
    const ensured = ensureRequiredExternalSteps({
      steps: [orchestrateOnlyStep()],
      freeformNotes: PRODUCTION_CALENDAR_NL,
      structuredOptions: {},
    });
    expect(ensured.changed).toBe(true);
    expect(ensured.injected).toEqual(["google_calendar"]);
    expect(
      ensured.steps.some((s) => s.enabled && s.type === "google_calendar"),
    ).toBe(true);
    expect(
      ensured.steps.some((s) => s.enabled && s.type === "orchestrate"),
    ).toBe(false);
    expect(ensured.structuredOptions.requiredExternals).toEqual([
      "google_calendar",
    ]);
    expect(
      (ensured.steps.find((s) => s.type === "google_calendar")?.configuration as
        | { eventTitle?: string }
        | undefined)?.eventTitle,
    ).toBe("MINERVOT自動化テスト");
  });

  it("wizard buildCreateInputFromWizard self-heals orchestrate-only + Calendar notes", () => {
    const draft = createEmptyWizardDraft({
      name: "カレンダー入力自動化テスト",
      naturalLanguageSeed: PRODUCTION_CALENDAR_NL,
      freeformNotes: PRODUCTION_CALENDAR_NL,
      activateOnCreate: true,
      steps: [
        {
          id: "orchestrate",
          type: "orchestrate",
          name: "仕事の遂行",
          enabled: true,
          requiresApproval: false,
          configuration: {},
        },
      ],
      frequency: "daily",
      hour: 1,
      minute: 0,
      triggerType: "schedule",
    });

    const built = buildCreateInputFromWizard(draft);
    expect(built.errors.some((e) => e.code === "external_step_missing")).toBe(
      false,
    );
    const types = built.input.workflow.steps
      .filter((s) => s.enabled)
      .map((s) => s.type);
    expect(types).toContain("google_calendar");
    expect(
      built.input.instruction?.structuredOptions?.requiredExternals,
    ).toContain("google_calendar");
  });

  it("NL propose + ensure path reaches live Calendar adapter wiring", () => {
    const draft = proposeWizardFromNaturalLanguage(PRODUCTION_CALENDAR_NL);
    const built = buildCreateInputFromWizard({
      ...draft,
      activateOnCreate: true,
    });
    const calendar = built.input.workflow.steps.find(
      (s) => s.enabled && s.type === "google_calendar",
    );
    expect(calendar).toBeTruthy();
    expect(isLiveAdapterWired("google_calendar")).toBe(true);
    // Adapter entry is selected by step type in strictStepInvoker.
    expect(calendar?.type).toBe("google_calendar");
    expect(buildGoogleCalendarStepFromText(PRODUCTION_CALENDAR_NL).type).toBe(
      "google_calendar",
    );
  });
});

/**
 * Build / create V2 automations for NL requests that require production
 * external steps (Calendar, etc.). Fail-closed if the required step cannot
 * be expressed as a Production-wired capability.
 */

import "server-only";

import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import type { RequiredExternalAction } from "@/lib/automations/detect-external-intent";
import {
  buildGoogleCalendarStepFromText,
  canWireProductionExternalStep,
} from "@/lib/automations/ensure-external-steps";
import type { CreateAutomationInput } from "@/lib/automations/types";
import type { AutomationV2 } from "@/lib/automation-platform/types";

function buildExternalSteps(
  required: readonly RequiredExternalAction[],
  sourceText: string,
): AutomationWorkflowStep[] {
  const steps: AutomationWorkflowStep[] = [];
  for (const action of required) {
    if (action === "google_calendar") {
      steps.push(buildGoogleCalendarStepFromText(sourceText, steps.length));
      continue;
    }
    // Other externals: only emit when we can wire a real Production step.
    // Unknown required actions are rejected by the caller.
  }
  return steps;
}

export function canCreateProductionExternalSteps(
  required: readonly RequiredExternalAction[],
): boolean {
  if (required.length === 0) return true;
  return required.every((action) => canWireProductionExternalStep(action));
}

export function buildV2CreateInputFromNaturalLanguage(input: {
  createInput: CreateAutomationInput;
  sourceText: string;
  requiredExternals: readonly RequiredExternalAction[];
}): CreateAutomationV2Input | { error: string } {
  const schedule = input.createInput.schedule;
  if (schedule.kind !== "schedule") {
    return { error: "スケジュール付きの定期依頼のみ作成できます。" };
  }

  const steps = buildExternalSteps(input.requiredExternals, input.sourceText);
  if (steps.length === 0) {
    return {
      error:
        "必須の外部操作をProduction手順として生成できませんでした。成功扱いにはしません。",
    };
  }
  for (const required of input.requiredExternals) {
    if (!steps.some((step) => step.type === required && step.enabled)) {
      return {
        error: `必須の外部手順（${required}）が生成されませんでした。成功扱いにはしません。`,
      };
    }
  }

  const preset = schedule.preset;
  const triggerSchedule =
    preset.type === "daily"
      ? {
          frequency: "daily" as const,
          hour: preset.hour,
          minute: preset.minute,
          cronDerived: schedule.cron ?? null,
          startAt: input.createInput.timing?.startDate ?? null,
          endAt: null,
          maxOccurrences: null,
        }
      : preset.type === "weekly"
        ? {
            frequency: "weekly" as const,
            hour: preset.hour,
            minute: preset.minute,
            daysOfWeek: [preset.dayOfWeek],
            cronDerived: schedule.cron ?? null,
            startAt: input.createInput.timing?.startDate ?? null,
            endAt: null,
            maxOccurrences: null,
          }
        : {
            frequency: "monthly" as const,
            hour: preset.hour,
            minute: preset.minute,
            dayOfMonth: preset.dayOfMonth,
            cronDerived: schedule.cron ?? null,
            startAt: input.createInput.timing?.startDate ?? null,
            endAt: null,
            maxOccurrences: null,
          };

  return {
    name: input.createInput.name,
    description: input.createInput.description,
    status: "active",
    trigger: {
      type: "schedule",
      timezone: schedule.timezone || "Asia/Tokyo",
      schedule: triggerSchedule,
      event: null,
      condition: null,
    },
    workflow: {
      version: 1,
      steps,
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 900_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: {
      mode: "review_before_run",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: false,
      onSuccess: true,
      onFailure: true,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      freeformNotes: input.sourceText,
      structuredOptions: {
        requiredExternals: [...input.requiredExternals],
        source: "natural_language",
      },
    },
    memoryPolicy: {
      enabled: false,
      allowedScopes: [],
      deniedScopes: [],
      lockedOverrides: {},
    },
  };
}

export async function createExternalAutomationV2FromNaturalLanguage(input: {
  userId: string;
  createInput: CreateAutomationInput;
  sourceText: string;
  requiredExternals: readonly RequiredExternalAction[];
  context: FeatureAccessContext;
}): Promise<
  | { ok: true; automation: AutomationV2 }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  if (!isFeatureEnabled("automation_v2_enabled", input.context)) {
    return {
      ok: false,
      code: "automation_v2_required",
      message:
        "外部サービス操作を含む定期依頼には Automation V2 が必要です。成功扱いにはしません。",
      httpStatus: 403,
    };
  }
  if (!isFeatureEnabled("google", input.context)) {
    return {
      ok: false,
      code: "feature_denied",
      message: "Google連携が無効のためカレンダー自動化を作成できません。",
      httpStatus: 403,
    };
  }
  if (!canCreateProductionExternalSteps(input.requiredExternals)) {
    return {
      ok: false,
      code: "external_step_unsupported",
      message:
        "依頼された外部操作をProduction手順として生成できません。成功扱いにはしません。",
      httpStatus: 400,
    };
  }

  const built = buildV2CreateInputFromNaturalLanguage({
    createInput: input.createInput,
    sourceText: input.sourceText,
    requiredExternals: input.requiredExternals,
  });
  if ("error" in built) {
    return {
      ok: false,
      code: "external_step_missing",
      message: built.error,
      httpStatus: 400,
    };
  }

  try {
    const automation = await automationPlatformService.create(
      input.userId,
      built,
      input.context,
    );
    const hasCalendar = automation.workflow.steps.some(
      (step) => step.enabled && step.type === "google_calendar",
    );
    if (!hasCalendar) {
      return {
        ok: false,
        code: "external_step_missing",
        message:
          "Calendar手順が保存されませんでした。成功扱いにはしません。",
        httpStatus: 500,
      };
    }
    return { ok: true, automation };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : "create_failed";
    return {
      ok: false,
      code: "create_failed",
      message: `自動化の登録に失敗しました（${message}）。成功扱いにはしません。`,
      httpStatus: 500,
    };
  }
}

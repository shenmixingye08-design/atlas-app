/**
 * Phase 4 — create durable condition-trigger Automation V2 from NL.
 */

import "server-only";

import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { AutomationV2 } from "@/lib/automation-platform/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

import {
  buildConditionV2CreateInputFromParse,
  parsePhase4ConditionNaturalLanguage,
} from "./phase4-condition-compose";
import { createEmptyTriggerState, upsertTriggerState } from "@/lib/automation-platform/condition/trigger-state-store";

export async function createConditionAutomationV2FromNaturalLanguage(input: {
  userId: string;
  text: string;
  context: FeatureAccessContext;
  requireApprovalStep?: boolean;
}): Promise<
  | { ok: true; automation: AutomationV2; title: string }
  | { ok: false; code: string; message: string; httpStatus: number }
> {
  if (!isFeatureEnabled("automation_v2_enabled", input.context)) {
    return {
      ok: false,
      code: "automation_v2_required",
      message:
        "条件トリガー自動化には Automation V2 が必要です。成功扱いにはしません。",
      httpStatus: 403,
    };
  }
  if (!isFeatureEnabled("google", input.context)) {
    return {
      ok: false,
      code: "feature_denied",
      message: "Google連携が無効のため条件トリガーを作成できません。",
      httpStatus: 403,
    };
  }

  const parsed = parsePhase4ConditionNaturalLanguage(input.text);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: parsed.message,
      httpStatus: 400,
    };
  }

  const built = buildConditionV2CreateInputFromParse(parsed, {
    requireApprovalStep: input.requireApprovalStep,
  });
  if (built.workflow.steps.length === 0) {
    return {
      ok: false,
      code: "workflow_empty",
      message: "条件成立後の手順を生成できませんでした。成功扱いにはしません。",
      httpStatus: 400,
    };
  }
  if (built.trigger.type !== "condition") {
    return {
      ok: false,
      code: "trigger_type_invalid",
      message: "condition trigger として保存できませんでした。",
      httpStatus: 500,
    };
  }
  if (built.trigger.schedule != null) {
    return {
      ok: false,
      code: "schedule_mixed",
      message: "condition trigger に schedule が混在しています。",
      httpStatus: 500,
    };
  }

  try {
    const automation = await automationPlatformService.create(
      input.userId,
      built,
      input.context,
    );
    if (automation.trigger.type !== "condition") {
      return {
        ok: false,
        code: "trigger_persist_failed",
        message: "condition trigger の永続化に失敗しました。",
        httpStatus: 500,
      };
    }
    const hasNotify = automation.workflow.steps.some(
      (step) => step.enabled && step.type === "notify",
    );
    if (!hasNotify) {
      return {
        ok: false,
        code: "notify_step_missing",
        message: "通知手順が保存されませんでした。成功扱いにはしません。",
        httpStatus: 500,
      };
    }

    // Initialize durable evaluation state (cold-start baseline = unknown/false).
    await upsertTriggerState(
      createEmptyTriggerState({
        automationId: automation.id,
        userId: input.userId,
        triggerType: "condition",
        triggerVersion: 1,
      }),
    );

    return { ok: true, automation, title: parsed.title };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : "create_failed";
    return {
      ok: false,
      code: "create_failed",
      message: `条件自動化の登録に失敗しました（${message}）。成功扱いにはしません。`,
      httpStatus: 500,
    };
  }
}

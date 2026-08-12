import "server-only";

import {
  requireBillingAutomationTask,
  requireBillingFeature,
} from "@/lib/billing/access";
import { validateAutomationFeatureAccess } from "@/lib/feature-flags/guards";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";

import { automationService } from "./automation-service";
import {
  formatNaturalLanguageAutomationSuccess,
  parseNaturalLanguageAutomation,
} from "./create-from-natural-language";
import type { Automation } from "./types";

export type CreateFromNaturalLanguageResult =
  | {
      ok: true;
      automation: Automation;
      message: string;
      frequency: "daily" | "weekly" | "monthly";
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
    };

/**
 * Fail-closed NL → durable active automation.
 * Success only when persisted, enabled, schedule kind=schedule, and nextRun set.
 */
export async function createAutomationFromNaturalLanguage(input: {
  userId: string;
  text: string;
}): Promise<CreateFromNaturalLanguageResult> {
  const parsed = parseNaturalLanguageAutomation(input.text);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: parsed.message,
      httpStatus: 400,
    };
  }

  const createInput = parsed.createInput;
  const accessContext = await resolveFeatureAccessContext();
  const featureError = validateAutomationFeatureAccess(
    createInput,
    accessContext,
  );
  if (featureError) {
    return {
      ok: false,
      code: "feature_denied",
      message: featureError,
      httpStatus: 403,
    };
  }

  const existing = await automationService.listForUser(input.userId);
  const taskDenied = await requireBillingAutomationTask(
    input.userId,
    existing.length,
  );
  if (taskDenied) {
    const body = (await taskDenied.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      code: "billing_task_limit",
      message: body.error ?? "自動化の作成上限に達しています。",
      httpStatus: taskDenied.status,
    };
  }

  if (createInput.executionMode === "high_quality") {
    const hqDenied = await requireBillingFeature(
      input.userId,
      "high_quality_mode",
    );
    if (hqDenied) {
      const body = (await hqDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_hq",
        message: body.error ?? "高品質モードを利用できません。",
        httpStatus: hqDenied.status,
      };
    }
  }
  if (createInput.executionMode === "eco") {
    const ecoDenied = await requireBillingFeature(input.userId, "eco_mode");
    if (ecoDenied) {
      const body = (await ecoDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_eco",
        message: body.error ?? "エコモードを利用できません。",
        httpStatus: ecoDenied.status,
      };
    }
  }

  const destination = createInput.destination === "x" ? "x" : "none";
  if (destination === "x") {
    const snsDenied = await requireBillingFeature(input.userId, "sns_auto_post");
    if (snsDenied) {
      const body = (await snsDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_sns",
        message: body.error ?? "SNS自動投稿を利用できません。",
        httpStatus: snsDenied.status,
      };
    }
    const { gateXRecurringConnection } = await import(
      "./x-recurring/connection-gate"
    );
    const gate = await gateXRecurringConnection({
      userId: input.userId,
      context: accessContext,
    });
    if (!gate.ok) {
      return {
        ok: false,
        code: gate.error.code,
        message: gate.error.message,
        httpStatus: 400,
      };
    }
    const { buildXDestinationExecutionFlow } = await import(
      "./x-recurring/destination"
    );
    createInput.destination = "x";
    createInput.executionFlow = buildXDestinationExecutionFlow(
      createInput.executionLevel ?? "approve_then_run",
    );
  }

  let automation: Automation;
  try {
    automation = await automationService.createForUser(
      input.userId,
      createInput,
    );
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

  // Fail-closed: never claim success without durable schedule + nextRun.
  if (!automation.enabled) {
    return {
      ok: false,
      code: "not_active",
      message: "自動化は作成されましたが有効化されていません。",
      httpStatus: 500,
    };
  }
  if (automation.schedule.kind !== "schedule") {
    return {
      ok: false,
      code: "schedule_missing",
      message: "スケジュールが保存されていません。",
      httpStatus: 500,
    };
  }
  if (!automation.nextRun) {
    return {
      ok: false,
      code: "next_run_missing",
      message: "次回実行時刻が生成されていません。",
      httpStatus: 500,
    };
  }

  // Re-read to confirm hydration/persistence path sees the same record.
  const stored = await automationService.getByIdForUser(
    automation.id,
    input.userId,
  );
  if (!stored?.enabled || !stored.nextRun || stored.schedule.kind !== "schedule") {
    return {
      ok: false,
      code: "persist_verify_failed",
      message: "永続化の確認に失敗しました。成功扱いにはしません。",
      httpStatus: 500,
    };
  }

  const scheduleLabel =
    stored.schedule.kind === "schedule" ? stored.schedule.label : "（不明）";
  const timezone =
    stored.schedule.kind === "schedule"
      ? stored.schedule.timezone
      : "Asia/Tokyo";

  return {
    ok: true,
    automation: stored,
    frequency: parsed.frequency,
    message: formatNaturalLanguageAutomationSuccess({
      name: stored.name,
      scheduleLabel,
      nextRun: stored.nextRun,
      executionLevel: stored.executionLevel,
      timezone,
    }),
  };
}

/** True when this automation is eligible for Minute Scheduler due scan. */
export function isSchedulerDueEligible(automation: Automation): boolean {
  return (
    automation.enabled === true &&
    automation.schedule.kind === "schedule" &&
    typeof automation.nextRun === "string" &&
    automation.nextRun.length > 0
  );
}

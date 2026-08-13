/**
 * Phase 4 — NL → condition trigger + workflow composition (rules only, no AI).
 *
 * 【ATLAS機能評価】
 * 機能名：Automation Phase 4 Condition / Event Trigger
 * ユーザー価値：条件成立時だけ仕事を起動し監視・判断の手作業を削減
 * 差別化：false→true edge + durable evidence で既存 V2 実行基盤へ統合
 * 繰り返し作業の削減：はい
 * AI必要度：不要（ルールベース）
 * AIなしで実装可能：はい
 * 運営コスト：追加AIなし / Calendar list poll のみ
 * 外部APIコスト：有（評価時 Google Calendar list）
 * コスト削減案：AIなし / edgeのみ起動 / lease / occurrence dedupe / 承認後実行
 * 優先度：P0
 */

import { extractCalendarEventTitle } from "@/lib/automations/detect-external-intent";
import { buildNotifyStepFromText } from "@/lib/automations/phase3-multistep-compose";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { CreateAutomationV2Input } from "@/lib/automation-platform/types";

const CONDITION_TRIGGER_PATTERN =
  /(?:されたら|したら|になったら|見つかったら|満たしたら|発生したら|追加されたら|作成されたら)/;

const CALENDAR_CONDITION_SOURCE_PATTERN =
  /(?:google\s*カレンダー|グーグル\s*カレンダー|Google\s*Calendar|カレンダー)/i;

const NOTIFY_ACTION_PATTERN = /通知|知らせ|教えて/;

const GENERIC_CONDITION_PATTERN =
  /条件を満たしたら|新しい対象が見つかったら|この仕事を実行して/;

export type Phase4ConditionParse =
  | {
      ok: true;
      sourceText: string;
      provider: "google_calendar";
      eventType: "event_title_match";
      expression: "google_calendar.event_title_match";
      title: string;
      matchMode: "equals" | "contains";
      wantsNotify: boolean;
      timezone: string;
      name: string;
    }
  | {
      ok: false;
      code: "empty" | "not_condition" | "title_missing" | "action_unsupported";
      message: string;
    };

/** True when NL is a condition/event trigger (not a schedule). */
export function isConditionTriggerNaturalLanguage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Schedule keywords win — never confuse with Phase 1 schedule path.
  if (
    /毎日|毎朝|毎週|毎月|曜日|時に|cron|スケジュール/.test(trimmed) &&
    !CONDITION_TRIGGER_PATTERN.test(trimmed)
  ) {
    return false;
  }
  if (/毎日|毎朝|毎週|毎月/.test(trimmed) && /時に/.test(trimmed)) {
    return false;
  }
  return (
    CONDITION_TRIGGER_PATTERN.test(trimmed) ||
    GENERIC_CONDITION_PATTERN.test(trimmed)
  );
}

export function parsePhase4ConditionNaturalLanguage(
  text: string,
): Phase4ConditionParse {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: "empty", message: "依頼文が空です。" };
  }
  if (!isConditionTriggerNaturalLanguage(trimmed)) {
    return {
      ok: false,
      code: "not_condition",
      message: "条件・イベント起動の依頼として認識できませんでした。",
    };
  }

  const calendarSource = CALENDAR_CONDITION_SOURCE_PATTERN.test(trimmed);
  if (!calendarSource && !GENERIC_CONDITION_PATTERN.test(trimmed)) {
    return {
      ok: false,
      code: "not_condition",
      message: "対応する条件ソースを認識できませんでした。",
    };
  }

  const title =
    extractCalendarEventTitle(trimmed) ||
    trimmed.match(/[「『]([^」』]{1,80})[」』]/)?.[1]?.trim() ||
    null;

  if (!title) {
    return {
      ok: false,
      code: "title_missing",
      message:
        "監視する予定名（例: 「Phase4トリガーテスト」という予定）が必要です。",
    };
  }

  const wantsNotify =
    NOTIFY_ACTION_PATTERN.test(trimmed) ||
    /処理して|実行して|仕事を/.test(trimmed);
  if (!wantsNotify) {
    return {
      ok: false,
      code: "action_unsupported",
      message: "条件成立後のアクション（通知 / 実行）を認識できませんでした。",
    };
  }

  return {
    ok: true,
    sourceText: trimmed,
    provider: "google_calendar",
    eventType: "event_title_match",
    expression: "google_calendar.event_title_match",
    title,
    matchMode: "equals",
    wantsNotify: true,
    timezone: "Asia/Tokyo",
    name: `条件: ${title}`,
  };
}

export function composePhase4ConditionWorkflowSteps(input: {
  sourceText: string;
  title: string;
  wantsNotify: boolean;
  requireApprovalStep?: boolean;
}): {
  steps: AutomationWorkflowStep[];
  composition: "notify" | "await_approval_notify";
} {
  const steps: AutomationWorkflowStep[] = [];
  let order = 0;
  if (input.requireApprovalStep) {
    steps.push({
      id: "await_approval",
      type: "await_approval",
      name: "承認待ち",
      order: order++,
      inputBindings: {},
      configuration: {},
      requiresApproval: true,
      retryPolicy: { maxAttempts: 1, backoffMs: [] },
      timeoutMs: 120_000,
      onSuccess: null,
      onFailure: null,
      enabled: true,
    });
  }
  if (input.wantsNotify) {
    const notify = buildNotifyStepFromText(
      `「${input.title}」という予定 ${input.sourceText}`,
      order++,
    );
    notify.configuration = {
      ...notify.configuration,
      title: "条件トリガーが成立しました",
      message: `カレンダーに「${input.title}」が検出されたため、自動化を実行しました。`,
    };
    steps.push(notify);
  }
  return {
    steps,
    composition: input.requireApprovalStep ? "await_approval_notify" : "notify",
  };
}

export function buildConditionV2CreateInputFromParse(
  parsed: Extract<Phase4ConditionParse, { ok: true }>,
  options?: { requireApprovalStep?: boolean },
): CreateAutomationV2Input {
  const composed = composePhase4ConditionWorkflowSteps({
    sourceText: parsed.sourceText,
    title: parsed.title,
    wantsNotify: parsed.wantsNotify,
    requireApprovalStep: options?.requireApprovalStep,
  });

  return {
    name: parsed.name,
    description: `条件トリガー: ${parsed.title}`,
    status: "active",
    trigger: {
      type: "condition",
      timezone: parsed.timezone,
      schedule: null,
      event: {
        source: parsed.provider,
        eventType: parsed.eventType,
        filter: {
          title: parsed.title,
          matchMode: parsed.matchMode,
          calendarId: "primary",
        },
      },
      condition: {
        expression: parsed.expression,
        evaluatedFields: ["title", "providerResourceId", "eventId"],
      },
    },
    workflow: {
      version: 1,
      steps: composed.steps,
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 900_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: {
      mode: options?.requireApprovalStep
        ? "review_before_run"
        : "run_then_notify",
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: options?.requireApprovalStep ? ["await_approval"] : [],
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
      freeformNotes: parsed.sourceText,
      structuredOptions: {
        source: "natural_language_condition",
        phase4Composition: composed.composition,
        conditionProvider: parsed.provider,
        conditionEventType: parsed.eventType,
        conditionTitle: parsed.title,
        conditionTriggerVersion: 1,
        requiredExternals: [],
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

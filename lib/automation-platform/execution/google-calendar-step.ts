/**
 * V2 Automation — Google Calendar Production Live step.
 */

import "server-only";

import { googleCalendarLiveAdapter } from "@/lib/integrations/google/calendar/live/adapter";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

export function calendarStepAllowsWithoutApproval(
  step: AutomationWorkflowStep,
): boolean {
  const action = String(
    step.configuration.action ?? step.configuration.mode ?? "create",
  ).toLowerCase();
  if (action !== "create") return false;
  const attendees = step.configuration.attendees ?? step.configuration.guests;
  if (Array.isArray(attendees) && attendees.length > 0) return false;
  if (typeof attendees === "string" && attendees.trim()) return false;
  return true;
}

export async function invokeGoogleCalendarLiveStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
  approved: boolean;
  diagnosticId?: string | null;
  approvalId?: string | null;
}): Promise<StepInvokeResult> {
  const result = await googleCalendarLiveAdapter.execute({
    ownerId: input.userId,
    runId: input.runId,
    stepId: input.step.id,
    diagnosticId: input.diagnosticId ?? input.runId,
    configuration: input.step.configuration,
    inputBindings: input.step.inputBindings,
    approved: input.approved,
    approvalId: input.approvalId ?? null,
  });

  if (!result.ok) {
    return {
      ok: false,
      summary:
        result.connectionHealth === "missing_scope"
          ? "Google Calendarの権限が不足しています。再接続が必要です"
          : result.connectionHealth === "reconnect_required" ||
              result.connectionHealth === "expired" ||
              result.connectionHealth === "revoked"
            ? "Google Calendarの再接続が必要です"
            : result.errorCode === "calendar_invalid_datetime"
              ? "日時が不正です"
              : result.errorCode === "calendar_invalid_attendee"
                ? "参加者が不正です"
                : result.errorCode === "calendar_conflict"
                  ? "同一時間帯に予定が重複しています"
                  : result.retryable
                    ? "Google Calendar操作を再試行します"
                    : "Google Calendar操作に失敗しました",
      artifacts: [],
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      failedStage: "EXTERNAL_ADAPTER_EXECUTION",
      retryable: result.retryable,
      needsUserInput: result.needsUserInput,
    };
  }

  const action = result.action;

  if (result.awaitingApproval) {
    return {
      ok: false,
      summary: [
        "Google Calendar予定の承認待ちです。",
        `タイトル: ${result.title}`,
        `日時: ${action.startDateTime}〜${action.endDateTime} (${action.timezone})`,
        `参加者数: ${result.attendeeCount}`,
      ].join(" "),
      artifacts: [],
      errorCode: "automation_approval_required",
      errorMessage: "外部参加者への招待・更新・取消は承認後のみ実行できます",
      failedStage: "APPROVAL",
      retryable: false,
      needsUserInput: true,
      evidence: {
        adapterMode: action.adapterMode,
        environment: action.environment,
        calendar: {
          service: "google_calendar",
          action: action.action,
          calendarId: action.calendarId,
          eventId: null,
          htmlLink: null,
          hangoutLink: null,
          startDateTime: action.startDateTime,
          endDateTime: action.endDateTime,
          timezone: action.timezone,
          attendeeHash: action.attendeeHash,
          completedAt: action.completedAt,
          resultHash: action.resultHash,
          retryCount: action.retryCount,
          duplicatePrevented: action.duplicatePrevented,
          adapterMode: action.adapterMode,
          environment: action.environment,
          approvalId: action.approvalId,
          providerRequestId: action.providerRequestId,
        },
      },
    };
  }

  if (!action.eventId || action.eventId.startsWith("pending_")) {
    return {
      ok: false,
      summary: "Google Calendarの完了証拠が不足しています",
      artifacts: [],
      errorCode: "external_action_id_required",
      errorMessage: "eventId missing after Calendar operation",
      failedStage: "EXTERNAL_RESULT_VALIDATION",
      retryable: false,
    };
  }

  const externalArtifact = {
    id: action.externalActionId,
    kind: "external" as const,
    label: result.title,
    url: action.htmlLink,
    externalId: action.eventId,
    createdAt: action.completedAt,
  };

  const isCancel = action.action === "cancel";
  const isUpdate = action.action === "update";

  return {
    ok: true,
    summary: action.duplicatePrevented
      ? isCancel
        ? `Google Calendar取消済みの結果を再利用しました（eventId: ${action.eventId}）`
        : `Google Calendar登録済みの結果を再利用しました（eventId: ${action.eventId}）`
      : isCancel
        ? [
            "予定をキャンセルしました",
            `タイトル: ${result.title}`,
            `日時: ${action.startDateTime}〜${action.endDateTime}`,
          ].join(" ")
        : isUpdate
          ? [
              "予定を更新しました",
              result.changedFields?.length
                ? `変更項目: ${result.changedFields.join(", ")}`
                : "",
              action.htmlLink ? `URL: ${action.htmlLink}` : "",
            ]
              .filter(Boolean)
              .join(" ")
          : [
              "Google Calendarへ予定を登録しました",
              `タイトル: ${result.title}`,
              `日時: ${action.startDateTime}〜${action.endDateTime} (${action.timezone})`,
              `参加者数: ${result.attendeeCount}`,
              action.htmlLink ? `URL: ${action.htmlLink}` : "",
              action.hangoutLink ? `Meet: ${action.hangoutLink}` : "",
            ]
              .filter(Boolean)
              .join(" "),
    artifacts: [externalArtifact],
    evidence: {
      externalActionIds: [action.eventId],
      externalUrls: action.htmlLink ? [action.htmlLink] : [],
      adapterMode: action.adapterMode,
      environment: action.environment,
      calendar: {
        service: "google_calendar",
        action: action.action,
        calendarId: action.calendarId,
        eventId: action.eventId,
        htmlLink: action.htmlLink,
        hangoutLink: action.hangoutLink,
        startDateTime: action.startDateTime,
        endDateTime: action.endDateTime,
        timezone: action.timezone,
        attendeeHash: action.attendeeHash,
        completedAt: action.completedAt,
        resultHash: action.resultHash,
        retryCount: action.retryCount,
        duplicatePrevented: action.duplicatePrevented,
        adapterMode: action.adapterMode,
        environment: action.environment,
        approvalId: action.approvalId,
        providerRequestId: action.providerRequestId,
      },
    },
  };
}

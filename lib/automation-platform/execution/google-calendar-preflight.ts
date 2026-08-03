/**
 * Preflight for Automations that include google_calendar steps.
 */

import "server-only";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { validateCalendarConnection } from "@/lib/integrations/google/calendar/live/connection";
import { validateCalendarDateTime } from "@/lib/integrations/google/calendar/live/datetime";
import { resolveCalendarAttendees } from "@/lib/integrations/google/calendar/live/attendees";
import { resolveCalendarRecurrence } from "@/lib/integrations/google/calendar/live/recurrence";

export type CalendarPreflightIssue = {
  stepId: string;
  errorCode: string;
  message: string;
};

export async function assertGoogleCalendarPreflightForActivation(input: {
  userId: string;
  steps: ReadonlyArray<{
    id: string;
    type: string;
    enabled: boolean;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}): Promise<CalendarPreflightIssue[]> {
  const calendarSteps = input.steps.filter(
    (step) => step.enabled && step.type === "google_calendar",
  );
  if (calendarSteps.length === 0) return [];

  const issues: CalendarPreflightIssue[] = [];

  if (!isLiveAdapterWired("google_calendar")) {
    for (const step of calendarSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "live_adapter_missing",
        message: "Google Calendar Production Adapterが未登録です",
      });
    }
    return issues;
  }

  const connection = await validateCalendarConnection(input.userId);
  if (!connection.ready) {
    for (const step of calendarSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_integration_required",
        message:
          connection.message ??
          "Google Calendar連携が connected ではないため有効化できません",
      });
    }
    return issues;
  }

  for (const step of calendarSteps) {
    const cfg = step.configuration ?? {};
    const action = String(cfg.action ?? "create").toLowerCase();
    const title =
      typeof cfg.title === "string"
        ? cfg.title
        : typeof cfg.eventTitle === "string"
          ? cfg.eventTitle
          : "";
    if (action !== "cancel" && action !== "delete" && !title.trim()) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "予定タイトルが設定されていません",
      });
    }
    if ((action === "update" || action === "cancel" || action === "delete") && !cfg.eventId) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "更新・取消には eventId が必要です",
      });
    }

    if (action !== "cancel" && action !== "delete") {
      try {
        validateCalendarDateTime({
          startDateTime: String(cfg.startDateTime ?? cfg.startAt ?? ""),
          endDateTime: String(cfg.endDateTime ?? cfg.endAt ?? ""),
          timezone: String(cfg.timezone ?? cfg.timeZone ?? "Asia/Tokyo"),
          allDay: cfg.allDay === true || cfg.isAllDay === true,
        });
      } catch (error) {
        issues.push({
          stepId: step.id,
          errorCode: "automation_invalid_definition",
          message:
            error instanceof Error ? error.message : "日時が不正です",
        });
      }
    }

    try {
      resolveCalendarAttendees({
        attendees: cfg.attendees ?? cfg.guests,
        ownerEmail: connection.accountEmail,
      });
    } catch (error) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message:
          error instanceof Error ? error.message : "参加者が不正です",
      });
    }

    try {
      resolveCalendarRecurrence(cfg.recurrence);
    } catch (error) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message:
          error instanceof Error ? error.message : "繰り返し設定が不正です",
      });
    }
  }

  return issues;
}

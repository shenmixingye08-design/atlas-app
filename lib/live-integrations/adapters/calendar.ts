/**
 * Live Google Calendar adapter — create / update / delete with attendees,
 * reminder, timezone, and duplicate prevention.
 */

import "server-only";

import {
  createCalendarEventForUser,
  deleteCalendarEventForUser,
  updateCalendarEventForUser,
} from "@/lib/integrations/google/calendar/service";
import type { CalendarEventInput } from "@/lib/integrations/google/calendar/types";
import { resolveFeatureAccessContextForUser } from "@/lib/live-integrations/context";
import {
  claimLiveActionOnce,
  fingerprintLiveAction,
} from "@/lib/live-integrations/duplicate";
import { withLiveRetry } from "@/lib/live-integrations/retry";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

export type CalendarLiveInput = {
  action: "create" | "update" | "delete";
  eventId?: string;
  event?: CalendarEventInput;
};

function fail(
  summary: string,
  opts?: Partial<LiveAdapterResult>,
): LiveAdapterResult {
  return {
    ok: false,
    summary,
    externalId: null,
    url: null,
    errorCode: opts?.errorCode ?? "execution_failed",
    errorMessage: opts?.errorMessage ?? summary,
    needsReconnect: opts?.needsReconnect ?? false,
    retryable: opts?.retryable ?? false,
    skippedDuplicate: opts?.skippedDuplicate ?? false,
  };
}

function ok(
  summary: string,
  externalId: string | null,
  url: string | null = null,
): LiveAdapterResult {
  return {
    ok: true,
    summary,
    externalId,
    url,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  };
}

export async function executeCalendarLive(
  userId: string,
  input: CalendarLiveInput,
): Promise<LiveAdapterResult> {
  const status = await getLiveIntegrationStatus(userId, "google_calendar");
  if (status.status !== "connected") {
    return fail(status.message, {
      errorCode: status.status,
      needsReconnect: status.status !== "not_connected",
    });
  }

  const context = await resolveFeatureAccessContextForUser(userId);

  if (input.action === "delete") {
    if (!input.eventId) {
      return fail("削除する予定IDがありません", { errorCode: "invalid_input" });
    }
    try {
      const result = await withLiveRetry(
        () =>
          deleteCalendarEventForUser({
            userId,
            context,
            eventId: input.eventId!,
          }),
        "calendar.delete",
      );
      if (result.status !== "ready") {
        return fail(result.message, {
          errorCode: result.status,
          needsReconnect: result.status === "needs_reconnect",
        });
      }
      return ok("カレンダー予定を削除しました", input.eventId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "予定の削除に失敗しました";
      return fail(message.slice(0, 280), { retryable: true });
    }
  }

  if (!input.event) {
    return fail("予定内容がありません", { errorCode: "invalid_input" });
  }

  const fingerprint = fingerprintLiveAction({
    userId,
    service: "google_calendar",
    action: input.action,
    target: input.event.startAt,
    content: `${input.event.title}|${input.event.endAt}|${(input.event.attendees ?? []).join(",")}`,
  });
  if (input.action === "create") {
    const claim = claimLiveActionOnce(fingerprint);
    if (claim.duplicate) {
      return fail("同じ内容の予定が短時間に重複したため作成を停止しました。", {
        errorCode: "duplicate_prevented",
        skippedDuplicate: true,
      });
    }
  }

  try {
    if (input.action === "update") {
      if (!input.eventId) {
        return fail("更新する予定IDがありません", {
          errorCode: "invalid_input",
        });
      }
      const result = await withLiveRetry(
        () =>
          updateCalendarEventForUser({
            userId,
            context,
            eventId: input.eventId!,
            event: input.event!,
          }),
        "calendar.update",
      );
      if (result.status !== "ready") {
        return fail(result.message, {
          errorCode: result.status,
          needsReconnect: result.status === "needs_reconnect",
        });
      }
      return ok(
        "カレンダー予定を更新しました",
        result.event.id,
        result.event.htmlLink,
      );
    }

    const result = await withLiveRetry(
      () =>
        createCalendarEventForUser({
          userId,
          context,
          event: input.event!,
        }),
      "calendar.create",
    );
    if (result.status !== "ready") {
      return fail(result.message, {
        errorCode: result.status,
        needsReconnect: result.status === "needs_reconnect",
      });
    }
    return ok(
      "カレンダー予定を作成しました",
      result.event.id,
      result.event.htmlLink,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "カレンダー処理に失敗しました";
    const auth = /expired|reconnect|unauthorized|401|insufficient/i.test(
      message,
    );
    return fail(message.slice(0, 280), {
      errorCode: auth ? "auth_failed" : "execution_failed",
      needsReconnect: auth,
      retryable: !auth,
    });
  }
}

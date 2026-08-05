import "server-only";

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "@/lib/integrations/google/calendar/api-client";
import type { CalendarEvent, CalendarEventInput } from "@/lib/integrations/google/calendar/types";
import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { runIntegrationAction } from "@/lib/integrations/production/execute";

export type ProductionCalendarMutation =
  | {
      kind: "create";
      userId: string;
      accessToken: string;
      event: CalendarEventInput;
      calendarId?: string;
      requestId?: string;
    }
  | {
      kind: "update";
      userId: string;
      accessToken: string;
      eventId: string;
      event: CalendarEventInput;
      calendarId?: string;
      requestId?: string;
    }
  | {
      kind: "delete";
      userId: string;
      accessToken: string;
      eventId: string;
      calendarId?: string;
      requestId?: string;
    };

export async function mutateCalendarProduction(
  input: ProductionCalendarMutation,
): Promise<{
  value: CalendarEvent | { deleted: true; eventId: string };
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const fingerprint =
    input.kind === "delete"
      ? `delete|${input.eventId}|${input.calendarId ?? "primary"}`
      : [
          input.kind,
          input.kind === "update" ? input.eventId : "",
          input.event.title,
          input.event.startAt,
          input.event.endAt,
          input.event.timeZone ?? "",
          (input.event.attendees ?? []).map((a) => a.email).join(","),
          String(input.event.remindMinutesBefore ?? ""),
          input.calendarId ?? "primary",
        ].join("|");

  const idempotencyKey = buildIdempotencyKey({
    integration: "google_calendar",
    action: input.kind,
    userId: input.userId,
    fingerprint,
  });

  const executed = await runIntegrationAction(
    {
      integration: "google_calendar",
      action: input.kind,
      userId: input.userId,
      idempotencyKey,
      requestId: input.requestId,
      preventDuplicate: true,
    },
    async () => {
      if (input.kind === "create") {
        return createGoogleCalendarEvent({
          accessToken: input.accessToken,
          event: input.event,
          calendarId: input.calendarId,
        });
      }
      if (input.kind === "update") {
        return updateGoogleCalendarEvent({
          accessToken: input.accessToken,
          eventId: input.eventId,
          event: input.event,
          calendarId: input.calendarId,
        });
      }
      await deleteGoogleCalendarEvent({
        accessToken: input.accessToken,
        eventId: input.eventId,
        calendarId: input.calendarId,
      });
      return { deleted: true as const, eventId: input.eventId };
    },
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
    duplicate: executed.duplicate,
    retry: executed.retry,
  };
}

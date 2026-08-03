/**
 * Google Calendar Production Live Adapter.
 * Never falls back to sandbox/mock success.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { validateCalendarConnection, validateCalendarScopes } from "./connection";
import {
  buildCalendarResultHash,
  findCalendarActionByIdempotency,
  saveCalendarExternalAction,
} from "./idempotency";
import { hashCalendarTitle, resolveCalendarStepInput } from "./input";
import { hashAttendees } from "./attendees";
import {
  recordCalendarApprovalWait,
  recordCalendarCancel,
  recordCalendarConflictDetected,
  recordCalendarCreate,
  recordCalendarDuplicatePrevented,
  recordCalendarFailure,
  recordCalendarInvalidAttendee,
  recordCalendarInvalidDate,
  recordCalendarRetry,
  recordCalendarScopeError,
  recordCalendarSuccess,
  recordCalendarTokenRefresh,
  recordCalendarUpdate,
  recordCalendarVerificationFailure,
} from "./metrics";
import {
  cancelAndVerifyCalendarEvent,
  createAndVerifyCalendarEvent,
  getCalendarEvent,
  listConflictingEvents,
  updateAndVerifyCalendarEvent,
} from "./operations";
import { classifyCalendarProviderError, withCalendarRetry } from "./retry";
import {
  CALENDAR_ADAPTER_MODE,
  type CalendarAdapterResult,
  type CalendarExternalAction,
  type CalendarLiveAction,
} from "./types";

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function toAction(input: {
  action: CalendarLiveAction;
  calendarId: string;
  eventId: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  titleHash: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  attendeeHash: string;
  status: CalendarExternalAction["status"];
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  diagnosticId: string;
  approvalId: string | null;
  conflictWarned: boolean;
  duplicatePrevented?: boolean;
}): CalendarExternalAction {
  const resultHash = buildCalendarResultHash({
    action: input.action,
    calendarId: input.calendarId,
    eventId: input.eventId,
    htmlLink: input.htmlLink,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    timezone: input.timezone,
    titleHash: input.titleHash,
    attendeeHash: input.attendeeHash,
  });
  return {
    externalActionId: `gcal_${randomUUID()}`,
    service: "google_calendar",
    action: input.action,
    calendarId: input.calendarId,
    eventId: input.eventId,
    htmlLink: input.htmlLink,
    hangoutLink: input.hangoutLink,
    titleHash: input.titleHash,
    startDateTime: input.startDateTime,
    endDateTime: input.endDateTime,
    timezone: input.timezone,
    attendeeHash: input.attendeeHash,
    status: input.status,
    adapterMode: CALENDAR_ADAPTER_MODE,
    environment: resolveEnvironment(),
    providerRequestId: input.eventId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retryCount: input.retryCount,
    idempotencyKey: input.idempotencyKey,
    diagnosticId: input.diagnosticId,
    resultHash,
    duplicatePrevented: input.duplicatePrevented ?? false,
    approvalId: input.approvalId,
    conflictWarned: input.conflictWarned,
  };
}

export const googleCalendarLiveAdapter = {
  mode: CALENDAR_ADAPTER_MODE,

  async validateConnection(ownerId: string) {
    return validateCalendarConnection(ownerId);
  },

  async validateScopes(ownerId: string) {
    return validateCalendarScopes(ownerId);
  },

  async refreshToken(ownerId: string) {
    const result = await validateCalendarConnection(ownerId);
    if (result.refreshed) recordCalendarTokenRefresh();
    return result;
  },

  async getEvent(input: {
    accessToken: string;
    calendarId: string;
    eventId: string;
  }) {
    return getCalendarEvent(input);
  },

  async listConflictingEvents(input: {
    accessToken: string;
    calendarId: string;
    startDateTime: string;
    endDateTime: string;
    timezone: string;
    allDay: boolean;
  }) {
    return listConflictingEvents(input);
  },

  async execute(input: {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
    diagnosticId?: string | null;
    configuration: Readonly<Record<string, unknown>>;
    inputBindings: Readonly<Record<string, unknown>>;
    approved: boolean;
    approvalId?: string | null;
    occurrenceKey?: string | null;
  }): Promise<CalendarAdapterResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let retryCount = 0;
    let parsedAction: CalendarLiveAction = "create";

    try {
      const connection = await this.validateConnection(input.ownerId);
      if (connection.refreshed) recordCalendarTokenRefresh();
      if (!connection.ready || !connection.accessToken) {
        if (connection.health === "missing_scope") recordCalendarScopeError();
        recordCalendarFailure();
        return {
          ok: false,
          errorCode:
            connection.health === "missing_scope"
              ? "calendar_missing_scope"
              : connection.health === "disconnected"
                ? "calendar_not_connected"
                : "calendar_reconnect_required",
          errorMessage: connection.message ?? "Google Calendar is not ready",
          retryable: false,
          connectionHealth: connection.health,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      let step;
      try {
        step = resolveCalendarStepInput({
          ownerId: input.ownerId,
          organizationId: input.organizationId,
          runId: input.runId,
          stepId: input.stepId,
          diagnosticId: input.diagnosticId,
          configuration: input.configuration,
          inputBindings: input.inputBindings,
          ownerEmail: connection.accountEmail,
          occurrenceKey: input.occurrenceKey,
        });
        parsedAction = step.action;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "invalid calendar input";
        if (/attendee/i.test(message)) recordCalendarInvalidAttendee();
        if (/datetime/i.test(message)) recordCalendarInvalidDate();
        recordCalendarFailure();
        return {
          ok: false,
          errorCode: /attendee/i.test(message)
            ? "calendar_invalid_attendee"
            : /datetime/i.test(message)
              ? "calendar_invalid_datetime"
              : "calendar_invalid_input",
          errorMessage: message,
          retryable: false,
          retryCount: 0,
        };
      }

      const existing = await findCalendarActionByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: step.idempotencyKey,
      });
      if (existing) {
        if (existing.status === "awaiting_approval" && !input.approved) {
          recordCalendarDuplicatePrevented();
          recordCalendarApprovalWait();
          recordCalendarSuccess();
          return {
            ok: true,
            awaitingApproval: true,
            title: step.title,
            attendeeCount: step.attendees.length,
            action: { ...existing, duplicatePrevented: true },
          };
        }
        if (existing.status !== "awaiting_approval") {
          if (existing.action !== "cancel") {
            const verified = await getCalendarEvent({
              accessToken: connection.accessToken,
              calendarId: existing.calendarId,
              eventId: existing.eventId,
            });
            if (
              verified.id !== existing.eventId ||
              (existing.status === "verified" && verified.status === "cancelled")
            ) {
              recordCalendarVerificationFailure();
              throw new Error(
                "verification failed: idempotent event not re-fetchable",
              );
            }
          }
          recordCalendarDuplicatePrevented();
          if (existing.action === "create") {
            recordCalendarCreate(Date.now() - startedMs);
          } else if (existing.action === "update") {
            recordCalendarUpdate(Date.now() - startedMs);
          } else {
            recordCalendarCancel(Date.now() - startedMs);
          }
          recordCalendarSuccess();
          return {
            ok: true,
            awaitingApproval: false,
            title: step.title,
            attendeeCount: step.attendees.length,
            action: { ...existing, duplicatePrevented: true },
          };
        }
      }

      // Approval gate: never invite external attendees before approval.
      if (
        step.approvalRequired &&
        !input.approved &&
        (step.attendees.length > 0 ||
          step.action === "update" ||
          step.action === "cancel")
      ) {
        const pending = toAction({
          action: step.action,
          calendarId: step.calendarId,
          eventId: step.eventId ?? `pending_${step.idempotencyKey.slice(0, 12)}`,
          htmlLink: null,
          hangoutLink: null,
          titleHash: hashCalendarTitle(step.title),
          startDateTime: step.startDateTime,
          endDateTime: step.endDateTime,
          timezone: step.timezone,
          attendeeHash: hashAttendees(step.attendees),
          status: "awaiting_approval",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount: 0,
          idempotencyKey: step.idempotencyKey,
          diagnosticId: step.diagnosticId,
          approvalId: null,
          conflictWarned: false,
        });
        await saveCalendarExternalAction({
          ...pending,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordCalendarApprovalWait();
        recordCalendarSuccess();
        return {
          ok: true,
          awaitingApproval: true,
          title: step.title,
          attendeeCount: step.attendees.length,
          action: pending,
        };
      }

      let conflictWarned = false;
      if (step.action === "create") {
        const conflicts = await listConflictingEvents({
          accessToken: connection.accessToken,
          calendarId: step.calendarId,
          startDateTime: step.startDateTime,
          endDateTime: step.endDateTime,
          timezone: step.timezone,
          allDay: step.allDay,
        });
        if (conflicts.length > 0) {
          recordCalendarConflictDetected();
          if (step.conflictPolicy === "fail") {
            recordCalendarFailure();
            return {
              ok: false,
              errorCode: "calendar_conflict",
              errorMessage: `同一時間帯に ${conflicts.length} 件の予定があります`,
              retryable: false,
              retryCount: 0,
            };
          }
          if (step.conflictPolicy === "warn") {
            conflictWarned = true;
          }
        }

        const retried = await withCalendarRetry(async () =>
          createAndVerifyCalendarEvent({
            accessToken: connection.accessToken!,
            step,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordCalendarRetry();
        }
        const event = retried.value;
        const action = toAction({
          action: "create",
          calendarId: step.calendarId,
          eventId: event.id,
          htmlLink: event.htmlLink,
          hangoutLink: event.hangoutLink,
          titleHash: hashCalendarTitle(step.title),
          startDateTime: step.startDateTime,
          endDateTime: step.endDateTime,
          timezone: step.timezone,
          attendeeHash: hashAttendees(step.attendees),
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: step.idempotencyKey,
          diagnosticId: step.diagnosticId,
          approvalId: input.approvalId ?? null,
          conflictWarned,
        });
        await saveCalendarExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordCalendarCreate(Date.now() - startedMs);
        recordCalendarSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          title: step.title,
          attendeeCount: step.attendees.length,
          action,
        };
      }

      if (step.action === "update") {
        const retried = await withCalendarRetry(async () =>
          updateAndVerifyCalendarEvent({
            accessToken: connection.accessToken!,
            step,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordCalendarRetry();
        }
        const { event, changedFields } = retried.value;
        const action = toAction({
          action: "update",
          calendarId: step.calendarId,
          eventId: event.id,
          htmlLink: event.htmlLink,
          hangoutLink: event.hangoutLink,
          titleHash: hashCalendarTitle(step.title),
          startDateTime: step.startDateTime,
          endDateTime: step.endDateTime,
          timezone: step.timezone,
          attendeeHash: hashAttendees(step.attendees),
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: step.idempotencyKey,
          diagnosticId: step.diagnosticId,
          approvalId: input.approvalId ?? null,
          conflictWarned: false,
        });
        await saveCalendarExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordCalendarUpdate(Date.now() - startedMs);
        recordCalendarSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          title: step.title,
          attendeeCount: step.attendees.length,
          changedFields,
          action,
        };
      }

      // cancel
      const retried = await withCalendarRetry(async () =>
        cancelAndVerifyCalendarEvent({
          accessToken: connection.accessToken!,
          calendarId: step.calendarId,
          eventId: step.eventId!,
          sendUpdates: step.sendUpdates,
        }),
      );
      retryCount = retried.retryCount;
      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i += 1) recordCalendarRetry();
      }
      const cancelled = retried.value;
      const action = toAction({
        action: "cancel",
        calendarId: step.calendarId,
        eventId: cancelled.eventId,
        htmlLink: null,
        hangoutLink: null,
        titleHash: hashCalendarTitle(step.title),
        startDateTime: step.startDateTime,
        endDateTime: step.endDateTime,
        timezone: step.timezone,
        attendeeHash: hashAttendees(step.attendees),
        status: "cancelled",
        startedAt,
        completedAt: new Date().toISOString(),
        retryCount,
        idempotencyKey: step.idempotencyKey,
        diagnosticId: step.diagnosticId,
        approvalId: input.approvalId ?? null,
        conflictWarned: false,
        duplicatePrevented: cancelled.alreadyCancelled,
      });
      await saveCalendarExternalAction({
        ...action,
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        runId: input.runId,
        stepId: input.stepId,
      });
      recordCalendarCancel(Date.now() - startedMs);
      recordCalendarSuccess();
      return {
        ok: true,
        awaitingApproval: false,
        title: step.title,
        attendeeCount: step.attendees.length,
        action,
      };
    } catch (error) {
      const classified = classifyCalendarProviderError(error);
      if (/verification failed/i.test(
        error instanceof Error ? error.message : String(error),
      )) {
        recordCalendarVerificationFailure();
      }
      if (parsedAction === "create") recordCalendarCreate(Date.now() - startedMs);
      else if (parsedAction === "update") {
        recordCalendarUpdate(Date.now() - startedMs);
      } else recordCalendarCancel(Date.now() - startedMs);
      recordCalendarFailure();
      return {
        ok: false,
        errorCode: classified.errorCode,
        errorMessage:
          error instanceof Error ? error.message : "Calendar operation failed",
        retryable: classified.retryable,
        retryCount,
      };
    }
  },
};

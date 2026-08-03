import { createHash } from "node:crypto";

import { hashAttendees, resolveCalendarAttendees } from "./attendees";
import { validateCalendarDateTime } from "./datetime";
import { resolveCalendarRecurrence } from "./recurrence";
import { resolveCalendarReminders } from "./reminders";
import {
  CALENDAR_ACTIONS,
  CALENDAR_CONFLICT_POLICIES,
  DEFAULT_CALENDAR_CONFLICT_POLICY,
  type CalendarConflictPolicy,
  type CalendarLiveAction,
  type CalendarStepInput,
} from "./types";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveAction(
  configuration: Readonly<Record<string, unknown>>,
): CalendarLiveAction {
  const raw = (
    asString(configuration.action) ?? asString(configuration.mode) ?? "create"
  ).toLowerCase();
  if (raw === "delete" || raw === "cancel") return "cancel";
  if ((CALENDAR_ACTIONS as readonly string[]).includes(raw)) {
    return raw as CalendarLiveAction;
  }
  throw new Error(`calendar invalid action: ${raw}`);
}

export function hashCalendarTitle(title: string): string {
  return createHash("sha256").update(title).digest("hex");
}

export function buildCalendarIdempotencyKey(input: {
  ownerId: string;
  runId: string;
  stepId: string;
  calendarId: string;
  action: CalendarLiveAction;
  titleHash: string;
  startDateTime: string;
  endDateTime: string;
  attendeeHash: string;
  occurrenceKey?: string | null;
  explicitKey?: string | null;
}): string {
  if (input.explicitKey?.trim()) {
    return `${input.action}:${input.explicitKey.trim()}`;
  }
  return createHash("sha256")
    .update(
      [
        input.ownerId,
        input.runId,
        input.stepId,
        input.calendarId,
        input.action,
        input.titleHash,
        input.startDateTime,
        input.endDateTime,
        input.attendeeHash,
        input.occurrenceKey ?? "",
      ].join("|"),
    )
    .digest("hex");
}

export function resolveCalendarStepInput(input: {
  ownerId: string;
  organizationId?: string | null;
  runId: string;
  stepId: string;
  diagnosticId?: string | null;
  configuration: Readonly<Record<string, unknown>>;
  inputBindings: Readonly<Record<string, unknown>>;
  ownerEmail?: string | null;
  occurrenceKey?: string | null;
}): CalendarStepInput {
  const cfg = { ...input.inputBindings, ...input.configuration };
  const action = resolveAction(cfg);

  const title =
    asString(cfg.title) ??
    asString(cfg.eventTitle) ??
    asString(cfg.summary);
  if (!title && action !== "cancel") {
    throw new Error("calendar invalid input: title is required");
  }

  const calendarId = asString(cfg.calendarId) ?? "primary";
  const eventId = asString(cfg.eventId);

  if ((action === "update" || action === "cancel") && !eventId) {
    throw new Error("calendar invalid input: eventId required for update/cancel");
  }

  const allDay = cfg.allDay === true || cfg.isAllDay === true;
  const timezone =
    asString(cfg.timezone) ?? asString(cfg.timeZone) ?? "Asia/Tokyo";

  let startDateTime = asString(cfg.startDateTime) ?? asString(cfg.startAt) ?? "";
  let endDateTime = asString(cfg.endDateTime) ?? asString(cfg.endAt) ?? "";

  if (action !== "cancel") {
    const validated = validateCalendarDateTime({
      startDateTime,
      endDateTime,
      timezone,
      allDay,
    });
    startDateTime = validated.startDateTime;
    endDateTime = validated.endDateTime;
  }

  const attendeeResolved = resolveCalendarAttendees({
    attendees: cfg.attendees ?? cfg.guests,
    ownerEmail: input.ownerEmail,
  });
  const reminders = resolveCalendarReminders(
    cfg.reminders ?? cfg.remindMinutesBefore,
  );
  const recurrence = resolveCalendarRecurrence(cfg.recurrence);

  const conferenceRaw = asString(cfg.conferenceType) ?? (cfg.createMeet === true ? "hangoutsMeet" : null);
  const conferenceType =
    conferenceRaw === "hangoutsMeet" || conferenceRaw === "meet"
      ? "hangoutsMeet"
      : null;

  const conflictRaw = asString(cfg.conflictPolicy) ?? DEFAULT_CALENDAR_CONFLICT_POLICY;
  if (!(CALENDAR_CONFLICT_POLICIES as readonly string[]).includes(conflictRaw)) {
    throw new Error("calendar invalid conflictPolicy");
  }

  const sendUpdatesRaw = (asString(cfg.sendUpdates) ?? "all").toLowerCase();
  const sendUpdates =
    sendUpdatesRaw === "none" || sendUpdatesRaw === "externalonly"
      ? (sendUpdatesRaw === "none" ? "none" : "externalOnly")
      : "all";

  const visibilityRaw = (asString(cfg.visibility) ?? "default").toLowerCase();
  const visibility =
    visibilityRaw === "public" || visibilityRaw === "private"
      ? visibilityRaw
      : "default";

  const transparencyRaw = (asString(cfg.transparency) ?? "opaque").toLowerCase();
  const transparency =
    transparencyRaw === "transparent" ? "transparent" : "opaque";

  const approvalRequired =
    cfg.approvalRequired === false || cfg.approvalRequired === "false"
      ? false
      : attendeeResolved.hasExternal ||
        action === "update" ||
        action === "cancel";

  const titleValue = title ?? "(cancelled)";
  const titleHash = hashCalendarTitle(titleValue);
  const attendeeHash = hashAttendees(attendeeResolved.attendees);

  return {
    action,
    calendarId,
    eventId,
    title: titleValue,
    description: asString(cfg.description),
    location: asString(cfg.location),
    startDateTime,
    endDateTime,
    timezone,
    allDay,
    attendees: attendeeResolved.attendees,
    reminders,
    recurrence,
    conferenceType,
    visibility,
    transparency,
    sendUpdates,
    conflictPolicy: conflictRaw as CalendarConflictPolicy,
    conferenceRequired: cfg.conferenceRequired === true,
    approvalRequired,
    idempotencyKey: buildCalendarIdempotencyKey({
      ownerId: input.ownerId,
      runId: input.runId,
      stepId: input.stepId,
      calendarId,
      action,
      titleHash,
      startDateTime,
      endDateTime,
      attendeeHash,
      occurrenceKey: input.occurrenceKey,
      explicitKey: asString(cfg.idempotencyKey),
    }),
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId,
    stepId: input.stepId,
    diagnosticId: input.diagnosticId?.trim() || input.runId,
  };
}

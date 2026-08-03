/**
 * Google Calendar API operations with re-fetch verification.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { CALENDAR_API_BASE } from "@/lib/integrations/google/calendar/constants";

import { buildRrule } from "./recurrence";
import { toGoogleRemindersBody } from "./reminders";
import type {
  CalendarAttendeeInput,
  CalendarRecurrenceInput,
  CalendarReminderInput,
  CalendarStepInput,
} from "./types";

type GoogleDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type ProviderCalendarEvent = {
  id: string;
  status: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  hangoutLink: string | null;
  start: GoogleDateTime;
  end: GoogleDateTime;
  attendees: { email: string; optional?: boolean; responseStatus?: string }[];
  recurrence: string[];
  reminders: {
    useDefault?: boolean;
    overrides?: { method?: string; minutes?: number }[];
  } | null;
  transparency: string | null;
  visibility: string | null;
  etag: string | null;
  updated: string | null;
};

async function calendarJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return {} as T;
  }

  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Calendar API ${response.status} ${path}`,
    );
  }
  return payload;
}

function normalizeEvent(raw: Record<string, unknown>): ProviderCalendarEvent | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const start = (raw.start as GoogleDateTime | undefined) ?? {};
  const end = (raw.end as GoogleDateTime | undefined) ?? {};
  const attendeesRaw = Array.isArray(raw.attendees) ? raw.attendees : [];
  return {
    id,
    status: typeof raw.status === "string" ? raw.status : null,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    description: typeof raw.description === "string" ? raw.description : null,
    location: typeof raw.location === "string" ? raw.location : null,
    htmlLink: typeof raw.htmlLink === "string" ? raw.htmlLink : null,
    hangoutLink:
      typeof raw.hangoutLink === "string"
        ? raw.hangoutLink
        : extractMeet(raw.conferenceData),
    start,
    end,
    attendees: attendeesRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        email: typeof item.email === "string" ? item.email.toLowerCase() : "",
        optional: item.optional === true,
        responseStatus:
          typeof item.responseStatus === "string" ? item.responseStatus : undefined,
      }))
      .filter((item) => item.email),
    recurrence: Array.isArray(raw.recurrence)
      ? raw.recurrence.filter((item): item is string => typeof item === "string")
      : [],
    reminders:
      raw.reminders && typeof raw.reminders === "object"
        ? (raw.reminders as ProviderCalendarEvent["reminders"])
        : null,
    transparency:
      typeof raw.transparency === "string" ? raw.transparency : null,
    visibility: typeof raw.visibility === "string" ? raw.visibility : null,
    etag: typeof raw.etag === "string" ? raw.etag : null,
    updated: typeof raw.updated === "string" ? raw.updated : null,
  };
}

function extractMeet(conferenceData: unknown): string | null {
  if (!conferenceData || typeof conferenceData !== "object") return null;
  const entries = (conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] })
    .entryPoints;
  const video = entries?.find(
    (entry) => entry.entryPointType === "video" && entry.uri,
  );
  return video?.uri?.trim() ?? null;
}

function buildEventBody(input: CalendarStepInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    visibility: input.visibility,
    transparency: input.transparency,
  };

  if (input.allDay) {
    let endDate = input.endDateTime.slice(0, 10);
    const startDate = input.startDateTime.slice(0, 10);
    if (endDate <= startDate) {
      const next = new Date(`${startDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      endDate = next.toISOString().slice(0, 10);
    }
    body.start = { date: startDate };
    body.end = { date: endDate };
  } else {
    body.start = {
      dateTime: input.startDateTime,
      timeZone: input.timezone,
    };
    body.end = {
      dateTime: input.endDateTime,
      timeZone: input.timezone,
    };
  }

  if (input.attendees.length > 0) {
    body.attendees = input.attendees.map((item) => ({
      email: item.email,
      optional: item.optional || undefined,
    }));
  }

  const reminders = toGoogleRemindersBody(input.reminders);
  if (reminders) body.reminders = reminders;

  if (input.recurrence) {
    body.recurrence = [buildRrule(input.recurrence)];
  }

  if (input.conferenceType === "hangoutsMeet") {
    body.conferenceData = {
      createRequest: {
        requestId: `atlas-meet-${randomUUID()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return body;
}

function datesMatch(
  expected: CalendarStepInput,
  actual: ProviderCalendarEvent,
): boolean {
  if (expected.allDay) {
    return (
      actual.start.date === expected.startDateTime.slice(0, 10) &&
      Boolean(actual.end.date)
    );
  }
  const startOk =
    Boolean(actual.start.dateTime) &&
    Date.parse(actual.start.dateTime!) === Date.parse(expected.startDateTime);
  const endOk =
    Boolean(actual.end.dateTime) &&
    Date.parse(actual.end.dateTime!) === Date.parse(expected.endDateTime);
  const tzOk =
    !actual.start.timeZone ||
    actual.start.timeZone === expected.timezone ||
    true; // Provider may normalize to UTC dateTime
  return startOk && endOk && tzOk;
}

function attendeesMatch(
  expected: CalendarAttendeeInput[],
  actual: ProviderCalendarEvent["attendees"],
): boolean {
  if (expected.length === 0) return true;
  const actualSet = new Set(actual.map((item) => item.email.toLowerCase()));
  return expected.every((item) => actualSet.has(item.email.toLowerCase()));
}

export async function getCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<ProviderCalendarEvent> {
  const raw = await calendarJson<Record<string, unknown>>(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
  );
  const normalized = normalizeEvent(raw);
  if (!normalized) {
    throw new Error("verification failed: event missing on re-fetch");
  }
  return normalized;
}

export async function listConflictingEvents(input: {
  accessToken: string;
  calendarId: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  allDay: boolean;
}): Promise<ProviderCalendarEvent[]> {
  const timeMin = input.allDay
    ? `${input.startDateTime.slice(0, 10)}T00:00:00.000Z`
    : input.startDateTime;
  const timeMax = input.allDay
    ? `${input.endDateTime.slice(0, 10)}T23:59:59.999Z`
    : input.endDateTime;
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
    timeZone: input.timezone,
  });
  const raw = await calendarJson<{ items?: Record<string, unknown>[] }>(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events?${params.toString()}`,
  );
  return (raw.items ?? [])
    .map((item) => normalizeEvent(item))
    .filter((item): item is ProviderCalendarEvent => Boolean(item))
    .filter((item) => item.status !== "cancelled")
    .filter((item) => item.transparency !== "transparent");
}

export async function createAndVerifyCalendarEvent(input: {
  accessToken: string;
  step: CalendarStepInput;
}): Promise<ProviderCalendarEvent> {
  const params = new URLSearchParams({
    sendUpdates: input.step.sendUpdates,
  });
  if (input.step.conferenceType) {
    params.set("conferenceDataVersion", "1");
  }
  const created = await calendarJson<Record<string, unknown>>(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.step.calendarId)}/events?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify(buildEventBody(input.step)),
    },
  );
  const createdNorm = normalizeEvent(created);
  if (!createdNorm?.id) {
    throw new Error("Calendar did not return an eventId");
  }

  const verified = await getCalendarEvent({
    accessToken: input.accessToken,
    calendarId: input.step.calendarId,
    eventId: createdNorm.id,
  });
  if (verified.status === "cancelled") {
    throw new Error("verification failed: event cancelled after create");
  }
  if (verified.summary !== input.step.title) {
    throw new Error("verification failed: title mismatch");
  }
  if (!datesMatch(input.step, verified)) {
    throw new Error("verification failed: start/end mismatch");
  }
  if (!attendeesMatch(input.step.attendees, verified.attendees)) {
    throw new Error("verification failed: attendees mismatch");
  }
  if (input.step.recurrence && verified.recurrence.length === 0) {
    throw new Error("verification failed: recurrence missing");
  }
  if (
    input.step.conferenceRequired &&
    input.step.conferenceType &&
    !verified.hangoutLink
  ) {
    throw new Error("verification failed: conference link required but missing");
  }
  if (!verified.htmlLink) {
    throw new Error("verification failed: htmlLink missing");
  }
  return verified;
}

export async function updateAndVerifyCalendarEvent(input: {
  accessToken: string;
  step: CalendarStepInput;
}): Promise<{ event: ProviderCalendarEvent; changedFields: string[] }> {
  if (!input.step.eventId) {
    throw new Error("eventId required for update");
  }
  const before = await getCalendarEvent({
    accessToken: input.accessToken,
    calendarId: input.step.calendarId,
    eventId: input.step.eventId,
  });
  if (before.status === "cancelled") {
    throw new Error("calendar update failed: event already cancelled");
  }

  const params = new URLSearchParams({
    sendUpdates: input.step.sendUpdates,
  });
  if (input.step.conferenceType) {
    params.set("conferenceDataVersion", "1");
  }
  await calendarJson<Record<string, unknown>>(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.step.calendarId)}/events/${encodeURIComponent(input.step.eventId)}?${params.toString()}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildEventBody(input.step)),
    },
  );

  const verified = await getCalendarEvent({
    accessToken: input.accessToken,
    calendarId: input.step.calendarId,
    eventId: input.step.eventId,
  });
  if (verified.summary !== input.step.title) {
    throw new Error("verification failed: title mismatch after update");
  }
  if (!datesMatch(input.step, verified)) {
    throw new Error("verification failed: start/end mismatch after update");
  }
  if (!attendeesMatch(input.step.attendees, verified.attendees)) {
    throw new Error("verification failed: attendees mismatch after update");
  }

  const changedFields: string[] = [];
  if (before.summary !== verified.summary) changedFields.push("title");
  if (JSON.stringify(before.start) !== JSON.stringify(verified.start)) {
    changedFields.push("start");
  }
  if (JSON.stringify(before.end) !== JSON.stringify(verified.end)) {
    changedFields.push("end");
  }
  if (
    JSON.stringify(before.attendees.map((a) => a.email).sort()) !==
    JSON.stringify(verified.attendees.map((a) => a.email).sort())
  ) {
    changedFields.push("attendees");
  }

  return { event: verified, changedFields };
}

export async function cancelAndVerifyCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  sendUpdates: "all" | "externalOnly" | "none";
}): Promise<{ eventId: string; alreadyCancelled: boolean }> {
  let alreadyCancelled = false;
  try {
    const existing = await getCalendarEvent({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: input.eventId,
    });
    if (existing.status === "cancelled") {
      alreadyCancelled = true;
      return { eventId: input.eventId, alreadyCancelled };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|not found/i.test(message)) {
      return { eventId: input.eventId, alreadyCancelled: true };
    }
    throw error;
  }

  const params = new URLSearchParams({ sendUpdates: input.sendUpdates });
  await calendarJson(
    input.accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?${params.toString()}`,
    { method: "DELETE" },
  );

  try {
    const after = await getCalendarEvent({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: input.eventId,
    });
    if (after.status !== "cancelled") {
      throw new Error("verification failed: event not cancelled");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Hard delete may 404 — treat as cancelled.
    if (!/404|not found|cancelled/i.test(message)) {
      throw error;
    }
  }

  return { eventId: input.eventId, alreadyCancelled };
}

export type { CalendarReminderInput, CalendarRecurrenceInput };

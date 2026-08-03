/**
 * Attendee validation for Calendar Live Adapter.
 */

import { createHash } from "node:crypto";

import type { CalendarAttendeeInput } from "./types";

const MAX_ATTENDEES = 50;
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function resolveCalendarAttendees(input: {
  attendees: unknown;
  ownerEmail?: string | null;
}): {
  attendees: CalendarAttendeeInput[];
  hasExternal: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const raw: unknown[] = Array.isArray(input.attendees)
    ? input.attendees
    : typeof input.attendees === "string"
      ? input.attendees.split(/[,;]/)
      : [];

  const seen = new Set<string>();
  const attendees: CalendarAttendeeInput[] = [];
  const owner = input.ownerEmail?.trim().toLowerCase() ?? null;

  for (const item of raw) {
    let email = "";
    let optional = false;
    if (typeof item === "string") {
      email = item.trim().toLowerCase();
    } else if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      optional = row.optional === true || row.required === false;
    }
    if (!email) continue;
    if (/[\r\n]/.test(email)) {
      throw new Error("calendar invalid attendee: header injection");
    }
    if (!EMAIL_RE.test(email)) {
      throw new Error(`calendar invalid attendee: ${email}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    if (owner && email === owner) {
      warnings.push("owner_listed_as_attendee");
      continue;
    }
    attendees.push({ email, optional });
  }

  if (attendees.length > MAX_ATTENDEES) {
    throw new Error(`calendar invalid attendee: max ${MAX_ATTENDEES}`);
  }

  return {
    attendees,
    hasExternal: attendees.length > 0,
    warnings,
  };
}

export function hashAttendees(attendees: CalendarAttendeeInput[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        attendees
          .map((item) => ({ email: item.email, optional: item.optional }))
          .sort((a, b) => a.email.localeCompare(b.email)),
      ),
    )
    .digest("hex");
}

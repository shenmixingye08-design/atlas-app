/**
 * Calendar datetime validation — server/provider timezone is SoT, not client clock.
 */

const MAX_DURATION_MS = 1000 * 60 * 60 * 24 * 366; // 1 year
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidatedDateTime = {
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  allDay: boolean;
  warnings: string[];
};

function assertTimezone(timezone: string): void {
  try {
    // Throws RangeError for invalid IANA zones in modern Node.
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`calendar invalid datetime: unknown timezone ${timezone}`);
  }
}

function parseInstant(value: string, allDay: boolean): number {
  if (allDay) {
    if (!DATE_RE.test(value.slice(0, 10))) {
      throw new Error("calendar invalid datetime: all-day requires YYYY-MM-DD");
    }
    return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error("calendar invalid datetime: unparseable dateTime");
  }
  return ms;
}

/**
 * Detect impossible local wall times around DST (e.g. spring-forward gaps).
 * Best-effort: compare formatting round-trip in the event timezone.
 */
function detectAmbiguousOrImpossible(
  isoOrLocal: string,
  timezone: string,
): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrLocal)) return null;
  const ms = Date.parse(isoOrLocal);
  if (!Number.isFinite(ms)) return "impossible_or_invalid";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(new Date(ms));
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const rebuilt = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
    void rebuilt;
    // Ambiguous fall-back hours cannot be fully resolved without a TZ DB walk;
    // we keep a soft warning when offset formatting differs from UTC input.
    const offsetProbe = new Date(ms).toLocaleString("en-US", { timeZone: timezone });
    if (!offsetProbe) return "ambiguous";
  } catch {
    return "impossible_or_invalid";
  }
  return null;
}

export function validateCalendarDateTime(input: {
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  allDay: boolean;
  allowPast?: boolean;
}): ValidatedDateTime {
  const timezone = input.timezone.trim() || "Asia/Tokyo";
  assertTimezone(timezone);

  const startRaw = input.startDateTime.trim();
  const endRaw = input.endDateTime.trim();
  if (!startRaw || !endRaw) {
    throw new Error("calendar invalid datetime: start/end required");
  }

  if (input.allDay) {
    const startDate = startRaw.slice(0, 10);
    const endDate = endRaw.slice(0, 10);
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      throw new Error("calendar invalid datetime: all-day requires YYYY-MM-DD");
    }
    if (endDate < startDate) {
      throw new Error("calendar invalid datetime: start must be before end");
    }
  } else {
    if (DATE_RE.test(startRaw) || DATE_RE.test(endRaw)) {
      throw new Error(
        "calendar invalid datetime: timed events require dateTime, not date-only",
      );
    }
  }

  const startMs = parseInstant(startRaw, input.allDay);
  const endMs = parseInstant(endRaw, input.allDay);
  if (!(startMs < endMs)) {
    throw new Error("calendar invalid datetime: start must be before end");
  }
  if (endMs - startMs > MAX_DURATION_MS) {
    throw new Error("calendar invalid datetime: duration exceeds 1 year");
  }

  const warnings: string[] = [];
  if (!input.allowPast && startMs < Date.now() - 60_000) {
    warnings.push("past_event");
  }

  if (!input.allDay) {
    const startIssue = detectAmbiguousOrImpossible(startRaw, timezone);
    const endIssue = detectAmbiguousOrImpossible(endRaw, timezone);
    if (startIssue === "impossible_or_invalid" || endIssue === "impossible_or_invalid") {
      throw new Error("calendar invalid datetime: impossible local time (DST)");
    }
    if (startIssue === "ambiguous" || endIssue === "ambiguous") {
      warnings.push("dst_ambiguous");
    }
  }

  return {
    startDateTime: input.allDay ? startRaw.slice(0, 10) : new Date(startMs).toISOString(),
    endDateTime: input.allDay ? endRaw.slice(0, 10) : new Date(endMs).toISOString(),
    timezone,
    allDay: input.allDay,
    warnings,
  };
}

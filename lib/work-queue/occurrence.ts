import { createHash } from "node:crypto";

/**
 * Stable occurrence key: automation + scheduled slot (minute precision in TZ).
 * Used for unique constraint → duplicate enqueue = 0.
 */
export function buildOccurrenceKey(input: {
  automationId: string;
  scheduledAt: Date | string;
  timezone?: string;
}): string {
  const at =
    typeof input.scheduledAt === "string"
      ? new Date(input.scheduledAt)
      : input.scheduledAt;
  const tz = input.timezone ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const slot = `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}`;
  return `occ:${input.automationId}:${tz}:${slot}`;
}

export function buildJobIdempotencyKey(occurrenceKey: string): string {
  return `job:${occurrenceKey}`;
}

export function buildStepIdempotencyKey(jobId: string, stepId: string): string {
  return `step:${jobId}:${stepId}`;
}

export function buildDiagnosticId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = createHash("sha256")
    .update(`${prefix}:${stamp}:${Math.random()}`)
    .digest("hex")
    .slice(0, 10);
  return `diag_${prefix}_${stamp}_${rand}`;
}

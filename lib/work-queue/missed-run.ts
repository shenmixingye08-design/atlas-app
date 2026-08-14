/**
 * Missed-run policy for the existing Scheduler SoT.
 * Never marks skipped occurrences as completed.
 */

export const MISSED_RUN_ON_TIME_MS = 60_000;
export const MISSED_RUN_GRACE_MS = 15 * 60_000;
export const MISSED_RUN_MAX_AGE_MS = 24 * 60 * 60_000;

export type DueOccurrenceDisposition =
  | "due"
  | "delayed"
  | "missed"
  | "skipped";

export type DueOccurrenceClassification = {
  disposition: DueOccurrenceDisposition;
  delayMs: number;
  shouldExecute: boolean;
};

/**
 * Classify a due slot relative to now.
 * - due: on-time (within 1 minute of scheduledFor)
 * - delayed: late but within 15 minutes — execute once
 * - missed: 15 minutes–24 hours late — execute once, label missed
 * - skipped: older than 24 hours — do not execute, advance nextRun
 */
export function classifyDueOccurrence(
  scheduledAt: Date | string,
  now: Date | number = new Date(),
): DueOccurrenceClassification {
  const scheduledMs =
    typeof scheduledAt === "string"
      ? Date.parse(scheduledAt)
      : scheduledAt.getTime();
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(scheduledMs) || !Number.isFinite(nowMs)) {
    return { disposition: "skipped", delayMs: 0, shouldExecute: false };
  }
  const delayMs = Math.max(0, nowMs - scheduledMs);
  if (delayMs <= MISSED_RUN_ON_TIME_MS) {
    return { disposition: "due", delayMs, shouldExecute: true };
  }
  if (delayMs <= MISSED_RUN_GRACE_MS) {
    return { disposition: "delayed", delayMs, shouldExecute: true };
  }
  if (delayMs <= MISSED_RUN_MAX_AGE_MS) {
    return { disposition: "missed", delayMs, shouldExecute: true };
  }
  return { disposition: "skipped", delayMs, shouldExecute: false };
}

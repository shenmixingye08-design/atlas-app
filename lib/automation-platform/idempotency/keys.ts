/**
 * Idempotency & occurrence keys for duplicate-run prevention.
 *
 * Layers:
 * - scheduleOccurrenceKey: unique per automation + scheduled wall slot
 * - runKey: logical run identity (may equal occurrence key for schedules)
 * - idempotencyKey: API / client dedupe key
 */

export function buildScheduleOccurrenceKey(input: {
  automationId: string;
  scheduledFor: string;
}): string {
  return `occurrence:${input.automationId}:${input.scheduledFor}`;
}

export function buildRunKey(input: {
  automationId: string;
  triggerType: string;
  scheduledFor?: string | null;
  manualBucket?: string | null;
  /** Phase 4 condition / event occurrence identity */
  occurrenceKey?: string | null;
}): string {
  if (
    (input.triggerType === "condition" || input.triggerType === "event") &&
    input.occurrenceKey?.trim()
  ) {
    return input.occurrenceKey.trim();
  }
  if (input.triggerType === "schedule" && input.scheduledFor) {
    return buildScheduleOccurrenceKey({
      automationId: input.automationId,
      scheduledFor: input.scheduledFor,
    });
  }
  if (input.triggerType === "manual") {
    const bucket = input.manualBucket ?? minuteBucket(Date.now());
    return `manual:${input.automationId}:${bucket}`;
  }
  if (input.triggerType === "retry" && input.scheduledFor) {
    return `retry:${input.automationId}:${input.scheduledFor}`;
  }
  return `run:${input.automationId}:${input.triggerType}:${input.scheduledFor ?? "none"}`;
}

/** Alias kept for call-site clarity — stored in schedule_occurrence_key column. */
export function buildConditionOccurrenceKeyAlias(occurrenceKey: string): string {
  return occurrenceKey;
}

export function buildIdempotencyKey(input: {
  userId: string;
  automationId: string;
  operation: string;
  occurrenceKey?: string | null;
  clientKey?: string | null;
}): string {
  if (input.clientKey?.trim()) {
    return `client:${input.userId}:${input.clientKey.trim()}`;
  }
  if (input.occurrenceKey) {
    return `idemp:${input.userId}:${input.occurrenceKey}`;
  }
  return `idemp:${input.userId}:${input.automationId}:${input.operation}`;
}

export function minuteBucket(nowMs: number): string {
  return String(Math.floor(nowMs / 60_000));
}

/** Distributed lock key hint for schedulers (store implementation may use DB advisory lock). */
export function buildSchedulerLockKey(input: {
  automationId: string;
  scheduledFor: string;
}): string {
  return `lock:automation:${input.automationId}:${input.scheduledFor}`;
}

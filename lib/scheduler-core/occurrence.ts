import { buildOccurrenceKey as buildWorkQueueOccurrenceKey } from "@/lib/work-queue/occurrence";

/**
 * Scheduled occurrence key — automationId + normalized scheduled slot in TZ.
 * DB unique via work-queue (automation_id, occurrence_key) + scheduler history.
 */
export function buildScheduleOccurrenceKey(input: {
  automationId: string;
  scheduledAt: Date | string;
  timezone?: string;
}): string {
  return buildWorkQueueOccurrenceKey(input);
}

/** Manual Run Now — separate key space so it never collides with scheduled slots. */
export function buildManualOccurrenceKey(input: {
  automationId: string;
  requestedAt?: Date;
}): string {
  const at = input.requestedAt ?? new Date();
  return `manual:${input.automationId}:${at.toISOString()}`;
}

import type { WorkflowRunTriggerType } from "@/lib/memory/types/workflow-run";

/** Build a stable idempotency key for scheduled automation ticks. */
export function buildScheduledAutomationIdempotencyKey(input: {
  userId: string;
  automationId: string;
  scheduledAt: string | null;
}): string {
  const slot = input.scheduledAt?.trim() || "due";
  return `automation:${input.userId}:${input.automationId}:${slot}`;
}

/** Manual runs dedupe within the same minute to prevent double-submit. */
export function buildManualAutomationIdempotencyKey(input: {
  userId: string;
  automationId: string;
  nowMs?: number;
}): string {
  const minuteBucket = Math.floor((input.nowMs ?? Date.now()) / 60_000);
  return `manual:${input.userId}:${input.automationId}:${minuteBucket}`;
}

export function buildAutomationIdempotencyKey(input: {
  userId: string;
  automationId: string;
  triggerType: WorkflowRunTriggerType;
  scheduledAt?: string | null;
  nowMs?: number;
}): string {
  if (input.triggerType === "manual") {
    return buildManualAutomationIdempotencyKey({
      userId: input.userId,
      automationId: input.automationId,
      nowMs: input.nowMs,
    });
  }
  return buildScheduledAutomationIdempotencyKey({
    userId: input.userId,
    automationId: input.automationId,
    scheduledAt: input.scheduledAt ?? null,
  });
}

import "server-only";

import { listXPostHistory } from "@/lib/integrations/x/post/history-store";

import { findPendingXPostBySlot } from "./pending-store";

/** Stable key for one scheduled slot of a recurring job. */
export function buildRecurringPostIdempotencyKey(
  jobId: string,
  scheduledAt: string,
): string {
  return `recurring-x:${jobId}:${scheduledAt}`;
}

/**
 * Returns true when this automation slot already produced a successful X post
 * (or a pending approval that must not be regenerated as a second post).
 */
export function hasRecurringSlotAlreadyHandled(input: {
  userId: string;
  automationId: string;
  scheduledAt: string;
}): boolean {
  const pending = findPendingXPostBySlot(
    input.automationId,
    input.scheduledAt,
  );
  if (pending && (pending.status === "posted" || pending.status === "pending")) {
    return true;
  }

  const history = listXPostHistory(input.userId);
  return history.some(
    (row) =>
      row.automationId === input.automationId &&
      row.status === "success" &&
      (row.scheduledFor === input.scheduledAt ||
        // Fallback: same minute window when scheduledFor was not stored.
        Math.abs(
          new Date(row.postedAt).getTime() - new Date(input.scheduledAt).getTime(),
        ) < 60_000),
  );
}

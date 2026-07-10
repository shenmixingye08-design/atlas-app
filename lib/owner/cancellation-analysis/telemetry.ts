import type { PlanId } from "@/lib/billing/plans/types";

import {
  consumePendingCancellationReason,
  recordCancellationEvent,
} from "./store";
import type { CancellationEventSource, CancellationReasonId } from "./types";
import { isCancellationReasonId } from "./registry";

export function recordSubscriptionCancellation(input: {
  userId: string;
  planId: PlanId;
  reasonId?: CancellationReasonId | null;
  source?: CancellationEventSource;
  timestamp?: string;
}): void {
  if (input.planId === "free") return;

  const reasonId =
    input.reasonId ??
    consumePendingCancellationReason(input.userId) ??
    "other";

  recordCancellationEvent({
    userId: input.userId,
    planId: input.planId,
    reasonId,
    source: input.source ?? "stripe_webhook",
    timestamp: input.timestamp,
  });
}

export function parseCancellationReasonId(
  value: unknown,
): CancellationReasonId | null {
  return typeof value === "string" && isCancellationReasonId(value)
    ? value
    : null;
}

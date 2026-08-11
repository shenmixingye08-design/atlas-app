import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";
import { mapOrchestrationToPopularityFeature } from "@/lib/owner/popularity-ranking/telemetry";

import { toAnonymousUserId } from "./id";
import { recordAnonymousUsageEvent } from "./store";

/**
 * Best-effort Owner analytics. Must never fail user-facing orchestration /
 * automation jobs (e.g. missing ATLAS_ANON_SALT in production).
 */
export function recordAnonymousUserActivity(input: {
  userId?: string | null;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  deliverableType?: DeliverableType;
  costUsd: number;
  source?: "orchestration" | "automation";
}): void {
  if (!input.userId) return;

  try {
    const subscription = resolveUserSubscription(input.userId);
    const featureId = mapOrchestrationToPopularityFeature({
      assignment: input.assignment,
      metadata: input.metadata,
      deliverableType: input.deliverableType,
    });

    recordAnonymousUsageEvent({
      anonymousUserId: toAnonymousUserId(input.userId),
      planId: subscription.planId,
      featureId,
      costUsd: Math.max(0, input.costUsd),
      timestamp: new Date().toISOString(),
      source: input.source ?? "orchestration",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "[anonymous-user-analysis] skipped activity record (non-fatal):",
      message,
    );
  }
}

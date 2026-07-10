import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";
import { mapOrchestrationToPopularityFeature } from "@/lib/owner/popularity-ranking/telemetry";

import { toAnonymousUserId } from "./id";
import { recordAnonymousUsageEvent } from "./store";

export function recordAnonymousUserActivity(input: {
  userId?: string | null;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  deliverableType?: DeliverableType;
  costUsd: number;
  source?: "orchestration" | "automation";
}): void {
  if (!input.userId) return;

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
}

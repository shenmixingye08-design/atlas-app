import {
  CANCELLATION_REASON_IDS,
  getCancellationReasonDefinition,
} from "./registry";
import type {
  CancellationEvent,
  CancellationEventSource,
  CancellationReasonId,
} from "./types";
import type { PlanId } from "@/lib/billing/plans/types";

type EventBucket = CancellationEvent[];
type PendingReasonBucket = Map<string, CancellationReasonId>;

function getEventBucket(): EventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasCancellationAnalysisStore?: EventBucket;
  };

  if (!globalScope.__atlasCancellationAnalysisStore) {
    globalScope.__atlasCancellationAnalysisStore = [];
  }

  return globalScope.__atlasCancellationAnalysisStore;
}

function getPendingReasonBucket(): PendingReasonBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasCancellationPendingReasons?: PendingReasonBucket;
  };

  if (!globalScope.__atlasCancellationPendingReasons) {
    globalScope.__atlasCancellationPendingReasons = new Map();
  }

  return globalScope.__atlasCancellationPendingReasons;
}

export function recordCancellationEvent(input: {
  userId: string;
  planId: PlanId;
  reasonId: CancellationReasonId;
  timestamp?: string;
  source?: CancellationEventSource;
}): CancellationEvent {
  getCancellationReasonDefinition(input.reasonId);

  const event: CancellationEvent = {
    userId: input.userId,
    planId: input.planId,
    reasonId: input.reasonId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source ?? "stripe_webhook",
  };

  getEventBucket().push(event);
  return event;
}

export function listCancellationEvents(): CancellationEvent[] {
  return [...getEventBucket()];
}

export function hasCancellationRecords(): boolean {
  return getEventBucket().length > 0;
}

export function setPendingCancellationReason(
  userId: string,
  reasonId: CancellationReasonId,
): void {
  getCancellationReasonDefinition(reasonId);
  getPendingReasonBucket().set(userId, reasonId);
}

export function consumePendingCancellationReason(
  userId: string,
): CancellationReasonId | null {
  const pending = getPendingReasonBucket().get(userId) ?? null;
  if (pending) {
    getPendingReasonBucket().delete(userId);
  }
  return pending;
}

export function resetCancellationAnalysisStore(): void {
  getEventBucket().length = 0;
  getPendingReasonBucket().clear();
}

export function seedCancellationEvents(
  events: readonly CancellationEvent[],
): void {
  getEventBucket().push(...events);
}

export function listCancellationReasonIds(): readonly CancellationReasonId[] {
  return CANCELLATION_REASON_IDS;
}

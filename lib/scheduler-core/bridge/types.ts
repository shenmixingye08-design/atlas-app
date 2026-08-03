/**
 * Phase 2-3 — Scheduler → Durable Queue → Worker Bridge types.
 */

export type BridgeLifecycleState =
  | "Scheduled"
  | "OccurrenceCreated"
  | "RunCreated"
  | "JobCreated"
  | "Queued"
  | "Leased"
  | "Running";

export type OutboxAction = "dispatch_enqueue" | "advance_next_run";

export type EnqueueResult = {
  ok: boolean;
  enqueueResult: "created" | "duplicate" | "failed";
  queueId: string;
  jobId: string | null;
  runId: string | null;
  occurrenceId: string;
  createdAt: string;
  priority: number;
  status: string | null;
  retryPolicy: {
    maxAttempts: number;
    attempt: number;
  };
  errorCode: string | null;
  enqueueLatencyMs: number;
  dispatchLatencyMs: number | null;
};

export type DispatchEnqueuePayload = {
  action: "dispatch_enqueue";
  ownerId: string;
  automationId: string;
  automationName: string;
  occurrenceKey: string;
  scheduledAt: string;
  timezone: string;
  priority: number;
  maxAttempts: number;
  offlineArtifacts: boolean;
  state: BridgeLifecycleState;
};

export type AdvanceNextRunPayload = {
  action: "advance_next_run";
  basis: "scheduledAt";
  scheduledAt: string;
};

export type BridgeMetricsSnapshot = {
  enqueueCount: number;
  duplicateEnqueueCount: number;
  failedEnqueueCount: number;
  retryEnqueueCount: number;
  dispatchedCount: number;
  leaseStartedCount: number;
  averageEnqueueLatencyMs: number | null;
  averageDispatchLatencyMs: number | null;
  averageQueueWaitMs: number | null;
  averageLeaseWaitMs: number | null;
  p95EnqueueLatencyMs: number | null;
  outboxPendingCount: number;
  queueLength: number;
  oldestJobAgeMs: number | null;
  retryQueueLength: number;
  deadLetterLength: number;
  runningCount: number;
  waitingCount: number;
  leasedCount: number;
};

export type DispatcherResult = {
  scanned: number;
  dispatched: number;
  duplicates: number;
  failed: number;
  retried: number;
  nextRunAdvanced: number;
  leaseStarted: number;
  workerCompleted: number;
  workerFailed: number;
  enqueueResults: EnqueueResult[];
};

/** Alias used by public bridge exports / health APIs. */
export type SchedulerLifecycleState = BridgeLifecycleState;
export type SchedulerBridgeMetricsSnapshot = BridgeMetricsSnapshot;
export type SchedulerBridgeDispatchResult = DispatcherResult;
export type OutboxDispatchAction = OutboxAction;

export type SchedulerBridgeHealth = BridgeMetricsSnapshot & {
  status: "ok" | "warn" | "down";
  dispatcherDisabled: boolean;
  queueDisabled: boolean;
  generatedAt: string;
};

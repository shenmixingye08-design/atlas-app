/**
 * Production Blocker #4 — durable entity shapes (DB SoT).
 * Process memory may cache these; never own them.
 */

export type WorkWorkerRecord = {
  workerId: string;
  lastSeenAt: string;
  startedAt: string;
  busy: boolean;
  leaseCount: number;
  status: "active" | "stale" | "stopped";
};

export type WorkExecutionOutcome =
  | "completed"
  | "failed"
  | "retried"
  | "recovered"
  | "interrupted"
  | "cancelled";

export type WorkExecutionRecord = {
  executionId: string;
  jobId: string;
  runId: string;
  workerId: string;
  attempt: number;
  resumeFromStep: number;
  startedAt: string;
  endedAt: string | null;
  outcome: WorkExecutionOutcome | null;
  detail: Record<string, unknown>;
};

export type WorkCompletionEvidenceRecord = {
  evidenceId: string;
  jobId: string;
  runId: string;
  stepId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WorkRecoveryKind =
  | "stuck"
  | "lease_expired"
  | "running_orphan"
  | "retry_due"
  | "worker_boot";

export type WorkRecoveryEventRecord = {
  eventId: string;
  jobId: string | null;
  kind: WorkRecoveryKind;
  success: boolean;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type WorkLockRecord = {
  lockKey: string;
  owner: string;
  expiresAt: string;
  createdAt: string;
};

export type WorkMetricCounterKey =
  | "retry_count"
  | "recovery_count"
  | "duplicate_count"
  | "timeout_count"
  | "notification_count"
  | "job_started_count"
  | "job_completed_count"
  | "job_failed_count";

export type WorkDurabilitySnapshot = {
  storeKind: "file" | "postgres";
  generatedAt: string;
  queue: {
    queued: number;
    waiting: number;
    leased: number;
    running: number;
    retryScheduled: number;
    stuck: number;
    failed: number;
    deadLetter: number;
    completed: number;
    queueLength: number;
  };
  worker: {
    workerCount: number;
    busyPercent: number | null;
    workers: WorkWorkerRecord[];
  };
  retry: {
    scheduled: number;
    totalCount: number;
    recent: Array<{
      jobId: string;
      attempt: number;
      reason: string;
      at: string;
    }>;
  };
  recovery: {
    totalCount: number;
    successRate: number | null;
    recent: WorkRecoveryEventRecord[];
  };
  metrics: {
    startedCount: number;
    completedCount: number;
    failedCount: number;
    successRate: number | null;
    failureRate: number | null;
    averageExecutionMs: number | null;
    p95ExecutionMs: number | null;
    retryCount: number;
    recoveryCount: number;
    duplicateCount: number;
    timeoutCount: number;
    notificationCount: number;
    queueLength: number;
    schedulerLastSuccessAt: string | null;
    alive: boolean;
  };
  lease: {
    leased: number;
    stuck: number;
    active: Array<{
      jobId: string;
      leaseOwner: string | null;
      leaseExpiresAt: string | null;
      heartbeatAt: string | null;
      status: string;
    }>;
  };
  scheduler: {
    alive: boolean;
    lastSuccessAt: string | null;
    averageDelayMs: number | null;
    p95DelayMs: number | null;
  };
  notification: {
    count: number;
    /** Durable notifications domain key (process Map is cache only). */
    durableDomainKey: "atlasNotifications";
    processMemoryIsCacheOnly: true;
  };
  memory: {
    /** Durable Memory health — process buffers are not SoT. */
    sot: "durable_domain";
    durableDomainKey: "atlasPersonalMemory";
    processMemoryIsCacheOnly: true;
    note: string;
  };
  locks: WorkLockRecord[];
};

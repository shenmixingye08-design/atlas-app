import type {
  WorkCompletionEvidenceRecord,
  WorkExecutionOutcome,
  WorkExecutionRecord,
  WorkLockRecord,
  WorkMetricCounterKey,
  WorkRecoveryEventRecord,
  WorkRecoveryKind,
  WorkWorkerRecord,
} from "../durability-types";
import type {
  EnqueueJobInput,
  WorkJobRecord,
  WorkJobStatus,
  WorkQueueMetrics,
  WorkRetryHistoryEntry,
  WorkSideEffectRecord,
  WorkStepRecord,
} from "../types";

export type WorkQueueStore = {
  readonly kind: "file" | "postgres";
  enqueue(input: EnqueueJobInput): Promise<{ job: WorkJobRecord; created: boolean }>;
  /** Batch enqueue with a single persistence round-trip (load tests). */
  enqueueMany?(
    inputs: EnqueueJobInput[],
  ): Promise<Array<{ job: WorkJobRecord; created: boolean }>>;
  leaseJobs(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
    nowMs?: number;
  }): Promise<WorkJobRecord[]>;
  heartbeat(jobId: string, workerId: string, leaseMs: number): Promise<boolean>;
  getJob(jobId: string): Promise<WorkJobRecord | null>;
  updateJob(
    jobId: string,
    patch: Partial<WorkJobRecord> & { status?: WorkJobStatus },
    expectedLeaseOwner?: string,
  ): Promise<WorkJobRecord | null>;
  updateStep(step: WorkStepRecord): Promise<WorkStepRecord>;
  listStuck(nowMs: number, stuckMs: number): Promise<WorkJobRecord[]>;
  listByStatus(status: WorkJobStatus, limit?: number): Promise<WorkJobRecord[]>;
  metrics(nowMs?: number): Promise<WorkQueueMetrics>;
  recordSchedulerSuccess(atIso: string): Promise<void>;
  recordScheduleDelay(delayMs: number): Promise<void>;
  recordExecutionMs(durationMs: number): Promise<void>;
  recordRecovery(success: boolean): Promise<void>;
  /** Durable side-effect idempotency (DB unique / file unique key). */
  getSideEffect(idempotencyKey: string): Promise<WorkSideEffectRecord | null>;
  tryRecordSideEffect(input: {
    idempotencyKey: string;
    jobId: string;
    runId: string;
    stepId: string;
    kind: string;
    result: Record<string, unknown>;
  }): Promise<{ created: boolean; record: WorkSideEffectRecord }>;
  appendRetryHistory(
    jobId: string,
    entry: WorkRetryHistoryEntry,
  ): Promise<void>;
  /** Durable meta for scheduler gate / health — not process memory. */
  readSchedulerMeta?<T>(key: string, fallback: T): Promise<T>;
  writeSchedulerMeta?(key: string, value: unknown): Promise<void>;

  // --- Production Blocker #4 durability surfaces ---
  touchWorker?(
    workerId: string,
    input?: { busy?: boolean; leaseDelta?: number },
  ): Promise<WorkWorkerRecord>;
  listWorkers?(nowMs?: number): Promise<WorkWorkerRecord[]>;
  beginExecution?(input: {
    executionId: string;
    jobId: string;
    runId: string;
    workerId: string;
    attempt: number;
    resumeFromStep: number;
  }): Promise<WorkExecutionRecord>;
  endExecution?(input: {
    executionId: string;
    outcome: WorkExecutionOutcome;
    detail?: Record<string, unknown>;
  }): Promise<void>;
  recordCompletionEvidence?(input: {
    evidenceId: string;
    jobId: string;
    runId: string;
    stepId: string;
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<WorkCompletionEvidenceRecord>;
  listCompletionEvidence?(
    jobId: string,
  ): Promise<WorkCompletionEvidenceRecord[]>;
  recordRecoveryEvent?(input: {
    eventId: string;
    jobId: string | null;
    kind: WorkRecoveryKind;
    success: boolean;
    detail?: Record<string, unknown>;
  }): Promise<WorkRecoveryEventRecord>;
  listRecoveryEvents?(limit?: number): Promise<WorkRecoveryEventRecord[]>;
  incrementMetricCounter?(
    key: WorkMetricCounterKey,
    by?: number,
  ): Promise<number>;
  getMetricCounters?(): Promise<Record<WorkMetricCounterKey, number>>;
  acquireLock?(input: {
    lockKey: string;
    owner: string;
    leaseMs: number;
  }): Promise<{ acquired: boolean; lock: WorkLockRecord | null }>;
  releaseLock?(lockKey: string, owner: string): Promise<boolean>;
  listLocks?(nowMs?: number): Promise<WorkLockRecord[]>;
  listActiveLeases?(limit?: number): Promise<
    Array<{
      jobId: string;
      leaseOwner: string | null;
      leaseExpiresAt: string | null;
      heartbeatAt: string | null;
      status: string;
    }>
  >;
  listRecentRetries?(limit?: number): Promise<
    Array<{
      jobId: string;
      attempt: number;
      reason: string;
      at: string;
    }>
  >;

  resetForTests(): Promise<void>;
};

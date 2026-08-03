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
  resetForTests(): Promise<void>;
};

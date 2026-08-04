import type {
  EnqueueJobInput,
  WorkJobRecord,
  WorkJobStatus,
  WorkQueueMetrics,
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
  resetForTests(): Promise<void>;
  /**
   * Optional atomic stuck reclaim (Postgres). File store emulates with lock.
   */
  reclaimStuckJob?(input: {
    jobId: string;
    nowMs: number;
    stuckMs: number;
    attempt: number;
    retryAt: string | null;
    status: "retry_scheduled" | "failed" | "dead_letter";
    diagnosticId: string;
    lastError: string;
  }): Promise<WorkJobRecord | null>;
};

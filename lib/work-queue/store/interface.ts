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
    workerInstanceId?: string;
  }): Promise<WorkJobRecord[]>;
  heartbeat(
    jobId: string,
    workerId: string,
    leaseMs: number,
    meta?: {
      leaseToken?: string | null;
      leaseVersion?: number | null;
      workerInstanceId?: string | null;
      currentStepId?: string | null;
      currentStage?: string | null;
      progressMarker?: string | null;
      lastExternalActionId?: string | null;
      lastArtifactId?: string | null;
      runId?: string | null;
    },
  ): Promise<boolean>;
  getJob(jobId: string): Promise<WorkJobRecord | null>;
  updateJob(
    jobId: string,
    patch: Partial<WorkJobRecord> & { status?: WorkJobStatus },
    expectedLeaseOwner?: string,
    fence?: {
      leaseToken?: string | null;
      leaseVersion?: number | null;
    },
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
};

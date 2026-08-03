export type WorkJobStatus =
  | "queued"
  | "leased"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "retry_scheduled"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled"
  | "dead_letter";

export type WorkStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type WorkStepType =
  | "generate_deliverable"
  | "upload_storage"
  | "notify_complete"
  | "run_automation"
  | "fixture_work";

export type WorkJobPayload = {
  kind: "automation" | "fixture" | "benchmark";
  assignment?: string;
  automationName?: string;
  requestOrigin?: string | null;
  triggerType?: "automation" | "manual" | "retry";
  /** When true, steps use real local artifact generation without external AI. */
  offlineArtifacts?: boolean;
};

export type WorkStepRecord = {
  stepId: string;
  jobId: string;
  stepIndex: number;
  stepType: WorkStepType;
  status: WorkStepStatus;
  attempt: number;
  inputBindings: Record<string, unknown>;
  outputBindings: Record<string, unknown>;
  artifactIds: string[];
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkJobRecord = {
  jobId: string;
  runId: string;
  automationId: string | null;
  ownerId: string;
  occurrenceKey: string;
  scheduleId: string | null;
  status: WorkJobStatus;
  priority: number;
  availableAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  attempt: number;
  maxAttempts: number;
  retryAt: string | null;
  errorCode: string | null;
  failedStage: string | null;
  diagnosticId: string | null;
  idempotencyKey: string;
  payload: WorkJobPayload;
  resultSummary: string | null;
  firstError: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  steps: WorkStepRecord[];
};

export type EnqueueJobInput = {
  ownerId: string;
  automationId: string | null;
  occurrenceKey: string;
  scheduleId?: string | null;
  scheduledAt?: string | null;
  priority?: number;
  maxAttempts?: number;
  payload: WorkJobPayload;
  steps: Array<{
    stepId: string;
    stepType: WorkStepType;
    inputBindings?: Record<string, unknown>;
  }>;
  idempotencyKey?: string;
};

export type LeaseResult = {
  job: WorkJobRecord;
  leased: boolean;
};

export type WorkQueueMetrics = {
  queued: number;
  /** Alias of queued — Waiting in Scheduler Health vocabulary. */
  waiting: number;
  leased: number;
  running: number;
  retryScheduled: number;
  stuck: number;
  failed: number;
  deadLetter: number;
  completed: number;
  oldestQueuedAgeMs: number | null;
  duplicateCount: number;
  schedulerLastSuccessAt: string | null;
  p95ScheduleDelayMs: number | null;
  p99ScheduleDelayMs: number | null;
  averageDelayMs: number | null;
  p95ExecutionMs: number | null;
  recoverySuccessRate: number | null;
  /** Scheduler Alive — enabled + recent tick (or never started). */
  alive: boolean;
  workerCount: number;
  successRate: number | null;
  failureRate: number | null;
  averageQueueWaitMs: number | null;
  workerBusyPercent: number | null;
};

/** Valid transitions (enforced in store). */
export const WORK_JOB_TRANSITIONS: Readonly<
  Record<WorkJobStatus, readonly WorkJobStatus[]>
> = {
  queued: ["leased", "cancelled"],
  leased: ["running", "queued", "cancelled", "failed"],
  running: [
    "waiting_approval",
    "waiting_input",
    "retry_scheduled",
    "completed",
    "partially_completed",
    "failed",
    "cancelled",
    "dead_letter",
  ],
  waiting_approval: ["queued", "running", "cancelled", "failed"],
  waiting_input: ["queued", "running", "cancelled", "failed"],
  retry_scheduled: ["leased", "queued", "cancelled", "dead_letter"],
  completed: [],
  partially_completed: ["queued", "retry_scheduled", "cancelled"],
  failed: ["queued", "retry_scheduled", "dead_letter"],
  cancelled: [],
  dead_letter: [],
};

/**
 * Phase 1-2 Durable SoT entity types.
 * Foundation only — no business-logic transitions encoded here.
 */

export type DurableRunStatus =
  | "pending"
  | "queued"
  | "leased"
  | "running"
  | "retry_scheduled"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "dead_letter";

export type DurableStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

export type DurableOccurrenceStatus =
  | "reserved"
  | "enqueued"
  | "completed"
  | "cancelled"
  | "failed";

export type DurableRecoveryStatus =
  | "needed"
  | "in_progress"
  | "recovered"
  | "abandoned";

/** Phase 1-4 job recovery ledger statuses. */
export type DurableJobRecoveryStatus =
  | "detected"
  | "assessing"
  | "recovering"
  | "recovered"
  | "manual_review"
  | "failed";

export type DurableQueueStatus =
  | "queued"
  | "leased"
  | "running"
  | "retry"
  | "completed"
  | "failed"
  | "cancelled"
  | "dead_letter";

export type DurableRunRecord = {
  runId: string;
  ownerId: string;
  automationId: string | null;
  jobId: string | null;
  occurrenceId: string | null;
  status: DurableRunStatus;
  triggerType: string;
  payload: Record<string, unknown>;
  resultSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
};

/** Persisted job/queue status — Phase 1-3 minimum + WorkQueueStore compatibility. */
export type DurableJobPersistedStatus =
  | DurableQueueStatus
  | "retry_scheduled"
  | "waiting_approval"
  | "waiting_input"
  | "partially_completed";

export type DurableJobRecord = {
  jobId: string;
  runId: string;
  ownerId: string;
  automationId: string | null;
  occurrenceId: string | null;
  occurrenceKey: string;
  scheduleId: string | null;
  status: DurableJobPersistedStatus;
  priority: number;
  availableAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  leaseToken: string | null;
  leaseVersion: number;
  workerInstanceId: string | null;
  workerStartedAt: string | null;
  heartbeatAt: string | null;
  attempt: number;
  maxAttempts: number;
  retryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  diagnosticId: string | null;
  failedStage: string | null;
  firstError: string | null;
  lastError: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type DurableStepRecord = {
  runId: string;
  stepId: string;
  jobId: string | null;
  stepIndex: number;
  stepType: string;
  status: DurableStepStatus;
  attempt: number;
  inputBindings: Record<string, unknown>;
  outputBindings: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DurableLeaseRecord = {
  runId: string;
  jobId: string | null;
  leaseOwner: string;
  leaseToken: string | null;
  leaseVersion: number;
  leaseExpiresAt: string;
  heartbeatAt: string | null;
  workerStartedAt: string | null;
  workerInstanceId: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  acquiredAt: string;
  updatedAt: string;
  createdAt: string;
};

export type DurableHeartbeatRecord = {
  runId: string;
  jobId: string | null;
  leaseOwner: string;
  leaseToken: string | null;
  heartbeatAt: string;
  currentStepId: string | null;
  currentStage: string | null;
  progressMarker: string | null;
  lastExternalActionId: string | null;
  lastArtifactId: string | null;
  workerInstanceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DurableJobRecoveryRecord = {
  recoveryId: string;
  jobId: string;
  runId: string;
  detectedAt: string;
  detectedReason: string;
  previousLeaseOwner: string | null;
  previousLeaseToken: string | null;
  recoveryWorkerId: string | null;
  recoveryAttempt: number;
  recoveryFromStepId: string | null;
  recoveryStrategy: string | null;
  recoveryStatus: DurableJobRecoveryStatus;
  recoveredAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  diagnosticId: string | null;
  assessment: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DurableRetryStateRecord = {
  runId: string;
  jobId: string | null;
  attempt: number;
  maxAttempts: number;
  retryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DurableRecoveryStateRecord = {
  runId: string;
  jobId: string | null;
  recoveryStatus: DurableRecoveryStatus;
  reason: string | null;
  lastRecoveryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DurableOccurrenceRecord = {
  occurrenceId: string;
  ownerId: string;
  automationId: string;
  occurrenceKey: string;
  scheduleId: string | null;
  scheduledAt: string;
  status: DurableOccurrenceStatus;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type DurableEvidenceRecord = {
  evidenceId: string;
  runId: string;
  jobId: string | null;
  evidenceKind: string;
  evidenceFingerprint: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DurableIdempotencyRecord = {
  scope: string;
  idempotencyKey: string;
  runId: string | null;
  jobId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type CreateDurableRunInput = {
  runId?: string;
  ownerId: string;
  automationId?: string | null;
  jobId?: string | null;
  occurrenceId?: string | null;
  status?: DurableRunStatus;
  triggerType?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  expiresAt?: string | null;
};

export type CreateDurableJobInput = {
  jobId?: string;
  runId: string;
  ownerId: string;
  automationId?: string | null;
  occurrenceId?: string | null;
  occurrenceKey: string;
  scheduleId?: string | null;
  status?: DurableJobPersistedStatus;
  priority?: number;
  availableAt?: string;
  scheduledAt?: string | null;
  maxAttempts?: number;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  expiresAt?: string | null;
};

export type UpdateDurableJobInput = {
  status?: DurableJobPersistedStatus;
  priority?: number;
  availableAt?: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  leaseToken?: string | null;
  leaseVersion?: number;
  workerInstanceId?: string | null;
  workerStartedAt?: string | null;
  heartbeatAt?: string | null;
  attempt?: number;
  maxAttempts?: number;
  retryAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  diagnosticId?: string | null;
  failedStage?: string | null;
  firstError?: string | null;
  lastError?: string | null;
  payload?: Record<string, unknown>;
  resultSummary?: string | null;
  expiresAt?: string | null;
};

export class DurableSotFenceViolationError extends Error {
  readonly code = "DURABLE_SOT_FENCE_VIOLATION" as const;
  constructor(message = "lease fence violation") {
    super(message);
    this.name = "DurableSotFenceViolationError";
  }
}

export type UpdateDurableRunInput = {
  status?: DurableRunStatus;
  jobId?: string | null;
  occurrenceId?: string | null;
  payload?: Record<string, unknown>;
  resultSummary?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
};

export type CreateDurableStepInput = {
  runId: string;
  stepId: string;
  jobId?: string | null;
  stepIndex: number;
  stepType: string;
  status?: DurableStepStatus;
  attempt?: number;
  inputBindings?: Record<string, unknown>;
  outputBindings?: Record<string, unknown>;
};

export type CreateDurableOccurrenceInput = {
  occurrenceId?: string;
  ownerId: string;
  automationId: string;
  occurrenceKey: string;
  scheduleId?: string | null;
  scheduledAt: string;
  status?: DurableOccurrenceStatus;
  runId?: string | null;
  expiresAt?: string | null;
};

export type AppendEvidenceInput = {
  evidenceId?: string;
  runId: string;
  jobId?: string | null;
  evidenceKind: string;
  evidenceFingerprint: string;
  payload?: Record<string, unknown>;
};

export type SaveRetryInput = {
  runId: string;
  jobId?: string | null;
  attempt: number;
  maxAttempts: number;
  retryAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type SaveRecoveryInput = {
  runId: string;
  jobId?: string | null;
  recoveryStatus: DurableRecoveryStatus;
  reason?: string | null;
  lastRecoveryAt?: string | null;
};

export type SaveHeartbeatInput = {
  runId: string;
  jobId?: string | null;
  leaseOwner: string;
  leaseToken?: string | null;
  heartbeatAt?: string;
  currentStepId?: string | null;
  currentStage?: string | null;
  progressMarker?: string | null;
  lastExternalActionId?: string | null;
  lastArtifactId?: string | null;
  workerInstanceId?: string | null;
};

export type AcquireLeaseInput = {
  runId: string;
  jobId?: string | null;
  leaseOwner: string;
  leaseExpiresAt: string;
  leaseToken?: string;
  workerInstanceId?: string | null;
  workerStartedAt?: string | null;
};

export type LeaseFence = {
  jobId: string;
  leaseOwner: string;
  leaseToken: string;
  leaseVersion: number;
};

export type HeartbeatWriteInput = LeaseFence & {
  runId: string;
  heartbeatAt?: string;
  currentStepId?: string | null;
  currentStage?: string | null;
  progressMarker?: string | null;
  lastExternalActionId?: string | null;
  lastArtifactId?: string | null;
  workerInstanceId?: string | null;
  leaseExpiresAt: string;
};

export type CreateJobRecoveryInput = {
  recoveryId?: string;
  jobId: string;
  runId: string;
  detectedReason: string;
  previousLeaseOwner?: string | null;
  previousLeaseToken?: string | null;
  recoveryWorkerId?: string | null;
  recoveryAttempt?: number;
  recoveryFromStepId?: string | null;
  recoveryStrategy?: string | null;
  recoveryStatus?: DurableJobRecoveryStatus;
  diagnosticId?: string | null;
  assessment?: Record<string, unknown>;
};

export type UpdateJobRecoveryInput = {
  recoveryStatus?: DurableJobRecoveryStatus;
  recoveryWorkerId?: string | null;
  recoveryFromStepId?: string | null;
  recoveryStrategy?: string | null;
  recoveredAt?: string | null;
  failedAt?: string | null;
  errorCode?: string | null;
  diagnosticId?: string | null;
  assessment?: Record<string, unknown>;
};

export type RecordIdempotencyInput = {
  scope: string;
  idempotencyKey: string;
  runId?: string | null;
  jobId?: string | null;
  payload?: Record<string, unknown>;
  expiresAt?: string | null;
};

export class DurableSotUniqueViolationError extends Error {
  readonly code = "DURABLE_SOT_UNIQUE_VIOLATION" as const;
  constructor(
    message: string,
    readonly constraint?: string,
  ) {
    super(message);
    this.name = "DurableSotUniqueViolationError";
  }
}

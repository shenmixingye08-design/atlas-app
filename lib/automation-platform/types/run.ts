import type { ResolvedInstruction } from "./instruction";
import type { MemoryReferenceRecord } from "./memory-policy";
import type { AutomationCapabilityId } from "./step";
import type { AutomationRunStatus } from "./status";

export type Timestamp = string;
export type EntityId = string;

export type RunActor =
  | { type: "user"; userId: string }
  | { type: "system"; component: string }
  | { type: "scheduler"; component: string }
  | { type: "worker"; component: string };

export type AutomationRunStatusTransition = {
  previousStatus: AutomationRunStatus;
  nextStatus: AutomationRunStatus;
  timestamp: Timestamp;
  reason: string;
  actor: RunActor;
  diagnosticId: string;
};

export type RunStepStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "skipped"
  | "retrying";

export type AutomationRunStep = {
  id: string;
  capabilityId: AutomationCapabilityId;
  name: string;
  order: number;
  status: RunStepStatus;
  requiresApproval: boolean;
  highRisk: boolean;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  outputSummary: string | null;
  /** Phase 3: provider resource / notification ids produced by this step. */
  externalActionIds?: string[];
  /** Phase 3: artifact ids produced by this step. */
  outputArtifactIds?: string[];
  /** Phase 3: classified failure (retryable / credential_required / …). */
  failureClass?: string | null;
};

export type AutomationRunArtifact = {
  id: string;
  kind: "deliverable" | "external" | "draft" | "file";
  label: string;
  url: string | null;
  externalId: string | null;
  createdAt: Timestamp;
};

export type AutomationRunAttempt = {
  attempt: number;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryScheduledFor: Timestamp | null;
};

export type RunPreparation = {
  summary: string;
  plannedSteps: Array<{
    id: string;
    name: string;
    capabilityId: AutomationCapabilityId;
    highRisk: boolean;
    requiresApproval: boolean;
  }>;
  approvalReason: string | null;
  approvalStepIds: string[];
  externalEffects: string[];
  estimatedDurationLabel: string;
  timezone: string;
  scheduledLabel: string;
  preparedAt: Timestamp;
};

export type RunApprovalRecord = {
  status: "not_required" | "pending" | "approved" | "rejected" | "expired";
  mode: string;
  requestedAt: Timestamp | null;
  decidedAt: Timestamp | null;
  decidedByUserId: string | null;
  comment: string | null;
  stepIds: string[];
};

export type MemoryUsageRecord = {
  used: MemoryReferenceRecord[];
  updated: MemoryReferenceRecord[];
  unusedScopes: string[];
  /** Personal Memory ids actually applied */
  memoryIdsUsed?: string[];
  /** Conflicts detected during resolve */
  memoryConflicts?: Array<{ id: string; message: string; highRisk: boolean }>;
  /** Injection budget diagnostics */
  tokenEstimate?: number;
};

export type AutomationRun = {
  id: EntityId;
  automationId: EntityId;
  automationName: string;
  userId: string;
  status: AutomationRunStatus;
  runKey: string;
  idempotencyKey: string;
  scheduleOccurrenceKey: string | null;
  triggerType: "manual" | "schedule" | "event" | "condition" | "retry";
  scheduledFor: Timestamp | null;
  queuedAt: Timestamp | null;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  durationMs: number | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: Timestamp | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  failedStepId: string | null;
  retryable: boolean;
  needsUserInput: boolean;
  resolvedInstruction: ResolvedInstruction | null;
  memoryUsage: MemoryUsageRecord;
  statusHistory: AutomationRunStatusTransition[];
  preparation: RunPreparation | null;
  approval: RunApprovalRecord | null;
  steps: AutomationRunStep[];
  artifacts: AutomationRunArtifact[];
  attempts: AutomationRunAttempt[];
  approvalExpiresAt: Timestamp | null;
  resultSummary: string | null;
  diagnosticId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /**
   * V2 Completion Evidence — required before product-facing completed.
   * Stored as a plain object for durable serialization.
   */
  completionEvidence?: {
    runId: string;
    jobId: string;
    automationId: string;
    ownerId: string;
    completedStepIds: string[];
    artifactIds: string[];
    storageObjectIds: string[];
    externalActionIds: string[];
    externalUrls: string[];
    notificationIds: string[];
    incompleteOptionalStepIds: string[];
    completionHash: string;
    completedAt: string;
    evidenceVersion: number;
  } | null;
  /** @deprecated use memoryUsage.used */
  memoryReferences: MemoryReferenceRecord[];
};

export type CreateAutomationRunInput = {
  automationId: EntityId;
  userId: string;
  triggerType: AutomationRun["triggerType"];
  scheduledFor?: Timestamp | null;
  runKey: string;
  idempotencyKey: string;
  scheduleOccurrenceKey?: string | null;
  maxAttempts?: number;
  approvalExpiresAt?: Timestamp | null;
  initialStatus?: AutomationRunStatus;
  actor: RunActor;
  reason: string;
};

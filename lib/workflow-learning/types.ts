import type { AutomationV2 } from "@/lib/automation-platform/types";
import type { StepRetryPolicy } from "@/lib/automation-platform/types/step";
import type { AutomationExecutionPolicy } from "@/lib/automation-platform/types/execution-policy";
import type { AutomationNotificationPolicy } from "@/lib/automation-platform/types/notification-policy";

export type WorkflowLearningRiskLevel = "low" | "medium" | "high";

export type WorkflowLearningCandidateStatus =
  | "candidate"
  | "approved"
  | "rejected"
  | "suppressed"
  | "applied"
  | "trial"
  | "expired"
  | "rolled_back";

export type WorkflowLearningCandidateType =
  | "setting_change"
  | "step_order"
  | "step_add"
  | "step_remove"
  | "step_disable"
  | "retry_policy"
  | "timeout"
  | "approval_policy"
  | "notification_policy"
  | "memory_scope"
  | "save_destination"
  | "artifact_format"
  | "ai_call_merge"
  | "cache_reuse"
  | "duplicate_step_remove"
  | "input_check_add"
  | "failure_fallback"
  | "schedule_shift"
  | "cost_reduction";

export type ExpectedBenefit = {
  timeReduction: number;
  costReduction: number;
  failureReduction: number;
  manualStepReduction: number;
};

export type EvidenceItem = {
  kind: "run" | "correction" | "metric" | "pattern";
  label: string;
  runId?: string;
  detail?: string;
};

/** Structured patch — never free-form secret-bearing blobs. */
export type WorkflowLearningPatch =
  | {
      kind: "retry_policy";
      stepId: string;
      retryPolicy: Partial<StepRetryPolicy>;
      /** Never propose increasing attempts alone without backoff/fallback rationale */
      rationale: string;
    }
  | {
      kind: "timeout";
      stepId: string | null;
      timeoutMs: number;
    }
  | {
      kind: "step_order";
      stepIds: string[];
    }
  | {
      kind: "step_enabled";
      stepId: string;
      enabled: boolean;
    }
  | {
      kind: "execution_policy";
      executionPolicy: Partial<AutomationExecutionPolicy>;
    }
  | {
      kind: "notification_policy";
      notificationPolicy: Partial<AutomationNotificationPolicy>;
    }
  | {
      kind: "schedule_shift_minutes";
      delayMinutes: number;
    }
  | {
      kind: "instruction_preference_hint";
      /** Structural note only — preference content belongs in Memory */
      note: string;
    }
  | {
      kind: "disable_duplicate_step";
      stepId: string;
    }
  | {
      kind: "add_input_check";
      afterStepId: string | null;
      name: string;
    };

export type WorkflowLearningCandidate = {
  id: string;
  userId: string;
  automationId: string;
  sourceRunIds: string[];
  type: WorkflowLearningCandidateType;
  summary: string;
  reason: string;
  evidence: EvidenceItem[];
  proposedPatch: WorkflowLearningPatch;
  expectedBenefit: ExpectedBenefit;
  riskLevel: WorkflowLearningRiskLevel;
  confidence: number;
  status: WorkflowLearningCandidateStatus;
  fingerprint: string;
  /** Prefer Memory for this signal instead of workflow change */
  deferToMemory: boolean;
  trialOnly: boolean;
  expiresAt: string | null;
  appliedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRevision = {
  id: string;
  userId: string;
  automationId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  changeReason: string;
  changeSource: "baseline" | "workflow_learning" | "rollback" | "trial" | "user_edit";
  appliedCandidateIds: string[];
  changedFields: string[];
  snapshot: AutomationV2;
  createdAt: string;
  createdBy: string;
  rollbackTarget: string | null;
};

export type WorkflowMetricsSnapshot = {
  runCount: number;
  successRate: number;
  stepSuccessRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  retryRate: number;
  timeoutRate: number;
  manualCorrectionCount: number;
  approvalCount: number;
  needsInputRate: number;
  tokenEstimateTotal: number;
  aiCallEstimate: number;
  estimatedCostUnits: number;
  reeditRate: number;
};

export type MetricsComparison = {
  before: WorkflowMetricsSnapshot;
  after: WorkflowMetricsSnapshot;
  deltas: {
    successRate: number;
    avgDurationMs: number | null;
    retryRate: number;
    estimatedCostUnits: number;
    manualCorrectionCount: number;
    approvalCount: number;
  };
  improved: boolean;
  summary: string;
};

export type TrialRecord = {
  id: string;
  userId: string;
  automationId: string;
  candidateId: string;
  baselineRevisionId: string;
  trialRevisionId: string;
  status: "active" | "completed" | "failed" | "rolled_back" | "cancelled";
  baselineMetrics: WorkflowMetricsSnapshot;
  trialMetrics: WorkflowMetricsSnapshot | null;
  autoRollbackOnFailure: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type CorrectionSignalKind =
  | "shorten_copy"
  | "color_change"
  | "save_destination"
  | "artifact_add"
  | "artifact_remove"
  | "approval_policy"
  | "notification_policy"
  | "filename"
  | "step_order"
  | "step_disable"
  | "other_structural";

export type CorrectionSignal = {
  id: string;
  userId: string;
  automationId: string;
  kind: CorrectionSignalKind;
  fingerprint: string;
  text: string;
  runId: string | null;
  createdAt: string;
  /** If true, route to Personal Memory instead of Workflow Learning */
  isPreference: boolean;
};

export type WorkflowLearningSettings = {
  enabled: boolean;
  notifyDigest: "weekly" | "off" | "high_only";
  allowTrial: boolean;
  autoRollbackTrialOnRegression: boolean;
  thresholds: WorkflowLearningThresholds;
};

export type WorkflowLearningThresholds = {
  shortenCopy: number;
  colorChange: number;
  saveDestination: number;
  artifactAdd: number;
  artifactRemove: number;
  approvalPolicy: number;
  notificationPolicy: number;
  filename: number;
  stepOrder: number;
  stepDisable: number;
  consecutiveStepFailures: number;
  minConfidence: number;
  candidateTtlDays: number;
};

export type WorkflowLearningAuditEntry = {
  id: string;
  userId: string;
  action: string;
  automationId: string | null;
  candidateId: string | null;
  revisionId: string | null;
  outcome: "ok" | "denied" | "error";
  meta: Record<string, string | number | boolean | null>;
  at: string;
};

export const DEFAULT_THRESHOLDS: WorkflowLearningThresholds = {
  shortenCopy: 3,
  colorChange: 3,
  saveDestination: 2,
  artifactAdd: 2,
  artifactRemove: 2,
  approvalPolicy: 2,
  notificationPolicy: 2,
  filename: 3,
  stepOrder: 2,
  stepDisable: 2,
  consecutiveStepFailures: 3,
  minConfidence: 0.55,
  candidateTtlDays: 60,
};

export const DEFAULT_WORKFLOW_LEARNING_SETTINGS: WorkflowLearningSettings = {
  enabled: true,
  notifyDigest: "weekly",
  allowTrial: true,
  autoRollbackTrialOnRegression: true,
  thresholds: DEFAULT_THRESHOLDS,
};

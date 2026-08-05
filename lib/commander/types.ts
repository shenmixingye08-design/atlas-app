import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { EmployeeId, DepartmentId } from "@/lib/employees/types";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import type { ExternalServiceStatus } from "@/lib/integrations/external-services/types";
import type { WorkflowTemplateId } from "@/lib/automations/types";
import type { WorkMemoryType } from "@/lib/work-memory/types";

/** Commander step roles — maps to existing workflow agents / employees. */
export type CommanderPhaseId =
  | "classify"
  | "ceo"
  | "research"
  | "planner"
  | "workers"
  | "review"
  | "external"
  | "report";

/** Lifecycle status for persisted commander runs. */
export type CommanderRunStatus =
  | "planning"
  | "awaiting_confirmation"
  | "running"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled";

export type CommanderSelectedAi = {
  employeeId: EmployeeId;
  name: string;
  role: string;
  department: DepartmentId;
  phase: CommanderPhaseId;
  reason: string;
};

export type CommanderExternalNeed = {
  serviceId: ExternalServiceId | "line" | "stripe";
  label: string;
  required: boolean;
  connectionStatus: ExternalServiceStatus | "unavailable";
  reason: string;
};

export type CommanderTemplateNeed = {
  templateId: WorkflowTemplateId;
  label: string;
  stepIds: string[];
  stepLabels: string[];
  /** From Work Memory taught workflow when present. */
  taughtWorkflowTitle?: string | null;
};

export type CommanderMemoryNeed = {
  workMemoryIds: string[];
  workMemoryTitles: string[];
  workMemoryTypes: WorkMemoryType[];
  learningKeys: string[];
  summary: string;
};

export type CommanderExecutionStep = {
  stepId: string;
  label: string;
  phase: CommanderPhaseId;
  parallelGroup: number;
  employeeIds: EmployeeId[];
  dependsOn: string[];
  parallel: boolean;
};

export type CommanderClassification = {
  deliverableType: DeliverableType;
  templateId: WorkflowTemplateId;
  summary: string;
  keywords: string[];
};

export type CommanderPlan = {
  assignment: string;
  classification: CommanderClassification;
  requiredAis: CommanderSelectedAi[];
  requiredExternalServices: CommanderExternalNeed[];
  requiredTemplate: CommanderTemplateNeed;
  requiredMemory: CommanderMemoryNeed;
  executionOrder: CommanderExecutionStep[];
  maxRetries: number;
  generatedAt: string;
};

export type CommanderAttemptRecord = {
  attempt: number;
  status: "completed" | "failed" | "partial" | "cancelled";
  error: string | null;
  durationMs: number;
};

export type CommanderCompletionReport = {
  status: CommanderRunStatus;
  title: string;
  summary: string;
  classification: string;
  aisUsed: string[];
  externalServices: string[];
  templateLabel: string;
  memoryUsedCount: number;
  attempts: number;
  retriesUsed: number;
  projectHint: string;
  automationHint: string | null;
  confirmationReasons: string[];
};

export type CommanderRunRecord = {
  id: string;
  userId: string;
  assignment: string;
  status: CommanderRunStatus;
  plan: CommanderPlan;
  confirmationReasons: string[];
  attempts: CommanderAttemptRecord[];
  result: OrchestrationResult | null;
  error: string | null;
  workflowRunId: string | null;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommanderVisionGate = {
  status: "vision_failed" | "needs_image_retry" | "needs_input" | "config_missing";
  analysisSuccess: boolean;
  message: string;
  userCode: string;
  diagnosticId?: string | null;
  /** Pipeline stage that failed (upload / AI / artifact / …). */
  failedStage?: string | null;
  /** Japanese label for the failed stage. */
  failedStageLabel?: string | null;
  /** Developer error code (VisionError.code). */
  developerCode?: string | null;
  /** Root cause — never a generic retry-only string when OpenAI details exist. */
  cause?: string | null;
  /** OpenAI error body fields for AI解析失敗画面. */
  openai?: {
    httpStatus: number | null;
    type: string | null;
    code: string | null;
    message: string | null;
    requestId: string | null;
    rawErrorBody: string | null;
  } | null;
  /** Vercel x-vercel-id for log correlation. */
  vercelRequestId?: string | null;
  /** Safe debug only — never includes filenames as content substitutes. */
  payloadAttachmentIds?: string[];
};

/**
 * Durable artifact persistence outcome for work-job / vision completion gates.
 * completed consumers may require projectPersisted (and Word when required).
 */
export type CommanderPersistenceReport = {
  projectId: string | null;
  projectPersisted: boolean;
  wordRequired: boolean;
  wordDeliverableId: string | null;
  /** True when a downloadable Word deliverable id is present and verified. */
  wordCompletionVerified: boolean;
  notificationCreated: boolean;
  wordErrorCode?: string | null;
  wordFailedStep?: string | null;
  /** P0-7: document formats were requested on the server pipeline. */
  artifactsRequired?: boolean;
  /** P0-7: every requested format has durable verified downloadables. */
  artifactsVerified?: boolean;
  /** P0-7: formats exported on the unified pipeline. */
  exportedFormats?: string[];
};

export type CommanderRunResult = {
  runId: string | null;
  status: CommanderRunStatus;
  plan: CommanderPlan;
  result: OrchestrationResult | null;
  report: CommanderCompletionReport;
  attempts: CommanderAttemptRecord[];
  confirmationReasons: string[];
  workMemory?: OrchestrationResult["workMemory"];
  workMemoryCandidates?: unknown[];
  /** Present when image-attached work was blocked before Artifact Engine. */
  visionGate?: CommanderVisionGate;
  /** Artifact / notification persistence for completion gates. */
  persistence?: CommanderPersistenceReport;
};

export type CommanderRequest = {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  /** plan | execute | confirm | cancel */
  mode?: "plan" | "execute" | "confirm" | "cancel";
  /** Required for confirm / cancel. */
  runId?: string;
  /** Explicit user confirmation for critical operations. */
  confirmed?: boolean;
};

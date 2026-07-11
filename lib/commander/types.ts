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

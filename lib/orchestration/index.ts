/**
 * Atlas Orchestration Layer — public exports.
 *
 * Types and workflow metadata are safe for client import.
 * Execution: import from `@/lib/orchestration/orchestrator` (server-only).
 */

export type {
  AgentPhaseResult,
  CeoApprovalRecord,
  ExecutionStepStatus,
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationStatus,
  OrchestrationStep,
  OrchestrationStepError,
  ParseTasksResult,
  QualityCriterionScores,
  QualityLoopResult,
  QualityReviewRecord,
  ResearchAssessment,
  ResearchCategory,
  ResearchReport,
  ResearchStageResult,
  TaskExecutionResult,
  WorkTask,
  KnowledgeUsedResult,
} from "./types";

export {
  buildWorkflowInspectorReport,
  formatContentSignal,
  formatInspectorCost,
  formatInspectorDuration,
  inspectorStageStatusLabel,
  type WorkflowInspectorReport,
  type WorkflowInspectorStageRow,
} from "./workflow-inspector";

export {
  WorkflowState,
  WorkflowStateManager,
  WORKFLOW_TRANSITIONS,
  canTransitionWorkflow,
  hydrateWorkflowState,
  inferWorkflowStateFromResult,
  legacyOrchestrationStatus,
  workflowTransitionDiagramMermaid,
  type WorkflowStateRecord,
  type WorkflowStateTransition,
  type LegacyOrchestrationStatus,
} from "./workflow-state";

export type {
  Deliverable,
  DeliverableType,
  DeliverableMetadata,
  DeliverableDownload,
  WorkerDeliverablePayload,
  /** @deprecated */ WorkflowDeliverable,
  /** @deprecated */ WorkerStructuredOutput,
} from "./deliverable-types";
export {
  emptyDeliverable,
  deliverableHasContent,
  getDeliverablePreviewText,
  isBlogRelatedRequest,
  /** @deprecated */ emptyWorkflowDeliverable,
} from "./deliverable-types";

export {
  hasMeaningfulContent,
  getDeliverableExportText,
  resolveFinalOutputPreview,
} from "./final-deliverable";

export {
  QUALITY_PASS_THRESHOLD,
  MAX_QUALITY_REVISIONS,
} from "./parse-quality";

export {
  WORKER_POOL_DEPARTMENTS,
  assignWorkersToTasks,
} from "./worker-assignment";
export type { WorkerAssignment } from "./worker-assignment";

export { inferDepartmentFromTask } from "@/lib/departments/task-routing";

export { WORKFLOW_PHASES } from "./pipeline";
export type { WorkflowPhaseId } from "./pipeline";

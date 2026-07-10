import type { AgentId } from "@/lib/agents/types";
import type { EmployeeId } from "@/lib/employees/types";
import type {
  ExecutionStepStatus,
  OrchestrationStep,
} from "@/lib/orchestration/types";

import type { EntityId, Timestamp } from "./common";

/**
 * Audit record of one employee/agent step within a workflow run.
 *
 * Relationship: WorkflowRun 1──* EmployeeAction
 * Relationship: EmployeeAction 0..1──* Version (via `employeeActionId`)
 */
export interface EmployeeAction {
  id: EntityId;
  workflowRunId: EntityId;
  employeeId: EmployeeId;
  /** Workflow agent role when the step maps to the agent layer. */
  agentId: AgentId | null;
  step: OrchestrationStep;
  /** Planner task id when the step is worker/reviewer scoped. */
  taskId: number | null;
  status: ExecutionStepStatus;
  /** Truncated or full task prompt sent to the model. */
  inputSummary: string | null;
  /** Model output text for this step. */
  outputText: string | null;
  durationMs: number | null;
  responseId: string | null;
  error: string | null;
  createdAt: Timestamp;
}

export type CreateEmployeeActionInput = {
  workflowRunId: EntityId;
  employeeId: EmployeeId;
  agentId?: AgentId | null;
  step: OrchestrationStep;
  taskId?: number | null;
  status: ExecutionStepStatus;
  inputSummary?: string | null;
  outputText?: string | null;
  durationMs?: number | null;
  responseId?: string | null;
  error?: string | null;
};

export type EmployeeActionFilter = {
  workflowRunId?: EntityId;
  employeeId?: EmployeeId;
  step?: OrchestrationStep | OrchestrationStep[];
  taskId?: number;
  ids?: EntityId[];
};

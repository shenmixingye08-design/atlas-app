import type { AgentId } from "@/lib/agents/types";

import { OrchestrationTimeoutError } from "./timeout";
import type { OrchestrationStep, OrchestrationStepError } from "./types";

export type PipelineFailureInfo = {
  department: string;
  reason: string;
  recommendedAction: string;
  step: OrchestrationStep;
  agentId: AgentId;
  taskId?: number;
};

export class PipelineFailure extends Error {
  readonly info: PipelineFailureInfo;

  constructor(info: PipelineFailureInfo) {
    super(formatPipelineFailureMessage(info));
    this.name = "PipelineFailure";
    this.info = info;
  }
}

const DEPARTMENT_BY_STEP: Partial<Record<OrchestrationStep, string>> = {
  ceo: "CEO",
  research_assessment: "Research",
  research_report: "Research",
  planner_plan: "Planner",
  planner_tasks: "Planner",
  worker: "Production",
  reviewer: "Quality Assurance",
  quality_assurance: "Quality Assurance",
  ceo_approval: "CEO",
  final_deliverable: "Deliverable Builder",
};

export function formatPipelineFailureMessage(info: PipelineFailureInfo): string {
  return [
    `[${info.department}] ${info.reason}`,
    `Recommended action: ${info.recommendedAction}`,
  ].join("\n");
}

export function createPipelineFailure(
  step: OrchestrationStep,
  agentId: AgentId,
  reason: string,
  recommendedAction: string,
  taskId?: number,
): PipelineFailure {
  return new PipelineFailure({
    department: DEPARTMENT_BY_STEP[step] ?? "Orchestration",
    reason,
    recommendedAction,
    step,
    agentId,
    taskId,
  });
}

export function formatStepErrorMessage(stepError: OrchestrationStepError): string {
  const taskPart =
    stepError.taskId !== undefined ? ` (task ${stepError.taskId})` : "";
  const timeoutPart = stepError.timedOut ? " [timed out]" : "";
  const department = DEPARTMENT_BY_STEP[stepError.step] ?? "Orchestration";

  return `[${department}] ${stepError.step}${taskPart} failed${timeoutPart}: ${stepError.message}`;
}

export function toStepError(
  error: unknown,
  step: OrchestrationStep,
  agentId: AgentId,
  taskId?: number,
): OrchestrationStepError {
  if (error instanceof PipelineFailure) {
    return {
      step: error.info.step,
      agentId: error.info.agentId,
      message: error.info.reason,
      taskId: error.info.taskId ?? taskId,
      cause: error.name,
      timedOut: false,
    };
  }

  if (error instanceof OrchestrationTimeoutError) {
    return {
      step: error.step,
      agentId,
      message: error.message,
      taskId,
      timedOut: true,
    };
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  return {
    step,
    agentId,
    message,
    taskId,
    cause: error instanceof Error ? error.name : undefined,
    timedOut: false,
  };
}

export function pipelineFailureFromError(
  error: unknown,
  step: OrchestrationStep,
  agentId: AgentId,
  taskId?: number,
): PipelineFailureInfo | null {
  if (error instanceof PipelineFailure) {
    return error.info;
  }

  const stepError = toStepError(error, step, agentId, taskId);
  return {
    department: DEPARTMENT_BY_STEP[stepError.step] ?? "Orchestration",
    reason: stepError.message,
    recommendedAction: stepError.timedOut
      ? "Retry the request with a shorter assignment or check service availability."
      : "Review the assignment and retry. If the issue persists, contact support with the step error.",
    step: stepError.step,
    agentId: stepError.agentId,
    taskId: stepError.taskId,
  };
}

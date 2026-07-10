import type { OrchestrationResult, TaskExecutionResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";

import { getTaskDependencyLabels, topologicalSortTasks } from "./dependencies";
import { getEmployeeDisplayMeta } from "./employee-map";
import type { TeamCollaborationSnapshot, TeamCollaborationStage, TeamHandoff } from "./types";

function executionStatus(execution: TaskExecutionResult): TeamCollaborationStage["status"] {
  if (
    execution.workerStatus === "failed" ||
    execution.reviewerStatus === "failed" ||
    execution.workerError ||
    execution.reviewerError
  ) {
    return "error";
  }
  if (execution.workerStatus === "completed") return "completed";
  return "waiting";
}

function buildHandoffs(
  executions: TaskExecutionResult[],
  tasks: OrchestrationResult["tasks"],
): TeamHandoff[] {
  const handoffs: TeamHandoff[] = [];
  const sorted = topologicalSortTasks(tasks);

  let previousEmployee: { id: string; name: string } | null = null;

  if (sorted.length > 0) {
    const plannerMeta = getEmployeeDisplayMeta("planning-lead-planner");
    const firstExec = executions.find((e) => e.task.id === sorted[0]!.id);
    if (firstExec) {
      const firstMeta = getEmployeeDisplayMeta(firstExec.assignedEmployeeId);
      handoffs.push({
        fromEmployeeId: plannerMeta.name,
        fromEmployeeName: ui.teamCollaboration.roles.planner,
        toEmployeeId: firstMeta.name,
        toEmployeeName: firstMeta.name,
        taskTitle: sorted[0]!.title,
        reason: ui.teamCollaboration.handoffPlanner,
      });
      previousEmployee = { id: firstMeta.name, name: firstMeta.name };
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const task = sorted[i]!;
    const execution = executions.find((e) => e.task.id === task.id);
    if (!execution) continue;

    const meta = getEmployeeDisplayMeta(execution.assignedEmployeeId);
    handoffs.push({
      fromEmployeeId: previousEmployee?.id ?? ui.teamCollaboration.roles.planner,
      fromEmployeeName: previousEmployee?.name ?? ui.teamCollaboration.roles.planner,
      toEmployeeId: meta.name,
      toEmployeeName: meta.name,
      taskTitle: task.title,
      reason: ui.teamCollaboration.handoffTask,
    });
    previousEmployee = { id: meta.name, name: meta.name };
  }

  return handoffs;
}

export function buildTeamCollaborationSnapshot(
  result: OrchestrationResult,
): TeamCollaborationSnapshot {
  const stages: TeamCollaborationStage[] = [];
  const sortedTasks = topologicalSortTasks(result.tasks);

  if (result.plannerPlan || result.plannerTasks) {
    stages.push({
      id: "planner",
      icon: "📋",
      title: ui.teamCollaboration.roles.planner,
      description: ui.teamCollaboration.plannerDecompose(sortedTasks.length),
      employeeId: "planning-lead-planner",
      employeeName: ui.teamCollaboration.roles.planner,
      departmentLabel: ui.aiEmployees.departments.materials.name,
      status: sortedTasks.length > 0 ? "completed" : "waiting",
      durationMs: result.plannerPlan?.durationMs ?? result.plannerTasks?.durationMs,
    });
  }

  for (const task of sortedTasks) {
    const execution = result.executions.find((e) => e.task.id === task.id);
    const meta = execution
      ? getEmployeeDisplayMeta(execution.assignedEmployeeId)
      : getEmployeeDisplayMeta("development-senior-dev");

    const deps = getTaskDependencyLabels(task, result.tasks);
    const status = execution ? executionStatus(execution) : "waiting";
    const reassigned =
      execution?.workerError?.includes("reassigned") ?? false;

    stages.push({
      id: `task-${task.id}`,
      icon: meta.icon,
      title: task.title,
      description:
        deps.length > 0
          ? ui.teamCollaboration.dependsOn(deps.join(" → "))
          : meta.departmentLabel,
      employeeId: execution?.assignedEmployeeId,
      employeeName: meta.name,
      departmentLabel: meta.departmentLabel,
      status,
      durationMs: execution?.worker?.durationMs,
      errorMessage: execution?.workerError ?? execution?.reviewerError,
      dependsOn: deps,
      reassigned,
    });
  }

  if (result.qualityLoop) {
    const lastReview = result.qualityLoop.reviews.at(-1);
    stages.push({
      id: "final-review",
      icon: "🧐",
      title: ui.teamCollaboration.finalReview,
      description: ui.teamCollaboration.finalReviewHint,
      employeeId: "qa-quality-lead",
      employeeName: ui.teamCollaboration.roles.qa,
      departmentLabel: ui.aiEmployees.departments.quality.name,
      status: lastReview?.passed ? "completed" : lastReview ? "error" : "waiting",
      durationMs: lastReview?.qa?.durationMs,
    });
  }

  stages.push({
    id: "delivery",
    icon: "📦",
    title: ui.teamCollaboration.reportToUser,
    description: result.finalResponse.slice(0, 120) || ui.teamCollaboration.reportPending,
    employeeId: "planning-lead-planner",
    employeeName: ui.teamCollaboration.roles.planner,
    departmentLabel: ui.aiEmployees.departments.delivery.name,
    status: result.approved && result.status !== "failed" ? "completed" : "running",
    durationMs: result.totalDurationMs,
  });

  const handoffs = buildHandoffs(result.executions, result.tasks);
  const activeEmployeeIds = result.executions
    .filter((e) => e.workerStatus !== "completed" && e.workerStatus !== "skipped")
    .map((e) => e.assignedEmployeeId);

  return {
    stages,
    handoffs,
    activeEmployeeIds,
    mergedDeliverableReady: Boolean(result.deliverable?.title),
    finalReviewPassed: result.approved,
  };
}

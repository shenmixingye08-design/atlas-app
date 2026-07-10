import type { WorkflowPhaseState } from "@/lib/workspace/types";

import { defaultVisibleAiEmployeeDepartments } from "./registry";
import type {
  AiEmployeeDepartmentId,
  AiEmployeeDisplayState,
  AiEmployeeStatus,
  AiEmployeeTaskLabels,
} from "./types";

/** Maps orchestration loading phase IDs to user-facing AI employee departments. */
const PHASE_TO_DEPARTMENT: Readonly<Record<string, AiEmployeeDepartmentId>> = {
  ceo: "sales",
  research: "sales",
  "planner-plan": "materials",
  "planner-tasks": "materials",
  reviewer: "quality",
  "quality-assurance": "quality",
  "ceo-approval": "quality",
  "final-deliverable": "delivery",
};

function resolveDepartmentForPhase(phaseId: string): AiEmployeeDepartmentId {
  if (phaseId.startsWith("worker-")) {
    return "materials";
  }
  return PHASE_TO_DEPARTMENT[phaseId] ?? "materials";
}

function taskForStatus(
  status: AiEmployeeStatus,
  labels: AiEmployeeTaskLabels,
): string {
  switch (status) {
    case "running":
      return labels.running;
    case "completed":
      return labels.completed;
    case "error":
      return labels.error;
    default:
      return labels.waiting;
  }
}

function resolveDepartmentIndex(phaseId: string): number {
  const departmentId = resolveDepartmentForPhase(phaseId);
  return defaultVisibleAiEmployeeDepartments.findIndex(
    (dept) => dept.id === departmentId,
  );
}

function findActiveDepartmentIndex(phases: WorkflowPhaseState[]): number {
  const runningPhase = phases.find((phase) => phase.status === "running");
  if (runningPhase) {
    return resolveDepartmentIndex(runningPhase.id);
  }

  const errorPhase = phases.find((phase) => phase.status === "error");
  if (errorPhase) {
    return resolveDepartmentIndex(errorPhase.id);
  }

  const firstWaiting = phases.find((phase) => phase.status === "waiting");
  if (firstWaiting) {
    return resolveDepartmentIndex(firstWaiting.id);
  }

  return defaultVisibleAiEmployeeDepartments.length - 1;
}

export function mapWorkflowPhasesToAiEmployees(
  phases: WorkflowPhaseState[],
  options?: { isComplete?: boolean },
): AiEmployeeDisplayState[] {
  const isComplete = options?.isComplete ?? false;
  const activeIndex = isComplete
    ? defaultVisibleAiEmployeeDepartments.length
    : findActiveDepartmentIndex(phases);

  const errorDepartmentIndex = phases.some((phase) => phase.status === "error")
    ? findActiveDepartmentIndex(phases)
    : -1;

  return defaultVisibleAiEmployeeDepartments.map((department, index) => {
    let status: AiEmployeeStatus = "waiting";

    if (isComplete) {
      status = "completed";
    } else if (index < activeIndex) {
      status = "completed";
    } else if (index === activeIndex) {
      status = index === errorDepartmentIndex ? "error" : "running";
    }

    return {
      id: department.id,
      icon: department.icon,
      name: department.name,
      task: taskForStatus(status, department.tasks),
      status,
    };
  });
}

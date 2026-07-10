import { DEFAULT_WORKFLOW_EMPLOYEE_IDS } from "@/lib/employees/registry";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { hasMeaningfulContent } from "@/lib/orchestration/final-deliverable";

import type { CreateProjectInput, Project, ProjectStatus } from "./types";
import { migrateOrchestrationResult } from "./migrate-result";

/** Normalize persisted projects and migrate legacy deliverable shapes. */
export function normalizeProjects(projects: Project[]): Project[] {
  return projects.map((project) => {
    if (!project.result) return project;

    return {
      ...project,
      result: migrateOrchestrationResult(project.result),
    };
  });
}

export function createProject(input: CreateProjectInput): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    workRequest: input.workRequest.trim(),
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [...DEFAULT_WORKFLOW_EMPLOYEE_IDS],
    result: null,
  };
}

function deriveProjectTitle(workRequest: string): string {
  const firstLine = workRequest.split("\n")[0]?.trim() ?? workRequest.trim();
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 57)}...`;
}

function statusAndProgressFromOrchestration(result: OrchestrationResult): {
  status: ProjectStatus;
  progress: number;
} {
  if (result.status === "failed") {
    return { status: "review", progress: computePartialProgress(result) };
  }

  if (!hasMeaningfulContent(getDeliverablePreviewText(result.deliverable))) {
    return { status: "review", progress: 85 };
  }

  if (result.approved) {
    return { status: "completed", progress: 100 };
  }

  if (result.qualityLoop?.passed) {
    return { status: "review", progress: 95 };
  }

  return { status: "review", progress: 90 };
}

function computePartialProgress(result: OrchestrationResult): number {
  let completedSteps = 1;
  if (result.ceo) completedSteps += 1;
  if (result.research) completedSteps += 1;
  if (result.plannerPlan) completedSteps += 1;
  if (result.plannerTasks) completedSteps += 1;
  completedSteps += result.executions.length * 2;
  if (result.qualityLoop) {
    completedSteps += result.qualityLoop.reviews.length;
    if (result.qualityLoop.ceoApproval?.status === "completed") {
      completedSteps += 1;
    }
  }

  const taskCount = Math.max(result.tasks.length, 1);
  const totalSteps = 7 + taskCount * 2 + 1;

  return Math.min(90, Math.round((completedSteps / totalSteps) * 100));
}

export function createProjectFromOrchestration(
  workRequest: string,
  result: OrchestrationResult,
): Project {
  const now = new Date().toISOString();
  const { status, progress } = statusAndProgressFromOrchestration(result);

  return {
    id: crypto.randomUUID(),
    title: deriveProjectTitle(workRequest),
    workRequest: workRequest.trim(),
    status,
    progress,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [...DEFAULT_WORKFLOW_EMPLOYEE_IDS],
    result,
    ...(result.error ? { error: result.error } : {}),
  };
}

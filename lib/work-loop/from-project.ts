import type { Project } from "@/lib/projects/types";

import type { SuccessfulJob } from "./repeat-detection";

export function projectToSuccessfulJob(
  project: Project,
  userId: string,
): SuccessfulJob | null {
  if (project.status !== "completed" || project.result?.status !== "completed") {
    return null;
  }
  return {
    id: project.id,
    userId,
    title: project.title,
    assignment: project.workRequest,
    completedAt: project.updatedAt,
    status: "completed",
    deliverableFormat: project.result.deliverable?.type ?? null,
    services: [],
  };
}

import type { Project } from "@/lib/projects/types";
import type { Deliverable } from "./types";

export type DeliverableCandidate = {
  projectId?: string;
  status?: string;
  result?: unknown;
  deliverable?: Partial<Deliverable> | null;
  ownerUserId?: string | null;
  currentUserId?: string | null;
};

/** True when a deliverable has a real, validated, non-empty file owned by the user. */
export function isDeliverableCompleted(
  candidate: DeliverableCandidate,
): boolean {
  const deliverable = candidate.deliverable;
  if (deliverable) {
    if (deliverable.isPlaceholder) return false;
    if (deliverable.validationPassed === false) return false;
    if (typeof deliverable.sizeBytes === "number" && deliverable.sizeBytes <= 0) {
      return false;
    }
    if (
      candidate.currentUserId &&
      candidate.ownerUserId &&
      candidate.ownerUserId !== candidate.currentUserId
    ) {
      return false;
    }
    return Boolean(deliverable.downloadUrl || deliverable.fileName);
  }

  if (candidate.status !== "completed") return false;
  if (!candidate.result) return false;
  return true;
}

/** Filter projects that have real completed deliverables for the list UI. */
export function filterCompletedDeliverableProjects(
  projects: readonly Project[],
): Project[] {
  return projects.filter((project) =>
    isDeliverableCompleted({
      projectId: project.id,
      status: project.status,
      result: project.result,
    }),
  );
}

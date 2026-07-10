import type { AssignedEmployeeRef } from "@/lib/projects/types";

import type { EntityId, Timestamp, UserId } from "./common";

/** Lifecycle state for a memory-backed project. */
export type MemoryProjectStatus =
  | "pending"
  | "running"
  | "review"
  | "completed"
  | "archived";

/**
 * Canonical project record for long-term memory.
 *
 * Replaces the flat `lib/projects/types.Project` blob over time.
 * Orchestration output is stored on {@link WorkflowRun}, not embedded here.
 *
 * Relationship: User 1──* Project
 */
export interface Project {
  id: EntityId;
  userId: UserId;
  title: string;
  /** Original work assignment / brief from the user. */
  workRequest: string;
  status: MemoryProjectStatus;
  /** 0–100 completion indicator for dashboards. */
  progress: number;
  assignedEmployees: AssignedEmployeeRef[];
  /** Id of the most recent workflow run, if any. */
  latestWorkflowRunId: EntityId | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt: Timestamp | null;
}

export type CreateProjectInput = {
  userId: UserId;
  title: string;
  workRequest: string;
  assignedEmployees?: AssignedEmployeeRef[];
  status?: MemoryProjectStatus;
  progress?: number;
};

export type UpdateProjectInput = Partial<
  Pick<
    Project,
    | "title"
    | "workRequest"
    | "status"
    | "progress"
    | "assignedEmployees"
    | "latestWorkflowRunId"
    | "archivedAt"
  >
> & {
  id: EntityId;
};

export type ProjectFilter = {
  userId?: UserId;
  ids?: EntityId[];
  status?: MemoryProjectStatus | MemoryProjectStatus[];
  search?: string;
  includeArchived?: boolean;
};

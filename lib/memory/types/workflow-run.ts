import type { OrchestrationResult, OrchestrationStatus } from "@/lib/orchestration/types";

import type { EntityId, Timestamp, UserId } from "./common";

/** How a workflow run was initiated. */
export type WorkflowRunTriggerType =
  | "manual"
  | "automation"
  | "test"
  | "webhook"
  | "email"
  | "calendar";

/**
 * One execution of the multi-agent orchestration pipeline for a project.
 *
 * Relationship: Project 1──* WorkflowRun
 * Relationship: WorkflowRun 1──* EmployeeAction
 * Relationship: WorkflowRun 1──* Artifact
 *
 * `result` preserves the full {@link OrchestrationResult} for replay and audit.
 */
export interface WorkflowRun {
  id: EntityId;
  projectId: EntityId;
  /** User who triggered the run; null for automated or sample runs. */
  userId: UserId | null;
  assignment: string;
  status: OrchestrationStatus;
  approved: boolean;
  totalDurationMs: number;
  /** Denormalized final response for list views without loading full result. */
  finalResponsePreview: string | null;
  /** Full pipeline snapshot — stored as JSON in Supabase. */
  result: OrchestrationResult | null;
  error: string | null;
  /** When triggered by an automation definition. */
  automationId?: EntityId | null;
  /** Initiation channel for this run. */
  triggerType?: WorkflowRunTriggerType;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

export type CreateWorkflowRunInput = {
  projectId: EntityId;
  userId?: UserId | null;
  assignment: string;
  startedAt?: Timestamp;
  automationId?: EntityId | null;
  triggerType?: WorkflowRunTriggerType;
};

export type CompleteWorkflowRunInput = {
  id: EntityId;
  status: OrchestrationStatus;
  approved: boolean;
  totalDurationMs: number;
  result: OrchestrationResult;
  finalResponsePreview?: string | null;
  error?: string | null;
  completedAt?: Timestamp;
};

export type WorkflowRunFilter = {
  projectId?: EntityId;
  userId?: UserId;
  status?: OrchestrationStatus | OrchestrationStatus[];
  ids?: EntityId[];
  /** Filter runs triggered by a specific automation. */
  automationId?: EntityId;
};

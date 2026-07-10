import type {
  CompleteWorkflowRunInput,
  CreateWorkflowRunInput,
  PageRequest,
  PageResult,
  WorkflowRun,
  WorkflowRunFilter,
} from "../types";

/**
 * Persistence contract for {@link WorkflowRun} pipeline executions.
 * Supabase: `workflow_runs` table; `result` stored as `jsonb`.
 */
export interface WorkflowRunRepository {
  findById(id: string): Promise<WorkflowRun | null>;
  findMany(
    filter?: WorkflowRunFilter,
    page?: PageRequest,
  ): Promise<PageResult<WorkflowRun>>;
  start(input: CreateWorkflowRunInput): Promise<WorkflowRun>;
  complete(input: CompleteWorkflowRunInput): Promise<WorkflowRun>;
  delete(id: string): Promise<void>;
}

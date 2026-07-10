import type {
  CreateEmployeeActionInput,
  EmployeeAction,
  EmployeeActionFilter,
  PageRequest,
  PageResult,
} from "../types";

/**
 * Persistence contract for {@link EmployeeAction} audit rows.
 * Supabase: `employee_actions` table; index on `(workflow_run_id, step)`.
 */
export interface EmployeeActionRepository {
  findById(id: string): Promise<EmployeeAction | null>;
  findMany(
    filter?: EmployeeActionFilter,
    page?: PageRequest,
  ): Promise<PageResult<EmployeeAction>>;
  /** Record a completed or failed pipeline step. */
  record(input: CreateEmployeeActionInput): Promise<EmployeeAction>;
  /** Batch insert for parallel worker/reviewer steps. */
  recordMany(inputs: CreateEmployeeActionInput[]): Promise<EmployeeAction[]>;
  deleteByWorkflowRunId(workflowRunId: string): Promise<void>;
}

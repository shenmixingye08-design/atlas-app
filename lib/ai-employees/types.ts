import type { StepStatus } from "@/lib/workspace/types";

/** User-facing AI employee department identifiers (extensible registry). */
export type AiEmployeeDepartmentId =
  | "sales"
  | "materials"
  | "quality"
  | "delivery"
  | "sns"
  | "video"
  | "accounting"
  | "secretary";

export type AiEmployeeStatus = StepStatus;

export type AiEmployeeTaskLabels = {
  waiting: string;
  running: string;
  completed: string;
  error: string;
};

export type AiEmployeeDepartmentDefinition = {
  id: AiEmployeeDepartmentId;
  icon: string;
  name: string;
  tasks: AiEmployeeTaskLabels;
  /** Shown in the default work-execution visualization. */
  defaultVisible: boolean;
  /** Lower numbers appear first in the team panel. */
  sortOrder: number;
};

export type AiEmployeeDisplayState = {
  id: AiEmployeeDepartmentId;
  icon: string;
  name: string;
  task: string;
  status: AiEmployeeStatus;
};

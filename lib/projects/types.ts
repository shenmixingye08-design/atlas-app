import type { AgentId } from "@/lib/agents/types";
import type { EmployeeId } from "@/lib/employees/types";
import type { OrchestrationResult } from "@/lib/orchestration/types";

export type ProjectStatus = "pending" | "running" | "review" | "completed";

/**
 * Employee reference stored on a project.
 * Prefer canonical {@link EmployeeId}; legacy workflow {@link AgentId} values
 * from older saves are resolved at display time.
 */
export type AssignedEmployeeRef = EmployeeId | AgentId;

export type Project = {
  id: string;
  title: string;
  workRequest: string;
  status: ProjectStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  assignedEmployees: AssignedEmployeeRef[];
  result: OrchestrationResult | null;
  error?: string;
};

export type CreateProjectInput = {
  title: string;
  workRequest: string;
};

import type { OrchestrationResult } from "@/lib/orchestration/types";

import type { AssignedEmployeeRef, Project, ProjectStatus } from "../types";

/** Postgres table name — create via migration before enabling Supabase storage. */
export const PROJECTS_TABLE = "projects" as const;

/** Row shape for the `projects` table (snake_case columns). */
export type ProjectRow = {
  id: string;
  user_id: string | null;
  title: string;
  work_request: string;
  status: ProjectStatus;
  progress: number;
  assigned_employees: AssignedEmployeeRef[];
  result: OrchestrationResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export function mapProjectToRow(
  project: Project,
  userId: string | null = null,
): ProjectRow {
  return {
    id: project.id,
    user_id: userId,
    title: project.title,
    work_request: project.workRequest,
    status: project.status,
    progress: project.progress,
    assigned_employees: project.assignedEmployees,
    result: project.result,
    error: project.error ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

export function mapRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    workRequest: row.work_request,
    status: row.status,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedEmployees: row.assigned_employees ?? [],
    result: (row.result as OrchestrationResult | null) ?? null,
    ...(row.error ? { error: row.error } : {}),
  };
}

export function mapRowsToProjects(rows: ProjectRow[]): Project[] {
  return rows.map(mapRowToProject);
}

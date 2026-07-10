import type {
  CreateProjectInput,
  PageRequest,
  PageResult,
  Project,
  ProjectFilter,
  SortDirection,
  UpdateProjectInput,
} from "../types";

/**
 * Persistence contract for memory {@link Project} records.
 * Supabase: `projects` table with RLS scoped to `user_id`.
 */
export interface MemoryProjectRepository {
  findById(id: string): Promise<Project | null>;
  findMany(
    filter?: ProjectFilter,
    page?: PageRequest,
    sort?: { field: "createdAt" | "updatedAt"; direction: SortDirection },
  ): Promise<PageResult<Project>>;
  create(input: CreateProjectInput): Promise<Project>;
  update(input: UpdateProjectInput): Promise<Project>;
  delete(id: string): Promise<void>;
}

import type { Project } from "../types";

/**
 * Persistence contract for projects.
 * Implementations: localStorage today, Supabase (or other DB) later.
 */
export interface ProjectRepository {
  /** Load all projects from the backing store. */
  list(): Project[];

  /** Replace the full project collection in the backing store. */
  save(projects: Project[]): void;
}

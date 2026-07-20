import {
  createProject,
  createProjectFromOrchestration,
} from "./domain";
import { createProjectRepository } from "./repository-provider";
import type { ProjectRepositoryFactoryOptions } from "./repository-provider";
import type { ProjectRepository } from "./repositories/types";
import type { CreateProjectInput, Project } from "./types";
import type { OrchestrationResult } from "@/lib/orchestration/types";

/**
 * Application service for project CRUD.
 * UI and workspace code should call this — not localStorage or Supabase directly.
 */
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  /** Access the underlying repository (e.g. call Supabase `hydrate()`). */
  getRepository(): ProjectRepository {
    return this.repository;
  }

  list(): Project[] {
    return this.repository.list();
  }

  getById(id: string): Project | null {
    return this.repository.list().find((project) => project.id === id) ?? null;
  }

  saveAll(projects: Project[]): void {
    this.repository.save(projects);
  }

  addProject(input: CreateProjectInput, current: Project[]): Project {
    const project = createProject(input);
    this.repository.save([project, ...current]);
    return project;
  }

  removeProject(id: string, current: Project[]): void {
    this.repository.save(current.filter((project) => project.id !== id));
    void import("@/lib/owner/audit-log/client")
      .then(({ reportClientAuditEvent }) => {
        reportClientAuditEvent({
          action: "request_delete",
          targetId: id,
          result: "success",
          reason: "project deleted",
        });
      })
      .catch(() => {
        // best-effort
      });
  }

  saveFromOrchestration(
    workRequest: string,
    result: OrchestrationResult,
    /** Optional stable id — dedupes when the same run is saved again. */
    id?: string,
  ): Project {
    const project = createProjectFromOrchestration(workRequest, result, id);
    const existing = this.repository
      .list()
      .filter((item) => item.id !== project.id);
    this.repository.save([project, ...existing]);
    return project;
  }
}

export type CreateProjectServiceOptions = ProjectRepositoryFactoryOptions & {
  repository?: ProjectRepository;
};

/** Build a service with an explicit or env-selected repository backend. */
export function createProjectService(
  options: CreateProjectServiceOptions = {},
): ProjectService {
  const repository =
    options.repository ?? createProjectRepository(options);
  return new ProjectService(repository);
}

/** Default service — localStorage unless `NEXT_PUBLIC_ATLAS_PROJECT_STORAGE=supabase`. */
export const projectService = createProjectService();
